-- quizzes.question_count CHECK 제약 1~20 → 1~30 확장
--
-- 의도:
--   사용자가 "시험 직전 대량 점검" 유스케이스로 20·30 문제를 자주 요청.
--   기존 1~10 옵션 chip(UI) + 1~10 zod cap을 1~30으로 풀면서 DB CHECK도 같이 풀어야
--   INSERT 단계에서 23514 (check_violation)으로 잡 실패 → "퀴즈가 안 만들어짐"으로 보임.
--
-- 변경:
--   1) 기존 quizzes_question_count_check 드롭 (이름은 Postgres가 자동 부여, 컬럼 기반 lookup)
--   2) 1~30으로 새로 박음
--
-- 영향:
--   - 비파괴. 기존 1~20 데이터는 모두 1~30 안이라 그대로 통과.
--   - extracted 모드(기출 추출)도 같은 컬럼 쓰지만 추출은 1~30 안에 자연스럽게 들어감.

alter table public.quizzes
  drop constraint if exists quizzes_question_count_check;

alter table public.quizzes
  add constraint quizzes_question_count_check
  check (question_count between 1 and 30);

-- PostgREST 캐시 reload
notify pgrst, 'reload schema';
