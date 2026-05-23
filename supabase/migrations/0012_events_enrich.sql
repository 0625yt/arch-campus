-- 일정 폼 풍부화 — macOS Calendar 새 이벤트 popover 톤으로 맞춤.
-- 추가 필드:
--   color           : 일정별 색상 직접 지정 (강의 색이 우선이지만 직접 입력 일정·과제 등은 학생이 색 골라 구분)
--   location        : 강의실·온라인 링크·장소
--   recurrence_rule : iCalendar RRULE 문자열 (예: "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260622T140000Z").
--                     수업은 시간표 import가 회차를 하나씩 박는 방식이므로 사용 빈도는 사용자 직접 입력 위주.
--   reminder_minutes: 시작 N분 전 알림 (NULL이면 알림 X). 0=정시, 10=10분 전, 60=1시간 전, 1440=하루 전.
--
-- 모두 NULL 허용 — 기존 행은 NULL로 두고 신규/수정 시 채워짐.

alter table public.events
  add column if not exists color text,
  add column if not exists location text,
  add column if not exists recurrence_rule text,
  add column if not exists reminder_minutes integer;

-- color: hex(#RRGGBB) 또는 토큰 키만 허용 — 자유 문자열 방지
alter table public.events
  drop constraint if exists events_color_format_chk;
alter table public.events
  add constraint events_color_format_chk
  check (color is null or color ~ '^#[0-9A-Fa-f]{6}$');

-- reminder_minutes: 음수·과도한 값 차단. 0~10080(7일) 범위.
alter table public.events
  drop constraint if exists events_reminder_range_chk;
alter table public.events
  add constraint events_reminder_range_chk
  check (reminder_minutes is null or (reminder_minutes >= 0 and reminder_minutes <= 10080));

-- PostgREST 캐시 reload
notify pgrst, 'reload schema';
