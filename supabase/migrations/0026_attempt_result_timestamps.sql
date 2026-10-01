-- 문제별 마지막 채점 시각을 기준으로 오답과 최근 풀이를 계산한다.
--
-- 하나의 attempt를 며칠 뒤 이어 풀 수 있으므로 attempt.created_at만 보면 정확하지 않다.
-- 앱은 각 results 항목에 gradedAt(ISO timestamptz)을 저장한다. 기존 데이터는 gradedAt이
-- 없으므로 created_at으로 안전하게 폴백한다. created_at 자체는 최초 풀이 시각으로 보존한다.

create or replace view public.wrong_items_v
with (security_invoker = true) as
with expanded as (
  select
    a.id           as attempt_id,
    a.owner_id     as owner_id,
    a.quiz_id      as quiz_id,
    case
      when item->>'gradedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
        then (item->>'gradedAt')::timestamptz
      else a.created_at
    end            as attempted_at,
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
    row_number() over (
      partition by a.owner_id, a.quiz_id, (item->>'questionId')::int
      order by
        case
          when item->>'gradedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
            then (item->>'gradedAt')::timestamptz
          else a.created_at
        end desc,
        a.id desc
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
  (
    select item2->>'topic'
    from jsonb_array_elements(e.questions) as item2
    where (item2->>'id')::int = e.question_id
    limit 1
  ) as topic
from expanded e
where e.rn = 1
  and e.correct = false;

comment on view public.wrong_items_v is
  '한 row = 한 (quiz,question)의 마지막 채점이 오답인 항목. '
  'results[].gradedAt 기준이며 기존 결과는 attempt.created_at으로 폴백한다.';

create or replace view public.attempt_summary_v
with (security_invoker = true) as
select
  a.id              as attempt_id,
  a.owner_id        as owner_id,
  a.quiz_id         as quiz_id,
  a.score           as score,
  a.total           as total,
  a.duration_ms     as duration_ms,
  coalesce(activity.last_graded_at, a.created_at) as attempted_at,
  a.results         as results,
  a.answers         as answers,
  q.material_id     as material_id,
  q.course_id       as course_id,
  q.title           as quiz_title,
  q.difficulty      as quiz_difficulty,
  q.questions       as questions,
  q.watermark       as watermark
from public.quiz_attempts a
join public.quizzes q on q.id = a.quiz_id
left join lateral (
  select max(
    case
      when item->>'gradedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
        then (item->>'gradedAt')::timestamptz
      else a.created_at
    end
  ) as last_graded_at
  from jsonb_array_elements(a.results) as item
) activity on true;

comment on view public.attempt_summary_v is
  '한 attempt의 모든 정보. attempted_at은 문제별 마지막 채점 시각이며 최초 시각은 quiz_attempts.created_at에 보존된다.';
