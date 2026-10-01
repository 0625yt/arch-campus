-- 사용자별 월간 AI 사용량 집계.
-- generations(대부분의 도구)와 chat_messages(자료 RAG 챗)를 합쳐 중복 없이 계산한다.

create or replace function public.get_monthly_ai_usage(
  p_owner_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
returns table (
  tool text,
  call_count bigint,
  input_tokens bigint,
  output_tokens bigint,
  cache_read_tokens bigint,
  cache_creation_tokens bigint,
  cost_usd numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and auth.uid() is distinct from p_owner_id then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  select
    usage_rows.tool,
    count(*)::bigint as call_count,
    coalesce(sum(usage_rows.input_tokens), 0)::bigint as input_tokens,
    coalesce(sum(usage_rows.output_tokens), 0)::bigint as output_tokens,
    coalesce(sum(usage_rows.cache_read_tokens), 0)::bigint as cache_read_tokens,
    coalesce(sum(usage_rows.cache_creation_tokens), 0)::bigint as cache_creation_tokens,
    coalesce(sum(usage_rows.cost_usd), 0)::numeric as cost_usd
  from (
    select
      g.tool,
      g.input_tokens,
      g.output_tokens,
      g.cache_read_tokens,
      g.cache_creation_tokens,
      g.cost_usd
    from public.generations g
    where g.owner_id = p_owner_id
      and g.created_at >= p_start
      and g.created_at < p_end

    union all

    select
      'chat'::text as tool,
      m.input_tokens,
      m.output_tokens,
      m.cache_read_tokens,
      m.cache_creation_tokens,
      m.cost_usd
    from public.chat_messages m
    where m.owner_id = p_owner_id
      and m.role = 'assistant'
      and m.created_at >= p_start
      and m.created_at < p_end
  ) usage_rows
  group by usage_rows.tool
  order by sum(usage_rows.cost_usd) desc, count(*) desc;
end;
$$;

revoke all on function public.get_monthly_ai_usage(uuid, timestamptz, timestamptz) from public;
revoke all on function public.get_monthly_ai_usage(uuid, timestamptz, timestamptz) from anon;
grant execute on function public.get_monthly_ai_usage(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.get_monthly_ai_usage(uuid, timestamptz, timestamptz) to service_role;

comment on function public.get_monthly_ai_usage(uuid, timestamptz, timestamptz) is
  '본인 또는 service_role만 generations와 자료 챗 비용을 기간별 도구 단위로 집계한다.';

notify pgrst, 'reload schema';
