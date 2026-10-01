-- 무학점 P/NP·NP 과목을 성적표와 시간표에 기록할 수 있게 한다.

alter table public.courses
  drop constraint if exists courses_credits_check;

alter table public.courses
  add constraint courses_credits_check
    check (credits is null or (credits >= 0 and credits <= 30 and credits * 2 = trunc(credits * 2)));

comment on column public.courses.credits is
  '성적 계산에 사용하는 이수학점. 무학점 과목은 0, 그 외에는 0.5 단위.';

notify pgrst, 'reload schema';
