-- 백그라운드 작업이 멈춘 정확한 단계를 남긴다. 상태 전환은 트리거로,
-- 세부 단계는 record_job_checkpoint RPC로 원자적으로 history에 추가한다.
alter table public.jobs
  add column checkpoint_stage text not null default 'queued'
    check (char_length(checkpoint_stage) between 1 and 80),
  add column checkpoint_progress smallint not null default 0
    check (checkpoint_progress between 0 and 100),
  add column checkpoint_message text
    check (checkpoint_message is null or char_length(checkpoint_message) <= 500),
  add column checkpoint_updated_at timestamptz not null default now(),
  add column checkpoint_history jsonb not null default '[]'::jsonb
    check (jsonb_typeof(checkpoint_history) = 'array');

update public.jobs
set
  checkpoint_stage = case status
    when 'pending' then 'queued'
    when 'running' then 'processing'
    when 'done' then 'completed'
    when 'error' then 'failed'
    else 'cancelled'
  end,
  checkpoint_progress = case status
    when 'pending' then 0
    when 'running' then 15
    else 100
  end,
  checkpoint_updated_at = coalesce(finished_at, started_at, created_at),
  checkpoint_history = jsonb_build_array(jsonb_build_object(
    'stage', case status
      when 'pending' then 'queued'
      when 'running' then 'processing'
      when 'done' then 'completed'
      when 'error' then 'failed'
      else 'cancelled'
    end,
    'progress', case when status in ('done','error','cancelled') then 100 when status = 'running' then 15 else 0 end,
    'at', coalesce(finished_at, started_at, created_at)
  ));

create or replace function public.sync_job_status_checkpoint()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  next_stage text;
  next_progress smallint;
  event_at timestamptz := now();
begin
  if tg_op = 'INSERT' then
    new.checkpoint_stage := 'queued';
    new.checkpoint_progress := 0;
    new.checkpoint_updated_at := event_at;
    new.checkpoint_history := jsonb_build_array(
      jsonb_build_object('stage', 'queued', 'progress', 0, 'at', event_at)
    );
    return new;
  end if;

  if new.retry_count > old.retry_count or new.status is distinct from old.status then
    next_stage := case
      when new.retry_count > old.retry_count and new.status = 'pending' then 'retry-queued'
      else case new.status
      when 'pending' then 'queued'
      when 'running' then 'processing'
      when 'done' then 'completed'
      when 'error' then 'failed'
      else 'cancelled'
      end
    end;
    next_progress := case new.status
      when 'pending' then 0
      when 'running' then 15
      else 100
    end;
    new.checkpoint_stage := next_stage;
    new.checkpoint_progress := next_progress;
    new.checkpoint_message := case when new.status = 'error' then new.error_message else null end;
    new.checkpoint_updated_at := event_at;
    new.checkpoint_history := coalesce(old.checkpoint_history, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object('stage', next_stage, 'progress', next_progress, 'at', event_at)
    );
  end if;
  return new;
end;
$$;

create trigger jobs_status_checkpoint
before insert or update of status, retry_count on public.jobs
for each row execute function public.sync_job_status_checkpoint();

create or replace function public.record_job_checkpoint(
  p_job_id uuid,
  p_owner_id uuid,
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
  if char_length(trim(p_stage)) not between 1 and 80
    or p_progress not between 0 and 99
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
    and status in ('pending', 'running');
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.record_job_checkpoint(uuid, uuid, text, smallint, text)
  from public, anon, authenticated;
grant execute on function public.record_job_checkpoint(uuid, uuid, text, smallint, text)
  to service_role;

create index jobs_status_checkpoint_idx
  on public.jobs(status, checkpoint_updated_at desc);

notify pgrst, 'reload schema';
