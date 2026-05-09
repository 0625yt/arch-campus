-- PostgREST schema cache 강제 새로고침
-- 마이그레이션 직후 새 테이블·컬럼이 'Could not find the table ... in the schema cache'로 보일 때 실행.
NOTIFY pgrst, 'reload schema';
