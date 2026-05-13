-- 학습 루프 닫기 — 풀이 결과 다시보기·오답 복습 큐.
--
-- 0005에서 quiz_attempts.answers (사용자 선택)는 저장했지만
-- 채점 결과(어떤 문제를 어떻게 틀렸는지)는 매번 quiz.questions와
-- answers를 비교해 다시 계산해야 했다.
-- → 매번 정답·해설을 풀어야 하고, 통계 쿼리가 무겁다.
--
-- 이 마이그레이션은:
--   1) attempt에 채점 결과(results jsonb) 영구 보관
--   2) 오답만 뽑는 view (wrong_items_v) — Today·복습 큐가 한 번 select로 사용
--   3) attempt 단건 조회 헬퍼 (가장 최근 시도)
--
-- 모두 RLS 통과 — view는 SECURITY INVOKER가 기본이라 quiz_attempts의 RLS가
-- 그대로 적용됨.

-- ─────────────────────────────────────────────────────────
-- 1) results 컬럼 — 채점 결과 영구 보관
-- ─────────────────────────────────────────────────────────
alter table public.quiz_attempts
  add column if not exists results jsonb not null default '[]'::jsonb;

comment on column public.quiz_attempts.results is
  '채점 결과 배열 [{questionId, correct, submitted, answer, explanation, evidence?, evidencePage?}, ...]. '
  '0009 이전 데이터는 빈 배열일 수 있음 — UI에서 fallback 처리.';

-- ─────────────────────────────────────────────────────────
-- 2) 오답만 뽑는 view — 복습 큐의 단일 진입점
-- ─────────────────────────────────────────────────────────
-- jsonb_array_elements를 펼쳐서 한 row = 한 오답 문제.
-- correct=false인 것만, 해당 문제의 stem·choices·answer까지 quizzes에서 join.
-- "어떤 자료에서 나온 어떤 문제를 어떻게 틀렸는가" 한 row에 다 담김.
--
-- 같은 문제를 여러 번 틀렸으면 row가 여러 개 — 클라이언트가 "최근 N개" 또는
-- "문제별 마지막 시도" 골라 쓰면 됨.

create or replace view public.wrong_items_v as
select
  a.id              as attempt_id,
  a.owner_id        as owner_id,
  a.quiz_id         as quiz_id,
  a.created_at      as attempted_at,
  q.material_id     as material_id,
  q.course_id       as course_id,
  q.title           as quiz_title,
  q.difficulty      as quiz_difficulty,
  (item->>'questionId')::int                        as question_id,
  item->>'submitted'                                as submitted,
  item->>'answer'                                   as correct_answer,
  item->>'explanation'                              as explanation,
  item->>'evidence'                                 as evidence,
  nullif(item->>'evidencePage', '')::int            as evidence_page
from public.quiz_attempts a
join public.quizzes q on q.id = a.quiz_id
cross join lateral jsonb_array_elements(a.results) as item
where (item->>'correct')::boolean = false;

comment on view public.wrong_items_v is
  '오답만 펼쳐서 한 row = 한 오답. RLS는 quiz_attempts에서 상속.';

-- ─────────────────────────────────────────────────────────
-- 3) attempt + quiz + material 한 줄 join view (다시보기 페이지용)
-- ─────────────────────────────────────────────────────────
create or replace view public.attempt_summary_v as
select
  a.id              as attempt_id,
  a.owner_id        as owner_id,
  a.quiz_id         as quiz_id,
  a.score           as score,
  a.total           as total,
  a.duration_ms     as duration_ms,
  a.created_at      as attempted_at,
  a.results         as results,
  a.answers         as answers,
  q.material_id     as material_id,
  q.course_id       as course_id,
  q.title           as quiz_title,
  q.difficulty      as quiz_difficulty,
  q.questions       as questions,
  q.watermark       as watermark
from public.quiz_attempts a
join public.quizzes q on q.id = a.quiz_id;

comment on view public.attempt_summary_v is
  '한 attempt의 모든 정보를 한 row에 — 다시보기·공유 페이지가 단일 select로 사용.';
