-- A scheduler can recover a bounded amount of work without a user polling the app.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
revoke usage on schema cron, net from public, anon, authenticated;

create function public.claim_stale_material_job_for_worker(p_owner_id uuid default null)
returns setof public.jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.jobs%rowtype;
begin
  select * into candidate from public.jobs
  where status in ('pending', 'running') and tool in ('summarize', 'quiz')
    and (p_owner_id is null or owner_id = p_owner_id)
    and coalesce(started_at, created_at) < clock_timestamp() - interval '8 minutes'
  order by created_at, id
  limit 1 for update skip locked;
  if not found then return; end if;

  if candidate.retry_count = 0 then
    return query update public.jobs set status = 'pending', retry_count = 1,
      started_at = clock_timestamp(), finished_at = null, error_message = null
    where id = candidate.id returning *;
  else
    -- A second interrupted attempt is terminal; never silently bill unlimited retries.
    return query update public.jobs set status = 'error', finished_at = clock_timestamp(),
      error_message = '자동 재시도도 중단됐어요. 자료를 확인하고 다시 실행해 주세요.'
    where id = candidate.id returning *;
  end if;
end;
$$;

revoke all on function public.claim_stale_material_job_for_worker(uuid) from public, anon, authenticated;
grant execute on function public.claim_stale_material_job_for_worker(uuid) to service_role;

create index jobs_material_worker_due_idx on public.jobs (coalesce(started_at, created_at), created_at)
  where status in ('pending', 'running') and tool in ('summarize', 'quiz');

notify pgrst, 'reload schema';
