-- 동시에 여러 AI 요청이 들어와도 사용자별 월 비용 상한을 넘지 않도록
-- 요청 시작 전에 예상 비용을 원자적으로 예약하고, 실제 비용이 기록되면 예약액을 정산한다.

create table public.ai_budget_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(10, 6) not null check (amount_usd > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index ai_budget_reservations_owner_expires_idx
  on public.ai_budget_reservations(owner_id, expires_at, created_at);

alter table public.ai_budget_reservations enable row level security;

-- 이 테이블은 서버의 service_role RPC만 사용한다. 클라이언트 직접 접근 정책은 만들지 않는다.
revoke all on table public.ai_budget_reservations from public, anon, authenticated;
grant all on table public.ai_budget_reservations to service_role;

create or replace function public.reserve_monthly_ai_budget(
  p_owner_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_budget_usd numeric,
  p_reserve_usd numeric,
  p_expires_at timestamptz
)
returns table (
  allowed boolean,
  spent_usd numeric,
  reserved_usd numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spent numeric := 0;
  v_reserved numeric := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_budget_usd <= 0 or p_reserve_usd <= 0 or p_end <= p_start or p_expires_at <= now() then
    raise exception 'invalid budget reservation' using errcode = '22023';
  end if;

  -- 같은 사용자의 검사와 INSERT를 한 트랜잭션씩 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 0));

  -- 다음 요청이 들어오지 않는 사용자 행까지 함께 정리해 테이블이 계속 커지지 않게 한다.
  delete from public.ai_budget_reservations where expires_at <= now();

  select coalesce(sum(cost_usd), 0) into v_spent
  from (
    select g.cost_usd
    from public.generations g
    where g.owner_id = p_owner_id
      and g.created_at >= p_start
      and g.created_at < p_end
    union all
    select m.cost_usd
    from public.chat_messages m
    where m.owner_id = p_owner_id
      and m.role = 'assistant'
      and m.created_at >= p_start
      and m.created_at < p_end
  ) actual_usage;

  select coalesce(sum(r.amount_usd), 0) into v_reserved
  from public.ai_budget_reservations r
  where r.owner_id = p_owner_id and r.expires_at > now();

  if v_spent + v_reserved + p_reserve_usd > p_budget_usd then
    return query select false, v_spent, v_reserved;
    return;
  end if;

  insert into public.ai_budget_reservations(owner_id, amount_usd, expires_at)
  values (p_owner_id, p_reserve_usd, p_expires_at);

  return query select true, v_spent, v_reserved + p_reserve_usd;
end;
$$;

revoke all on function public.reserve_monthly_ai_budget(
  uuid, timestamptz, timestamptz, numeric, numeric, timestamptz
) from public, anon, authenticated;
grant execute on function public.reserve_monthly_ai_budget(
  uuid, timestamptz, timestamptz, numeric, numeric, timestamptz
) to service_role;

comment on function public.reserve_monthly_ai_budget(
  uuid, timestamptz, timestamptz, numeric, numeric, timestamptz
) is 'service_role 전용. 실제 월 사용액과 활성 예약액을 잠금 안에서 검사하고 요청 비용을 예약한다.';

create or replace function public.consume_ai_budget_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric := greatest(coalesce(new.cost_usd, 0), 0);
  v_row record;
begin
  if v_remaining <= 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
  delete from public.ai_budget_reservations
  where owner_id = new.owner_id and expires_at <= now();

  for v_row in
    select id, amount_usd
    from public.ai_budget_reservations
    where owner_id = new.owner_id and expires_at > now()
    order by created_at, id
    for update
  loop
    if v_row.amount_usd <= v_remaining then
      delete from public.ai_budget_reservations where id = v_row.id;
      v_remaining := v_remaining - v_row.amount_usd;
    else
      update public.ai_budget_reservations
      set amount_usd = amount_usd - v_remaining
      where id = v_row.id;
      v_remaining := 0;
    end if;
    exit when v_remaining <= 0;
  end loop;

  return new;
end;
$$;

revoke all on function public.consume_ai_budget_reservation() from public, anon, authenticated;

create trigger generations_consume_ai_budget_reservation
after insert on public.generations
for each row
when (new.cost_usd > 0)
execute function public.consume_ai_budget_reservation();

create trigger chat_messages_consume_ai_budget_reservation
after insert on public.chat_messages
for each row
when (new.role = 'assistant' and new.cost_usd > 0)
execute function public.consume_ai_budget_reservation();

notify pgrst, 'reload schema';
