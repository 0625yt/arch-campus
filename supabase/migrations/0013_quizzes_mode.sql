-- quizzes에 mode 컬럼 추가 — 'generated' vs 'extracted' 구분
--
-- 의도:
--   - type=exam 자료의 기출 추출 결과를 quizzes에 재사용 (별도 테이블 만들지 않음)
--   - 풀이 모드에서 mode='extracted'면 정답·해설 노출 타이밍 제어 가능
--     (사용자가 답 입력 후에만 노출 — CLAUDE.md §4 치팅 라인)
--   - generated와 extracted를 분리 조회하면 history·복습 큐에서 다르게 표시 가능

alter table public.quizzes
  add column if not exists mode text not null default 'generated'
    check (mode in ('generated', 'extracted'));

comment on column public.quizzes.mode is
  'generated=AI가 자료 기반으로 새로 만든 문제. extracted=PDF에 이미 있던 기출문제를 추출만 한 것.';

-- 풀이 모드에서 quiz 조회 시 mode별 필터링 빠르게
create index if not exists quizzes_owner_mode_idx
  on public.quizzes(owner_id, mode);

-- PostgREST 캐시 reload
notify pgrst, 'reload schema';
