-- jobs.tool CHECK 제약 확장
--
-- 의도:
--   - 그동안 wizard·chat 도구가 새로 추가됐지만 CHECK 제약은 0014에서 멈춰있어
--     report-checklist·chat·chat-free·report-structure가 enqueueJob에서 막힘
--   - report-structure는 신규(이번 sprint), report-checklist·chat·chat-free는 그 사이 추가됐던 것
--   - 적용 후 즉시 위 4개 ToolKind가 jobs 테이블에 INSERT 가능

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
  'exam-extract',
  'report-checklist',
  'report-structure',
  'chat',
  'chat-free'
));

notify pgrst, 'reload schema';
