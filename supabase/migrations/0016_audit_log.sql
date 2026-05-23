-- audit_log — 민감 액션 감사 로그 (PIPA 신고 24시간 대응·이상행위 추적용).
--
-- 기록 대상:
--   - 로그인/로그아웃 (login_success, login_fail, signout_global)
--   - MFA enroll·verify·unenroll
--   - 자료 업로드·삭제·다운로드
--   - 계정 삭제·복구
--   - 관리자성 액션 (있다면)
--
-- 보관: 90일 (vacuum 별도 sprint). 짧으면 신고 늦은 사용자 대응 불가, 길면 PIPA 최소수집 위반.
-- IP는 ipv4·ipv6 모두 수용 위해 inet.
-- actor: 로그인 안 된 액션(brute force 시도)도 기록 → owner_id null 허용.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  action text not null,                     -- 화이트리스트 enum 대신 text — 신규 액션 추가 부담 낮춤
  target_type text,                         -- "material", "course", "session" 등
  target_id text,                           -- target FK는 cascade 정책 통일 어려워 text로 freeze
  ip inet,
  user_agent text,
  metadata jsonb default '{}'::jsonb,       -- 액션별 추가 컨텍스트 (실패 사유 등)
  created_at timestamptz not null default now()
);

-- 조회 인덱스: 사용자 본인의 최근 로그 / 액션별 최근
create index if not exists audit_log_owner_created_idx
  on public.audit_log (owner_id, created_at desc);
create index if not exists audit_log_action_created_idx
  on public.audit_log (action, created_at desc);

-- RLS: 본인만 자기 로그 조회. INSERT는 service-role만 (앱 서버에서 박음).
-- 사용자가 직접 audit_log에 INSERT/UPDATE/DELETE 못 함 — 감사 무결성.
alter table public.audit_log enable row level security;

drop policy if exists "audit_log own read" on public.audit_log;
create policy "audit_log own read" on public.audit_log
  for select using (auth.uid() = owner_id);

-- INSERT/UPDATE/DELETE 정책은 의도적으로 안 만듦 → service-role만 통과 (RLS bypass)
