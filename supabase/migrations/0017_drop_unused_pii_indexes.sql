-- PII 인덱스 정리 (2026-05 보안 sprint).
--
-- profiles_email_idx는 created at 0001_init.sql 시점에 만들어졌지만
-- 실제 search-by-email 기능이 없음 (sidebar·onboarding은 본인 row만 SELECT *).
-- 인덱스 자체가 유출 통로는 아니지만:
--   - pg_stats / pg_class 노출 시 cardinality로 사용자 수 추정 가능
--   - 최소권한 원칙 — 안 쓰는 인덱스 제거
--
-- profiles.email 컬럼 자체 제거(auth.users와 중복)는 sidebar/onboarding 의존성
-- 정리 후 별도 sprint.

drop index if exists public.profiles_email_idx;
