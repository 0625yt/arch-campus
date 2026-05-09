-- 학습 루프 — 문제 생성·풀이 기록
-- quizzes: 자료에서 만든 문제 세트(여러 번 생성 가능)
-- quiz_attempts: 한 사용자가 한 세트를 푼 시도(여러 번 풀 수 있음)

-- ─────────────────────────────────────────────────────────
-- quizzes : 4지선다 문제 세트
-- ─────────────────────────────────────────────────────────
create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  difficulty text not null default '보통' check (difficulty in ('쉬움','보통','어려움')),
  question_count smallint not null check (question_count between 1 and 20),
  questions jsonb not null,             -- QuizOutput.questions 그대로
  watermark text not null,
  model_id text not null,
  generation_id uuid references public.generations(id) on delete set null,
  created_at timestamptz not null default now()
);

create index quizzes_owner_idx on public.quizzes(owner_id);
create index quizzes_material_idx on public.quizzes(material_id);
create index quizzes_owner_created_idx on public.quizzes(owner_id, created_at desc);

alter table public.quizzes enable row level security;

create policy "quizzes_select_own" on public.quizzes
  for select using (auth.uid() = owner_id);
create policy "quizzes_insert_own" on public.quizzes
  for insert with check (auth.uid() = owner_id);
create policy "quizzes_delete_own" on public.quizzes
  for delete using (auth.uid() = owner_id);
-- update는 service-role만 (재채점 등). 사용자는 새로 만들면 됨.

-- ─────────────────────────────────────────────────────────
-- quiz_attempts : 한 세트를 푼 시도
-- ─────────────────────────────────────────────────────────
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  answers jsonb not null,               -- [{questionId, choice: "A"|"B"|"C"|"D"}, ...]
  score smallint not null check (score >= 0),
  total smallint not null check (total > 0),
  duration_ms integer,                  -- 시작~제출 걸린 시간
  status text not null default 'completed' check (status in ('completed','abandoned')),
  created_at timestamptz not null default now()
);

create index quiz_attempts_owner_idx on public.quiz_attempts(owner_id);
create index quiz_attempts_quiz_idx on public.quiz_attempts(quiz_id);
create index quiz_attempts_owner_created_idx on public.quiz_attempts(owner_id, created_at desc);

alter table public.quiz_attempts enable row level security;

create policy "quiz_attempts_select_own" on public.quiz_attempts
  for select using (auth.uid() = owner_id);
create policy "quiz_attempts_insert_own" on public.quiz_attempts
  for insert with check (auth.uid() = owner_id);
-- 시도 기록도 immutable (update/delete 정책 없음, service-role만)
