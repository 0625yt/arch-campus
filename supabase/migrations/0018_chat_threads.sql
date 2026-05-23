-- AI Chat (자료 기반 RAG) — 2026-05 sprint.
--
-- 구조:
--   chat_threads   : 자료 1개에 잠긴 대화 스레드. material_full_text는 thread 생성
--                    시점에 동결(snapshot) — 자료 재요약·재업로드돼도 대화 컨텍스트 안 흔들림.
--                    cache boundary 안정성을 위해 thread 수명 동안 immutable.
--   chat_messages  : turn별 행. role=user|assistant, citations(jsonb)는 assistant만.
--
-- RLS: 본인 owner_id만. service-role은 admin client로 우회.

-- ─────────────────────────────────────────────────────────
-- chat_threads
-- ─────────────────────────────────────────────────────────
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null references public.materials(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null default '새 대화',
  -- 자료 본문 snapshot — 50KB cap. cache boundary 안정성 보장.
  material_full_text text not null,
  material_snapshot_chars int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create index chat_threads_owner_material_idx
  on public.chat_threads (owner_id, material_id);
create index chat_threads_owner_recent_idx
  on public.chat_threads (owner_id, last_message_at desc nulls last);

alter table public.chat_threads enable row level security;

drop policy if exists "chat_threads_own" on public.chat_threads;
create policy "chat_threads_own" on public.chat_threads
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ─────────────────────────────────────────────────────────
-- chat_messages
-- ─────────────────────────────────────────────────────────
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  -- citations: [{page:int, quote:string}] — assistant만 비어있지 않음
  citations jsonb not null default '[]'::jsonb,
  -- 토큰·비용 — assistant turn에만 채움. day-level rollup용
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_creation_tokens int not null default 0,
  cost_usd numeric(10,6) not null default 0,
  model_id text,
  -- refusal: 치팅 라인에 걸려 거절했을 때 reason 박음
  refusal_reason text,
  created_at timestamptz not null default now()
);

create index chat_messages_thread_idx
  on public.chat_messages (thread_id, created_at);
create index chat_messages_owner_created_idx
  on public.chat_messages (owner_id, created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_own" on public.chat_messages;
create policy "chat_messages_own" on public.chat_messages
  for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ─────────────────────────────────────────────────────────
-- last_message_at 자동 갱신 trigger (chat_messages insert 시)
-- ─────────────────────────────────────────────────────────
create or replace function public.chat_threads_bump_last_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.chat_threads
    set last_message_at = new.created_at,
        updated_at = now()
    where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists chat_messages_bump_thread on public.chat_messages;
create trigger chat_messages_bump_thread
  after insert on public.chat_messages
  for each row execute function public.chat_threads_bump_last_message();
