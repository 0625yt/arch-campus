-- 2026-05-28 — wrong_items_v에 topic 추가.
--
-- 동기:
--   - 학생이 어느 단원에서 자주 틀리는지 review 화면에서 한눈에 보여주고 싶음.
--   - quiz.questions[]에 이미 topic 필드(QuizQuestion schema)가 있으나, 채점 결과(results jsonb)에는
--     채점 당시 question 스냅샷이 들어가지 않아 topic이 직접 join돼야 함.
--   - quiz.questions에서 questionId 매칭해 topic 가져오기 — view에서 jsonb path query.
--
-- 호환:
--   - 기존 select 컬럼은 그대로. topic 컬럼만 새로 추가됨. 컨슈머가 안 읽으면 영향 X.
--   - results 안에 채점 당시 topic이 박혀 있어도(미래 schema 변경) view는 questions를 우선 — 학생이 자료 갱신 시
--     자동 반영. 단, questions를 갱신하면 과거 attempt의 topic 분류도 함께 바뀐다 — review 흐름에선 이게 자연스러움.

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
  nullif(item->>'evidencePage', '')::int            as evidence_page,
  -- ▶ NEW: quiz.questions[]에서 questionId 매칭해 topic 추출.
  --   - questions가 array of { id, topic, ... } 구조
  --   - jsonb_path_query_first로 첫 매칭만 (questionId 유일)
  --   - 매칭 실패 시 null — UI는 "기타" fallback 처리
  (
    select item2->>'topic'
    from jsonb_array_elements(q.questions) as item2
    where (item2->>'id')::int = (item->>'questionId')::int
    limit 1
  )                                                  as topic
from public.quiz_attempts a
join public.quizzes q on q.id = a.quiz_id
cross join lateral jsonb_array_elements(a.results) as item
where (item->>'correct')::boolean = false;

comment on view public.wrong_items_v is
  '오답만 펼쳐서 한 row = 한 오답. RLS는 quiz_attempts에서 상속. 2026-05-28 topic 추가.';
