-- 0027 이후 추가된 복습 테이블에도 동일한 AAL2 제한을 적용한다.
create policy require_verified_mfa on public.review_cards as restrictive
  for all to authenticated
  using ((select public.has_required_assurance()))
  with check ((select public.has_required_assurance()));

create policy require_verified_mfa on public.review_logs as restrictive
  for all to authenticated
  using ((select public.has_required_assurance()))
  with check ((select public.has_required_assurance()));

notify pgrst, 'reload schema';
