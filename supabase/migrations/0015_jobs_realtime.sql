-- jobs 테이블 Supabase Realtime 활성화 — polling 제거를 위한 인프라.
--
-- 효과:
--   - 기존 useJob 훅이 1.5초 간격 GET /api/jobs/{id} → Realtime postgres_changes 구독
--   - 잡 status 바뀌면 ~200ms 내 push (vs 평균 750ms polling 지연)
--   - Vercel 인보케이션 ↓ (잡 1개당 GET 30~40번 → 0번)
--
-- 보안:
--   - jobs 테이블 RLS는 0008 이전부터 owner_id 기반 정책 보유. Realtime은 그 정책을 그대로 평가.
--   - 클라이언트가 다른 사용자 잡을 구독하려 해도 RLS에 의해 row 안 받음.
--
-- replica identity:
--   - default는 PK만 보냄. update payload에 다른 컬럼 받으려면 full 필요.
--   - jobs row가 작아서 full overhead 무시 가능.

alter table public.jobs replica identity full;

alter publication supabase_realtime add table public.jobs;

notify pgrst, 'reload schema';
