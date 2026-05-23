-- audit_log day-level rollup view.
--
-- 목적:
--   - PIPA 신고 24h 대응 시 "이 사용자가 언제 무엇을 했나" 빠르게 조회
--   - 백오피스 dashboard에서 "지난 7일 액션별 횟수" 그래프
--   - 무차별 시도 (login.fail 폭주 등) 일일 감지
--
-- 정책:
--   - VIEW로 구현 — 별도 cron·테이블 필요 없음. 한 사용자의 행이 적어(평균 100~500/일) 비용 OK
--   - 인덱스는 raw audit_log의 (action, created_at)·(owner_id, created_at)에 의존 (이미 0016에 박힘)
--   - service-role만 SELECT — 사용자 본인은 자기 raw 로그만 조회. 집계는 운영자용.

create or replace view public.audit_log_daily as
select
  date_trunc('day', created_at) as day,
  owner_id,
  action,
  count(*) as action_count,
  count(distinct ip) as distinct_ip_count,
  min(created_at) as first_at,
  max(created_at) as last_at
from public.audit_log
group by date_trunc('day', created_at), owner_id, action;

comment on view public.audit_log_daily is
  'audit_log을 (day, owner_id, action)으로 집계. PIPA 신고 24h 대응·무차별 시도 감지·백오피스 대시보드용.';

-- View는 base table의 RLS를 상속. owner_id IS NULL row(로그인 안 된 액션)는
-- 사용자 본인에게 안 보임 — 운영자만 service-role로 조회.
