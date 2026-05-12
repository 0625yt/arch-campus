-- Material에 캐시된 요약 결과 박기
-- 의도: study/[material] 페이지가 매번 generations 테이블 조인 안 하고
--       materials 한 행에서 요약·키워드·시점 다 읽음.
-- 새 요약 생성될 때마다 /api/summarize가 upsert.

alter table public.materials
  add column if not exists summary_payload jsonb,
  add column if not exists summary_keywords text[],
  add column if not exists summary_model_id text,
  add column if not exists last_summarized_at timestamptz;

-- 빠른 정렬용
create index if not exists materials_owner_summarized_idx
  on public.materials(owner_id, last_summarized_at desc nulls last);

-- PostgREST 스키마 캐시 갱신 — Supabase는 마이그레이션 후 즉시 반영 안 됨
notify pgrst, 'reload schema';
