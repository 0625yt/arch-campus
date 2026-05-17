-- 0011_materials_pdf_convert.sql
-- ─────────────────────────────────────────────────────────
-- Office → PDF 자동 변환을 위한 두 가지 변경:
--   1) materials.original_storage_path — 원본 파일 경로 보존
--   2) jobs.tool CHECK 제약에 'convert-pdf' 추가
-- ─────────────────────────────────────────────────────────

-- 1) 원본 경로 보존 컬럼
alter table public.materials
  add column if not exists original_storage_path text;

comment on column public.materials.original_storage_path is
  'Office → PDF 자동 변환 시 원본 파일 경로 보존. NULL이면 업로드 그대로가 storage_path.';

-- 2) jobs.tool CHECK 갱신 (기존 9개 + convert-pdf)
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
  'convert-pdf'
));
