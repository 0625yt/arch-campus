-- jobs : 비동기 AI 작업 추적 (요약·문제 생성 등 시간 걸리는 호출)
-- generations(immutable 기록)와 분리. 진행 중 작업 상태 + 결과 캐싱.
-- 사용자가 다른 페이지로 이동해도 백그라운드에서 계속 돌도록 next/server의 after()와 함께 사용.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid references public.materials(id) on delete cascade,

  -- 어떤 도구의 작업인지
  tool text not null check (tool in (
    'summarize', 'quiz', 'presentation',
    'wizard-cram', 'wizard-assignment', 'wizard-exam',
    'syllabus-extract', 'timetable-extract', 'post-mortem'
  )),

  -- 진행 상태
  status text not null default 'pending' check (status in (
    'pending', 'running', 'done', 'error', 'cancelled'
  )),

  -- 입력 파라미터 (요청 시점 그대로) — 재시도·디버그용
  input_params jsonb not null default '{}'::jsonb,

  -- 결과 (done이면 채워짐) — 위저드 출력 그대로
  result jsonb,

  -- 에러 (error 상태면 채워짐)
  error_message text,

  -- 모델·토큰·비용 (done 시점에 채움)
  model_id text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cost_usd numeric(10, 6) not null default 0,

  -- 생성 ID 백포인터 (done이면 generations 기록도 따로 남음)
  generation_id uuid references public.generations(id) on delete set null,

  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index jobs_owner_idx on public.jobs(owner_id);
create index jobs_material_idx on public.jobs(material_id);
create index jobs_owner_status_idx on public.jobs(owner_id, status);
create index jobs_owner_created_idx on public.jobs(owner_id, created_at desc);

-- 같은 자료 + 같은 도구에 대해 running 작업은 1개만 (UNIQUE partial index)
-- pending도 마찬가지 — 사용자가 같은 버튼 두 번 누르면 한 번만 잡힘
create unique index jobs_one_active_per_material_tool
  on public.jobs(material_id, tool)
  where status in ('pending', 'running') and material_id is not null;

alter table public.jobs enable row level security;

create policy "jobs_select_own" on public.jobs
  for select using (auth.uid() = owner_id);

create policy "jobs_modify_own" on public.jobs
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
