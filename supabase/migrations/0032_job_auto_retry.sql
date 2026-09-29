-- 서버 종료로 멈춘 핵심 자료 작업을 한 번만 자동 재시도하기 위한 시도 횟수.
alter table public.jobs
  add column retry_count integer not null default 0
  check (retry_count >= 0 and retry_count <= 1);

comment on column public.jobs.retry_count is
  '서버 중단으로 stale 처리된 summarize/quiz 작업의 자동 재시도 횟수. 최대 1회.';

notify pgrst, 'reload schema';
