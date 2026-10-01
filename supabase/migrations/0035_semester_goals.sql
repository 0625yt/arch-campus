-- 학기별 목표와 학기 종료 회고. 과목 목표 등급은 기존 courses.target_grade를 사용한다.
create table public.semester_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  semester_year smallint not null check (semester_year between 2000 and 2100),
  semester_term text not null check (semester_term in ('spring','summer','fall','winter')),
  target_gpa numeric(3,2) check (target_gpa is null or (target_gpa between 0 and 4.5)),
  target_credits numeric(3,1) check (target_credits is null or (target_credits between 0 and 30)),
  reflection text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, semester_year, semester_term)
);

alter table public.semester_goals enable row level security;
create policy semester_goals_owner_all on public.semester_goals
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy require_verified_mfa on public.semester_goals as restrictive
  for all to authenticated
  using ((select public.has_required_assurance()))
  with check ((select public.has_required_assurance()));

create index semester_goals_owner_term_idx
  on public.semester_goals(owner_id, semester_year desc, semester_term);

notify pgrst, 'reload schema';
