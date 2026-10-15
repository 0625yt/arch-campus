begin;

create table public.study_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  daily_minutes integer not null default 45 check (daily_minutes between 15 and 180),
  plans jsonb not null default '[]'::jsonb
    check (jsonb_typeof(plans) = 'array')
    check (jsonb_array_length(plans) <= 30)
    check (octet_length(plans::text) <= 524288),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.study_workspaces enable row level security;
revoke all on public.study_workspaces from anon, authenticated;
grant select on public.study_workspaces to authenticated;
grant all on public.study_workspaces to service_role;
create policy study_workspace_owner on public.study_workspaces
  for select to authenticated using (owner_id = auth.uid());
create policy study_workspace_assurance on public.study_workspaces
  as restrictive for all to authenticated
  using (public.has_required_assurance()) with check (public.has_required_assurance());

-- The API is the only write path. Ownership is checked again at persistence.
create function public.validate_study_workspace() returns trigger
language plpgsql set search_path = '' as $$
declare
  plan jsonb;
  v_material_id uuid;
  v_course_id uuid;
  v_event_id uuid;
begin
  if tg_op = 'UPDATE' and (new.owner_id <> old.owner_id or new.revision <> old.revision + 1) then
    raise exception 'study workspace revision mismatch' using errcode = '23514';
  end if;
  for plan in select value from jsonb_array_elements(new.plans) loop
    if tg_op = 'UPDATE' and exists (
      select 1 from jsonb_array_elements(old.plans) prior
      where prior->>'id' = plan->>'id'
        and prior->'courseId' = plan->'courseId'
        and prior->'materialIds' = plan->'materialIds'
        and prior->'eventId' = plan->'eventId'
    ) then
      -- Already validated references may outlive a deleted source; history remains editable.
      continue;
    end if;
    v_course_id := (plan->>'courseId')::uuid;
    if v_course_id is null or not exists (
      select 1 from public.courses c where c.id = v_course_id and c.owner_id = new.owner_id
    ) then
      raise exception 'study course ownership mismatch' using errcode = '23514';
    end if;
    for v_material_id in select value::uuid from jsonb_array_elements_text(plan->'materialIds') loop
      if not exists (
        select 1 from public.materials m
        where m.id = v_material_id and m.owner_id = new.owner_id and m.course_id = v_course_id
      ) then
        raise exception 'study material ownership mismatch' using errcode = '23514';
      end if;
    end loop;
    v_event_id := (plan->>'eventId')::uuid;
    if v_event_id is not null and not exists (
      select 1 from public.events e
      where e.id = v_event_id and e.owner_id = new.owner_id and e.course_id = v_course_id and e.kind = 'exam'
    ) then
      raise exception 'study event ownership mismatch' using errcode = '23514';
    end if;
  end loop;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.validate_study_workspace() from public, anon, authenticated;
create trigger study_workspace_validation before insert or update on public.study_workspaces
  for each row execute function public.validate_study_workspace();

notify pgrst, 'reload schema';
commit;
