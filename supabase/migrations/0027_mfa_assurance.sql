-- Opt-in MFA: once a verified factor exists, an AAL1 token cannot access user data.
-- A restrictive policy is ANDed with existing owner policies, never replaces them.
create or replace function public.has_required_assurance()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified'
    )
  );
$$;
revoke all on function public.has_required_assurance() from public, anon;
grant execute on function public.has_required_assurance() to authenticated;

do $$
declare target text;
begin
  foreach target in array array['profiles','courses','materials','generations','quizzes',
    'quiz_attempts','events','jobs','chat_threads','chat_messages','audit_log']
  loop
    execute format('create policy require_verified_mfa on public.%I as restrictive for all to authenticated using ((select public.has_required_assurance())) with check ((select public.has_required_assurance()))', target);
  end loop;
end $$;
create policy require_verified_mfa on storage.objects as restrictive
  for all to authenticated
  using ((select public.has_required_assurance()))
  with check ((select public.has_required_assurance()));
