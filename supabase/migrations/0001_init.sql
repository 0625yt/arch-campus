-- arch-campus 초기 스키마
-- profiles · courses · materials · generations + RLS
-- 모든 테이블 owner_id = auth.uid() 본인 행만 접근

create extension if not exists "pgcrypto" with schema public;

-- ─────────────────────────────────────────────────────────
-- profiles : auth.users(1) ↔ profiles(1) 페르소나 슬롯
-- ─────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  university text,
  department text,
  year smallint check (year between 1 and 6),
  semester_year smallint,
  semester_term text check (semester_term in ('spring','fall')),
  weak_spots text[],
  preferred_style text check (preferred_style in ('visual','text','practice')),
  weekly_hours smallint check (weekly_hours between 0 and 168),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_email_idx on public.profiles(email);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- auth.users 새로 만들어지면 profiles에 빈 행 자동 추가
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────
-- courses : 학기별 수강 과목
-- ─────────────────────────────────────────────────────────
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  professor text,
  target_grade text check (target_grade in ('A+','A','B+','B')),
  color text,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index courses_owner_idx on public.courses(owner_id);
create index courses_owner_archived_idx on public.courses(owner_id, archived);

alter table public.courses enable row level security;

create policy "courses_select_own" on public.courses
  for select using (auth.uid() = owner_id);
create policy "courses_modify_own" on public.courses
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ─────────────────────────────────────────────────────────
-- materials : 강의자료·과제·시험·공지
-- ─────────────────────────────────────────────────────────
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  type text not null check (type in ('lecture','assignment','exam','team','syllabus','notice')),
  original_filename text,
  mime_type text,
  storage_path text,
  page_count integer,
  full_text text,
  extracted_keywords text[],
  uploaded_at timestamptz not null default now()
);

create index materials_owner_idx on public.materials(owner_id);
create index materials_course_idx on public.materials(course_id);
create index materials_owner_uploaded_idx on public.materials(owner_id, uploaded_at desc);

alter table public.materials enable row level security;

create policy "materials_select_own" on public.materials
  for select using (auth.uid() = owner_id);
create policy "materials_modify_own" on public.materials
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ─────────────────────────────────────────────────────────
-- generations : 위저드 호출 기록 + 비용 추적
-- ─────────────────────────────────────────────────────────
create table public.generations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,
  tool text not null,
  model_id text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_creation_tokens integer not null default 0,
  cost_usd numeric(10,6) not null default 0,
  status text not null default 'ok' check (status in ('ok','rejected','error')),
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index generations_owner_idx on public.generations(owner_id);
create index generations_material_idx on public.generations(material_id);
create index generations_owner_created_idx on public.generations(owner_id, created_at desc);
create index generations_owner_tool_idx on public.generations(owner_id, tool);

alter table public.generations enable row level security;

create policy "generations_select_own" on public.generations
  for select using (auth.uid() = owner_id);
create policy "generations_insert_own" on public.generations
  for insert with check (auth.uid() = owner_id);
-- generations는 immutable 기록이라 update/delete RLS 미생성 (service_role만 가능)
