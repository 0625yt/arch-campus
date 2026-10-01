-- 학기별 시간표와 성적/평점 관리.
-- 기존 강의의 term_start를 우선 사용하고, 없는 정규 강의는 마이그레이션 시점의 학기로 보수적으로 배정한다.

alter table public.courses
  add column if not exists semester_year smallint,
  add column if not exists semester_term text,
  add column if not exists credits numeric(3,1),
  add column if not exists grade text;

update public.courses
set
  semester_year = coalesce(
    extract(year from term_start)::smallint,
    case when extract(month from current_date) <= 2 then extract(year from current_date)::smallint - 1
         else extract(year from current_date)::smallint end
  ),
  semester_term = coalesce(
    semester_term,
    case
      when term_start is not null and extract(month from term_start) between 3 and 6 then 'spring'
      when term_start is not null and extract(month from term_start) between 7 and 8 then 'summer'
      when term_start is not null and extract(month from term_start) between 9 and 12 then 'fall'
      when term_start is not null then 'winter'
      when extract(month from current_date) <= 2 then 'winter'
      when extract(month from current_date) <= 6 then 'spring'
      when extract(month from current_date) <= 8 then 'summer'
      else 'fall'
    end
  )
where category = 'semester' and (semester_year is null or semester_term is null);

alter table public.courses
  add constraint courses_semester_year_check
    check (semester_year is null or semester_year between 2000 and 2100),
  add constraint courses_semester_term_check
    check (semester_term is null or semester_term in ('spring','summer','fall','winter')),
  add constraint courses_semester_identity_check
    check (category <> 'semester' or (semester_year is not null and semester_term is not null)),
  add constraint courses_credits_check
    check (credits is null or (credits > 0 and credits <= 30 and credits * 2 = trunc(credits * 2))),
  add constraint courses_grade_check
    check (grade is null or grade in ('A+','A0','B+','B0','C+','C0','D+','D0','F','P','NP'));

create index if not exists courses_owner_semester_idx
  on public.courses(owner_id, semester_year desc, semester_term)
  where category = 'semester' and archived = false;

comment on column public.courses.semester_year is '수강 학기 연도. 개인 공부는 NULL.';
comment on column public.courses.semester_term is 'spring=1학기, summer=여름, fall=2학기, winter=겨울.';
comment on column public.courses.credits is '성적 계산에 사용하는 이수학점. 0.5 단위.';
comment on column public.courses.grade is '4.5 만점 등급. P/NP는 평점 분모에서 제외.';

notify pgrst, 'reload schema';
