-- 2026-06-05 — wrong_items_v를 "(owner, quiz, question)별 최신 시도만" 보도록 재설계.
--
-- 버그:
--   기존 뷰는 모든 attempt의 results에서 correct=false를 통째로 펼쳐, 같은 문제를
--   다시 맞혀도 옛 시도의 오답 row가 영원히 남았다. 그래서 "오답만 다시 풀기"로
--   맞혀도 오답 목록·개수에서 빠지지 않았다(앱 dedup으로 개수는 안 늘지만 줄지도 않음).
--
-- 기대 동작:
--   - 같은 (quiz, question)을 마지막으로 푼 시도에서 맞으면 → 오답에서 빠진다(줄어듦).
--   - 마지막 시도에서 틀리면 → 오답 1개로 유지(안 늘어남).
--   - 부분채점(복수 필수답 일부만 맞음)은 results의 correct=false로 저장되므로 그대로 오답.
--
-- 방법:
--   results를 펼친 뒤, (owner_id, quiz_id, question_id)로 partition 하고 attempt
--   created_at 최신순으로 rank=1만 남긴다. 그 최신 row가 correct=false일 때만 노출.
--   → "각 문제의 가장 최근 채점 결과"만 본다.
--
-- 호환:
--   - select 컬럼은 0022와 동일(attempt_id·topic 포함). 컨슈머 코드 변경 불필요.
--   - 앱의 (quizId, questionId) dedup은 이제 뷰가 이미 문제당 1행이라 사실상 no-op
--     이지만, 안전망으로 남겨둬도 무방.

create or replace view public.wrong_items_v as
with expanded as (
  select
    a.id           as attempt_id,
    a.owner_id     as owner_id,
    a.quiz_id      as quiz_id,
    a.created_at   as attempted_at,
    q.material_id  as material_id,
    q.course_id    as course_id,
    q.title        as quiz_title,
    q.difficulty   as quiz_difficulty,
    q.questions    as questions,
    (item->>'questionId')::int             as question_id,
    item->>'submitted'                     as submitted,
    item->>'answer'                        as correct_answer,
    item->>'explanation'                   as explanation,
    item->>'evidence'                      as evidence,
    nullif(item->>'evidencePage', '')::int as evidence_page,
    (item->>'correct')::boolean            as correct,
    -- 같은 (owner, quiz, question)에서 가장 최근 시도가 1.
    -- 동률(같은 created_at)이면 attempt id로 안정 정렬.
    row_number() over (
      partition by a.owner_id, a.quiz_id, (item->>'questionId')::int
      order by a.created_at desc, a.id desc
    ) as rn
  from public.quiz_attempts a
  join public.quizzes q on q.id = a.quiz_id
  cross join lateral jsonb_array_elements(a.results) as item
)
select
  e.attempt_id,
  e.owner_id,
  e.quiz_id,
  e.attempted_at,
  e.material_id,
  e.course_id,
  e.quiz_title,
  e.quiz_difficulty,
  e.question_id,
  e.submitted,
  e.correct_answer,
  e.explanation,
  e.evidence,
  e.evidence_page,
  -- quiz.questions[]에서 questionId 매칭해 topic 추출 (0022와 동일).
  (
    select item2->>'topic'
    from jsonb_array_elements(e.questions) as item2
    where (item2->>'id')::int = e.question_id
    limit 1
  ) as topic
from expanded e
where e.rn = 1          -- 각 문제의 "가장 최근 시도"만
  and e.correct = false; -- 그 최근 시도가 오답일 때만

comment on view public.wrong_items_v is
  '오답만 펼쳐서 한 row = 한 (quiz,question)의 가장 최근 시도 오답. '
  '다시 맞히면 자동으로 빠진다. RLS는 quiz_attempts에서 상속. 2026-06-05 최신 시도 필터 추가.';
