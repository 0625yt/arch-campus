create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 1 and 2048),
  endpoint_hash text not null check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  p256dh text not null check (length(p256dh) = 87),
  auth text not null check (length(auth) = 22),
  created_at timestamptz not null default now()
);
create index push_subscriptions_owner_idx on public.push_subscriptions(owner_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscription_owner on public.push_subscriptions
  for select to authenticated using (owner_id = (select auth.uid()));
create policy push_subscription_delete on public.push_subscriptions
  for delete to authenticated using (owner_id = (select auth.uid()));
create policy require_verified_mfa on public.push_subscriptions as restrictive
  for all to authenticated using ((select public.has_required_assurance()))
  with check ((select public.has_required_assurance()));
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

create function public.register_push_subscription(
  p_owner_id uuid, p_endpoint text, p_endpoint_hash text, p_p256dh text, p_auth text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare subscription_id uuid;
begin
  -- Serialize registrations for the owner so concurrent requests cannot exceed the cap.
  perform pg_advisory_xact_lock(hashtextextended('push:' || p_owner_id::text, 0));
  select id into subscription_id from public.push_subscriptions
    where owner_id = p_owner_id and endpoint = p_endpoint;
  if subscription_id is null and
    (select count(*) from public.push_subscriptions where owner_id = p_owner_id) >= 10 then
    raise exception 'Subscription limit reached' using errcode = '23514';
  end if;
  insert into public.push_subscriptions(owner_id, endpoint, endpoint_hash, p256dh, auth)
  values (p_owner_id, p_endpoint, p_endpoint_hash, p_p256dh, p_auth)
  on conflict (endpoint) do update set
    endpoint_hash = excluded.endpoint_hash, p256dh = excluded.p256dh, auth = excluded.auth
  where public.push_subscriptions.owner_id = p_owner_id
  returning id into subscription_id;
  if subscription_id is null then
    raise exception 'Subscription belongs to another owner' using errcode = '23505';
  end if;
  return subscription_id;
end;
$$;

create table public.push_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  starts_at timestamptz not null,
  reminder_minutes integer not null check (reminder_minutes between 0 and 10080),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  available_at timestamptz not null default now(),
  leased_at timestamptz,
  lease_token uuid,
  sent_at timestamptz,
  unique (event_id, subscription_id, starts_at, reminder_minutes)
);
create index push_reminder_due_idx on public.push_reminder_deliveries(available_at, due_at)
  where status in ('pending', 'sending');
create index events_push_reminder_idx on public.events(starts_at)
  where reminder_minutes is not null and confirmed and recurrence_rule is null;
alter table public.push_reminder_deliveries enable row level security;
revoke all on public.push_reminder_deliveries from anon, authenticated;
grant all on public.push_reminder_deliveries to service_role;

create function public.claim_push_reminders(p_owner_id uuid default null)
returns setof public.push_reminder_deliveries
language plpgsql security definer set search_path = '' as $$
begin
  -- Expired history cannot be due again; keep at most 30 days of delivery metadata.
  delete from public.push_reminder_deliveries where due_at < now() - interval '30 days'
    and (p_owner_id is null or owner_id = p_owner_id);
  insert into public.push_reminder_deliveries
    (owner_id, event_id, subscription_id, starts_at, reminder_minutes, due_at)
  select e.owner_id, e.id, s.id, e.starts_at, e.reminder_minutes,
    e.starts_at - make_interval(mins => e.reminder_minutes)
  from public.events e join public.push_subscriptions s on s.owner_id = e.owner_id
  where e.confirmed and e.reminder_minutes is not null and e.recurrence_rule is null
    and (p_owner_id is null or e.owner_id = p_owner_id)
    and e.starts_at >= now() - interval '10 minutes' and e.starts_at <= now() + interval '7 days'
    and e.starts_at - make_interval(mins => e.reminder_minutes) between now() - interval '10 minutes' and now()
    and s.created_at <= e.starts_at - make_interval(mins => e.reminder_minutes)
    and not exists (
      select 1 from public.push_reminder_deliveries d where d.event_id = e.id
        and d.subscription_id = s.id and d.starts_at = e.starts_at
        and d.reminder_minutes = e.reminder_minutes
    )
  order by e.starts_at - make_interval(mins => e.reminder_minutes), e.id, s.id
  limit 100 on conflict do nothing;

  update public.push_reminder_deliveries d set status = 'failed', lease_token = null
  where d.status in ('pending', 'sending')
    and (p_owner_id is null or d.owner_id = p_owner_id)
    and (d.due_at < now() - interval '10 minutes'
      or (d.attempts >= 3 and d.leased_at < now() - interval '2 minutes')
      or not exists (select 1 from public.events e where e.id = d.event_id
        and e.owner_id = d.owner_id and e.confirmed and e.recurrence_rule is null
        and e.starts_at = d.starts_at and e.reminder_minutes = d.reminder_minutes));

  return query
  with candidates as (
    select d.id from public.push_reminder_deliveries d
    where (p_owner_id is null or d.owner_id = p_owner_id) and d.attempts < 3
      and d.available_at <= now()
      and (d.status = 'pending' or (d.status = 'sending' and d.leased_at < now() - interval '2 minutes'))
    order by d.due_at, d.id limit 5 for update skip locked
  ) update public.push_reminder_deliveries d set status = 'sending',
    attempts = d.attempts + 1, leased_at = now(), lease_token = gen_random_uuid()
  from candidates c where d.id = c.id returning d.*;
end;
$$;

create function public.finish_push_reminder(
  p_id uuid, p_owner_id uuid, p_lease_token uuid, p_outcome text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_outcome not in ('sent', 'retry', 'failed') then
    raise exception 'Invalid delivery outcome';
  end if;
  update public.push_reminder_deliveries set
    status = case when p_outcome = 'retry' and attempts < 3 then 'pending'
      when p_outcome = 'retry' then 'failed' else p_outcome end,
    available_at = now() + interval '1 minute', lease_token = null,
    sent_at = case when p_outcome = 'sent' then now() else null end
  where id = p_id and owner_id = p_owner_id and lease_token = p_lease_token and status = 'sending';
  return found;
end;
$$;

revoke all on function public.register_push_subscription(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.claim_push_reminders(uuid) from public, anon, authenticated;
revoke all on function public.finish_push_reminder(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.register_push_subscription(uuid,text,text,text,text) to service_role;
grant execute on function public.claim_push_reminders(uuid) to service_role;
grant execute on function public.finish_push_reminder(uuid,uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
