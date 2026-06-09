-- quizzes.question_count CHECK 제약 1~30 → 1~100 확장
--
-- 의도:
--   기출문제(type=exam) 추출은 자료에 적힌 문제를 빠짐없이 그대로 가져온다.
--   TOEIC Part 5 50제·100제처럼 한 자료에 50~100문제가 흔해, 코드 상한(exam-extract 100,
--   일반 퀴즈 50)을 풀어도 DB CHECK가 1~30이면 INSERT에서 23514 (check_violation)으로
--   "추출 결과 저장 실패: ... violates check constraint quizzes_question_count_check" 발생.
--   (2026-06-09 prod 실측: TOEIC 50제 추출 시 이 에러로 저장 실패.)
--
-- 변경:
--   1) 기존 quizzes_question_count_check 드롭 (이름은 Postgres가 컬럼 기반 자동 부여)
--   2) 1~100으로 새로 박음 (exam-extract 상한 100 = 단일 호출 maxTokens 32000 안)
--
-- 영향:
--   - 비파괴. 기존 1~30 데이터는 모두 1~100 안이라 그대로 통과.
--   - 일반 생성 퀴즈(mode=generated)·기출 추출(mode=extracted) 둘 다 같은 컬럼 사용.

alter table public.quizzes
  drop constraint if exists quizzes_question_count_check;

alter table public.quizzes
  add constraint quizzes_question_count_check
  check (question_count between 1 and 100);

-- PostgREST 캐시 reload
notify pgrst, 'reload schema';
