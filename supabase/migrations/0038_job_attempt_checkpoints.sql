-- 이전 실행의 늦은 콜백이 재시도 중인 작업의 진행 이력을 덮어쓰지 않게 한다.
create or replace function public.record_job_attempt_checkpoint(
  p_job_id uuid,
  p_owner_id uuid,
  p_retry_count integer,
  p_stage text,
  p_progress smallint,
  p_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
  event_at timestamptz := now();
begin
  if p_retry_count is null or p_retry_count not between 0 and 1
    or p_stage is null or char_length(trim(p_stage)) not between 1 and 80
    or p_progress is null or p_progress not between 0 and 99
    or char_length(coalesce(p_message, '')) > 500 then
    raise exception 'invalid job checkpoint';
  end if;

  update public.jobs
  set checkpoint_stage = trim(p_stage),
      checkpoint_progress = p_progress,
      checkpoint_message = nullif(trim(coalesce(p_message, '')), ''),
      checkpoint_updated_at = event_at,
      checkpoint_history = checkpoint_history || jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'stage', trim(p_stage),
          'progress', p_progress,
          'message', nullif(trim(coalesce(p_message, '')), ''),
          'at', event_at
        ))
      )
  where id = p_job_id
    and owner_id = p_owner_id
    and retry_count = p_retry_count
    and status in ('pending', 'running');
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.record_job_attempt_checkpoint(uuid, uuid, integer, text, smallint, text)
  from public, anon, authenticated;
grant execute on function public.record_job_attempt_checkpoint(uuid, uuid, integer, text, smallint, text)
  to service_role;

-- 기존 배포의 호출도 최초 실행(0)에만 허용한다. 이름·인자·권한은 유지한다.
create or replace function public.record_job_checkpoint(
  p_job_id uuid,
  p_owner_id uuid,
  p_stage text,
  p_progress smallint,
  p_message text default null
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select public.record_job_attempt_checkpoint(
    p_job_id, p_owner_id, 0, p_stage, p_progress, p_message
  );
$$;

revoke all on function public.record_job_checkpoint(uuid, uuid, text, smallint, text)
  from public, anon, authenticated;
grant execute on function public.record_job_checkpoint(uuid, uuid, text, smallint, text)
  to service_role;

notify pgrst, 'reload schema';
