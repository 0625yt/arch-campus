-- 개발·프리뷰 환경에서만 의미있는 시드.
-- profiles는 auth.users에 종속이므로 가짜 행을 만들기 위해 service-role로 auth.users insert 후 trigger가 profiles 자동 생성.
-- 프로덕션에 인증을 붙인 뒤엔 이 시드 user를 삭제하거나 그대로 두고 RLS로 격리됨.

-- arch-campus DEV 사용자 (CLAUDE.md §1 — auth 도입 전 임시)
-- 이 UUID는 src/lib/auth.ts의 DEV_FALLBACK_USER_ID와 일치해야 함.
do $$
declare
  dev_uid uuid := '00000000-0000-0000-0000-000000000001';
begin
  -- auth.users에 시드 (이미 있으면 스킵)
  if not exists (select 1 from auth.users where id = dev_uid) then
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_super_admin
    ) values (
      dev_uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'dev@arch-campus.local',
      crypt('archcampus-dev-only', gen_salt('bf')),
      now(), now(), now(),
      jsonb_build_object('provider', 'dev', 'providers', array['dev']),
      jsonb_build_object('display_name', '윤태경'),
      false
    );
  end if;

  -- profiles는 트리거로 자동 생성됐을 것. 누락 시 수동 보정.
  insert into public.profiles (id, email, display_name, university, department, year, semester_year, semester_term, weak_spots, preferred_style, weekly_hours)
  values (
    dev_uid, 'dev@arch-campus.local', '윤태경', '서울대', '컴퓨터공학과',
    3, 2026, 'spring',
    array['수학적 증명', '긴 영어 논문'],
    'visual', 12
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    university = excluded.university,
    department = excluded.department,
    year = excluded.year,
    semester_year = excluded.semester_year,
    semester_term = excluded.semester_term,
    weak_spots = excluded.weak_spots,
    preferred_style = excluded.preferred_style,
    weekly_hours = excluded.weekly_hours;

  -- 샘플 과목 4개
  insert into public.courses (id, owner_id, name, professor, target_grade, color)
  values
    ('11111111-0000-0000-0000-000000000001', dev_uid, '운영체제', '김지훈', 'A', '#7aa6d6'),
    ('11111111-0000-0000-0000-000000000002', dev_uid, '자료구조', '박서연', 'A+', '#e0445e'),
    ('11111111-0000-0000-0000-000000000003', dev_uid, '데이터베이스', '이민호', 'A', '#34c759'),
    ('11111111-0000-0000-0000-000000000004', dev_uid, '알고리즘', '최도현', 'A', '#ff9500')
  on conflict (id) do update set
    name = excluded.name,
    professor = excluded.professor;
end $$;
