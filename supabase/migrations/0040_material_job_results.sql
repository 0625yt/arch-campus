-- Fence result writes and completion in the same transaction. AI billing stays per actual call.
create function public.commit_material_job_result(
  p_job_id uuid,
  p_owner_id uuid,
  p_retry_count integer,
  p_material_id uuid,
  p_model_id text,
  p_usage jsonb,
  p_cost_usd numeric,
  p_result jsonb,
  p_quiz jsonb default null,
  p_generation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_job public.jobs%rowtype;
  saved_result jsonb;
  saved_quiz uuid;
  quiz_course uuid;
begin
  if p_retry_count is null or p_retry_count not between 0 and 1 then
    raise exception 'invalid job attempt';
  end if;
  select * into current_job from public.jobs
  where id = p_job_id and owner_id = p_owner_id and material_id = p_material_id
    and tool in ('summarize', 'quiz')
  for update;
  if not found or current_job.retry_count <> p_retry_count then
    return null;
  end if;
  -- A replay reads the already committed result without writing another quiz or summary.
  if current_job.status = 'done' then
    return current_job.result;
  end if;
  if current_job.status <> 'running' then return null; end if;

  if p_model_id is null or char_length(p_model_id) not between 1 and 200
    or p_result is null or jsonb_typeof(p_result) <> 'object'
    or p_usage is null or jsonb_typeof(p_usage) <> 'object'
    or p_cost_usd is null or p_cost_usd not between 0 and 10000 then
    raise exception 'invalid job result';
  end if;
  if not (p_usage ?& array['inputTokens','outputTokens','cacheReadTokens','cacheCreationTokens'])
    or (p_usage->>'inputTokens')::integer < 0
    or (p_usage->>'outputTokens')::integer < 0
    or (p_usage->>'cacheReadTokens')::integer < 0
    or (p_usage->>'cacheCreationTokens')::integer < 0 then
    raise exception 'invalid job usage';
  end if;

  perform 1 from public.materials where id = p_material_id and owner_id = p_owner_id for update;
  if not found then return null; end if;
  if p_generation_id is not null then
    perform 1 from public.generations
    where id = p_generation_id and owner_id = p_owner_id and material_id = p_material_id;
    if not found then raise exception 'invalid job generation'; end if;
  end if;

  if current_job.tool = 'summarize' then
    if p_quiz is not null or jsonb_typeof(p_result->'summary') is distinct from 'object' then
      raise exception 'invalid summary result';
    end if;
    update public.materials set
      summary_payload = p_result->'summary',
      summary_keywords = array(select jsonb_array_elements_text(p_result->'summary'->'keywords')),
      summary_model_id = p_model_id,
      last_summarized_at = clock_timestamp()
    where id = p_material_id and owner_id = p_owner_id;
    saved_result := jsonb_build_object('summary', p_result->'summary');
  else
    if p_quiz is null or jsonb_typeof(p_quiz->'questions') is distinct from 'array'
      or jsonb_array_length(p_quiz->'questions') not between 1 and 50 then
      raise exception 'invalid quiz result';
    end if;
    quiz_course := nullif(p_quiz->>'course_id', '')::uuid;
    if quiz_course is not null then
      perform 1 from public.courses where id = quiz_course and owner_id = p_owner_id for key share;
      if not found then raise exception 'invalid quiz course'; end if;
    end if;
    insert into public.quizzes(id, owner_id, material_id, course_id, title, difficulty,
      question_count, questions, watermark, model_id, generation_id)
    values ((p_quiz->>'id')::uuid, p_owner_id, p_material_id, quiz_course,
      p_quiz->>'title', p_quiz->>'difficulty', jsonb_array_length(p_quiz->'questions'),
      p_quiz->'questions', p_quiz->>'watermark', p_model_id, p_generation_id)
    returning id into saved_quiz;
    saved_result := jsonb_build_object('quizId', saved_quiz, 'quality', p_result->'quality');
  end if;

  perform public.record_job_attempt_checkpoint(
    p_job_id, p_owner_id, p_retry_count, 'verifying-output', 85::smallint, null
  );
  update public.jobs set status = 'done', result = saved_result, error_message = null,
    model_id = p_model_id, cost_usd = p_cost_usd, generation_id = p_generation_id,
    input_tokens = (p_usage->>'inputTokens')::integer,
    output_tokens = (p_usage->>'outputTokens')::integer,
    cache_read_tokens = (p_usage->>'cacheReadTokens')::integer,
    cache_creation_tokens = (p_usage->>'cacheCreationTokens')::integer,
    finished_at = clock_timestamp()
  where id = p_job_id and owner_id = p_owner_id;
  return saved_result;
end;
$$;

revoke all on function public.commit_material_job_result(uuid, uuid, integer, uuid, text, jsonb, numeric, jsonb, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.commit_material_job_result(uuid, uuid, integer, uuid, text, jsonb, numeric, jsonb, jsonb, uuid)
  to service_role;
notify pgrst, 'reload schema';
