-- 퀴즈/시험 풀이 뒤 회고. 한 시도당 한 개이며 다시 저장하면 최신 내용으로 갱신한다.
create table public.attempt_reflections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null references public.quiz_attempts(id) on delete cascade,
  readiness smallint not null check (readiness between 1 and 5),
  satisfaction smallint not null check (satisfaction between 1 and 5),
  causes text[] not null default '{}',
  next_action text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, attempt_id),
  check (cardinality(causes) <= 6),
  check (next_action is null or char_length(next_action) <= 500),
  check (notes is null or char_length(notes) <= 2000)
);

alter table public.attempt_reflections enable row level security;
create policy attempt_reflections_owner_all on public.attempt_reflections
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.quiz_attempts a
      where a.id = attempt_id and a.owner_id = (select auth.uid())
    )
  );
create policy require_verified_mfa on public.attempt_reflections as restrictive
  for all to authenticated
  using ((select public.has_required_assurance()))
  with check ((select public.has_required_assurance()));

create index attempt_reflections_owner_updated_idx
  on public.attempt_reflections(owner_id, updated_at desc);

notify pgrst, 'reload schema';
