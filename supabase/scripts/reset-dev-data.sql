-- DEV 사용자(00000000-0000-0000-0000-000000000001)가 만든 모든 학습 데이터 리셋
--
-- 지움:
--   - 0003_dev_seed.sql에서 박은 mock 강의 4개 (운영체제·자료구조·데이터베이스·알고리즘)
--   - 테스트하면서 업로드한 자료 (materials)
--   - 만들어진 퀴즈 + 풀이 기록 (quizzes, quiz_attempts)
--   - AI 호출 기록·비용 (generations)
--   - 일정 (events)
--
-- 안 지움:
--   - profiles (페르소나 정보 — 그대로 살림)
--   - auth.users 본인 (세션 유지)
--   - Storage 파일 (Storage는 별도 — 필요하면 Supabase Dashboard에서 직접)
--
-- 사용법:
--   Supabase Dashboard → SQL Editor에서 통째 실행

do $$
declare
  dev_uid uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- foreign key 의존 순서대로 (자식부터)
  delete from public.quiz_attempts where owner_id = dev_uid;
  delete from public.quizzes where owner_id = dev_uid;
  delete from public.events where owner_id = dev_uid;
  delete from public.generations where owner_id = dev_uid;
  delete from public.materials where owner_id = dev_uid;
  delete from public.courses where owner_id = dev_uid;
end $$;

-- 확인 — 모두 0이어야 함
select 'courses' as t, count(*) from public.courses where owner_id = '00000000-0000-0000-0000-000000000001'
union all
select 'materials', count(*) from public.materials where owner_id = '00000000-0000-0000-0000-000000000001'
union all
select 'quizzes', count(*) from public.quizzes where owner_id = '00000000-0000-0000-0000-000000000001'
union all
select 'quiz_attempts', count(*) from public.quiz_attempts where owner_id = '00000000-0000-0000-0000-000000000001'
union all
select 'events', count(*) from public.events where owner_id = '00000000-0000-0000-0000-000000000001'
union all
select 'generations', count(*) from public.generations where owner_id = '00000000-0000-0000-0000-000000000001';
