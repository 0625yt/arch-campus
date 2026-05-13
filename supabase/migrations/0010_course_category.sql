-- 강의·공부 주제 분리.
--
-- 초기 모델은 courses가 "학기 강의"만 가정했다. 하지만 학생은 자격증·
-- 토익·공무원·개인 프로젝트 같은 "수업 아닌 공부"도 같은 학습 루프
-- (자료 업로드 → 요약 → 문제 → 오답 복습)를 돌리고 싶어한다.
--
-- 같은 courses 테이블을 재사용하되 category로 구분:
--   - semester: 한 학기에 듣는 정규 강의 (시간표·강의계획서에서 온 것)
--   - personal: 자격증·시험 준비·개인 공부 (학생이 직접 만든 것)
--
-- 공부 탭에서 두 그룹을 다른 섹션으로 그리고, 사이드바도 동일.

alter table public.courses
  add column if not exists category text not null default 'semester'
    check (category in ('semester', 'personal'));

comment on column public.courses.category is
  'semester=시간표·강의계획서에서 자동 등록된 한 학기 정규 강의. '
  'personal=학생이 직접 만든 자격증·시험·개인 공부 주제.';

-- 기존 행은 전부 semester로 둔다 (default가 처리). 시간표 import 경로는
-- 항상 semester로 INSERT 하므로 별도 백필 없음.

create index if not exists courses_owner_category_idx
  on public.courses(owner_id, category)
  where archived = false;
