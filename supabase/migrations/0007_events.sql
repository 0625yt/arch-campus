-- 일정·이벤트 — 강의계획서에서 추출한 시험·과제·발표 + 사용자 직접 입력
-- 의도:
--   - Calendar·Today 화면이 이 테이블 한 곳에서 일정 읽음
--   - 강의계획서 import 시 source_material_id 박아 추적·재import 가능
--   - 신뢰도(confidence) 필드로 "확정" vs "확인 필요" 구분 (사용자 검토 후 confirmed = true)

create table public.events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,

  -- 어디서 왔는지 (강의계획서 원본 추적). 사용자 직접 추가는 null
  source_material_id uuid references public.materials(id) on delete set null,

  kind text not null check (kind in ('exam','assignment','presentation','class','etc')),
  title text not null,
  notes text,

  -- 시점 — 종일 이벤트는 starts_at만 (date 부분만 의미), 시간 있으면 starts_at + ends_at
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,

  -- 강의계획서 추출 메타
  weight_percent numeric(5,2) check (weight_percent between 0 and 100),
  confidence numeric(3,2) check (confidence between 0 and 1),
  confirmed boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index events_owner_starts_idx on public.events(owner_id, starts_at);
create index events_course_starts_idx on public.events(course_id, starts_at);
create index events_owner_kind_idx on public.events(owner_id, kind);
create index events_source_material_idx on public.events(source_material_id);

create trigger events_touch_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

alter table public.events enable row level security;

create policy "events_select_own" on public.events
  for select using (auth.uid() = owner_id);
create policy "events_modify_own" on public.events
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- courses에 강의계획서 메타 — 강의 시간표·강의실 정도만
alter table public.courses
  add column if not exists schedule jsonb,
  add column if not exists location text,
  add column if not exists term_start date,
  add column if not exists term_end date;

-- PostgREST 캐시 reload
notify pgrst, 'reload schema';
