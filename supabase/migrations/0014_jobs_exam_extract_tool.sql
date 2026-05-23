-- jobs.tool CHECK 제약에 'exam-extract' 추가
--
-- 의도:
--   - sprint B의 기출 추출(/api/materials/[id]/exam-extract)가 enqueueJob 단계에서
--     CHECK 제약에 막혀 Postgres 23514(check_violation)로 실패하는 것을 막음
--   - 0011에서 jobs.tool CHECK가 정의된 후 'convert-pdf'만 추가됐고
--     이번 sprint에서 'exam-extract'가 새 ToolKind로 들어옴
--   - 마이그레이션 미적용 시 기출 추출 기능 전체가 동작 안 함

alter table public.jobs drop constraint if exists jobs_tool_check;
alter table public.jobs add constraint jobs_tool_check check (tool in (
  'summarize',
  'quiz',
  'presentation',
  'wizard-cram',
  'wizard-assignment',
  'wizard-exam',
  'syllabus-extract',
  'timetable-extract',
  'post-mortem',
  'convert-pdf',
  'exam-extract'
));

notify pgrst, 'reload schema';
