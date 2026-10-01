-- FSRS 간격 반복 복습: 문제별 기억 상태와 리뷰 이력을 영구 보관한다.

create table public.review_cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_id integer not null,
  due_at timestamptz not null default now(),
  stability double precision not null default 0 check (stability >= 0),
  difficulty double precision not null default 0 check (difficulty >= 0 and difficulty <= 10),
  scheduled_days integer not null default 0 check (scheduled_days >= 0),
  learning_steps integer not null default 0 check (learning_steps >= 0),
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  state smallint not null default 0 check (state between 0 and 3),
  last_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, quiz_id, question_id)
);

create index review_cards_owner_due_idx
  on public.review_cards(owner_id, due_at);

create table public.review_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.review_cards(id) on delete cascade,
  rating smallint not null check (rating between 1 and 4),
  previous_state smallint not null check (previous_state between 0 and 3),
  previous_due_at timestamptz not null,
  reviewed_at timestamptz not null default now(),
  scheduled_days integer not null check (scheduled_days >= 0),
  stability double precision not null check (stability >= 0),
  difficulty double precision not null check (difficulty >= 0 and difficulty <= 10)
);

create index review_logs_owner_reviewed_idx
  on public.review_logs(owner_id, reviewed_at desc);
create index review_logs_card_reviewed_idx
  on public.review_logs(card_id, reviewed_at desc);

alter table public.review_cards enable row level security;
alter table public.review_logs enable row level security;

create policy review_cards_owner_all on public.review_cards
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy review_logs_owner_all on public.review_logs
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- 기존 미해결 오답은 배포 당일부터 복습할 수 있도록 새 카드로 옮긴다.
insert into public.review_cards (owner_id, quiz_id, question_id, due_at)
select owner_id, quiz_id, question_id, now()
from public.wrong_items_v
on conflict (owner_id, quiz_id, question_id) do nothing;

notify pgrst, 'reload schema';
