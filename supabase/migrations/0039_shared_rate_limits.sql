-- Shared sliding windows when a separate Redis instance is not configured.
-- Identifiers are HMAC hashes produced only by the server, never raw user IDs or IPs.
create table public.rate_limit_buckets (
  kind text not null check (kind in ('ai', 'login', 'upload', 'default')),
  identifier_hash text not null check (identifier_hash ~ '^[a-f0-9]{64}$'),
  hits timestamptz[] not null default '{}',
  expires_at timestamptz not null,
  primary key (kind, identifier_hash)
);

create index rate_limit_buckets_expiry_idx on public.rate_limit_buckets(expires_at);
alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.rate_limit_buckets to service_role;

create function public.consume_rate_limit(
  p_kind text,
  p_identifier_hash text,
  p_tokens integer,
  p_window_ms integer
)
returns table(allowed boolean, remaining integer, reset_ms bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_hits timestamptz[];
  fresh_hits timestamptz[];
  checked_at timestamptz;
  window_span interval;
  accepted boolean;
begin
  if p_kind is null or p_kind not in ('ai', 'login', 'upload', 'default')
    or p_identifier_hash is null or p_identifier_hash !~ '^[a-f0-9]{64}$'
    or p_tokens is null or p_tokens not between 1 and 1000
    or p_window_ms is null or p_window_ms not between 1 and 86400000 then
    raise exception 'invalid rate limit policy';
  end if;

  window_span := p_window_ms * interval '1 millisecond';
  insert into public.rate_limit_buckets(kind, identifier_hash, expires_at)
  values (p_kind, p_identifier_hash, clock_timestamp() + window_span)
  on conflict (kind, identifier_hash) do nothing;

  select hits into current_hits
  from public.rate_limit_buckets
  where kind = p_kind and identifier_hash = p_identifier_hash
  for update;
  -- Take the clock after acquiring the row lock: queued requests must not use stale time.
  checked_at := clock_timestamp();
  select coalesce(array_agg(hit order by hit), '{}'::timestamptz[]) into fresh_hits
  from unnest(current_hits) as hit
  where hit > checked_at - window_span;

  accepted := cardinality(fresh_hits) < p_tokens;
  if accepted then
    fresh_hits := array_append(fresh_hits, checked_at);
  end if;
  update public.rate_limit_buckets
  set hits = fresh_hits, expires_at = fresh_hits[cardinality(fresh_hits)] + window_span
  where kind = p_kind and identifier_hash = p_identifier_hash;

  -- Bound cleanup per request and skip locked buckets so other users never wait on cleanup.
  delete from public.rate_limit_buckets
  where (kind, identifier_hash) in (
    select kind, identifier_hash from public.rate_limit_buckets
    where expires_at <= checked_at
      and (kind, identifier_hash) <> (p_kind, p_identifier_hash)
    order by expires_at
    limit 100
    for update skip locked
  );

  return query select accepted,
    greatest(0, p_tokens - cardinality(fresh_hits)),
    ceil(extract(epoch from (fresh_hits[1] + window_span)) * 1000)::bigint;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;

notify pgrst, 'reload schema';
