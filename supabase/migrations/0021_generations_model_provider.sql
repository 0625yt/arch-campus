-- 2026-05-28 — Vercel AI Gateway 도입, vendor 라벨 추가.
--
-- 변경 동기:
--   - 단일벤더(Claude) 가정에서 멀티벤더(Anthropic + Google + …)로 확장.
--   - 같은 도구를 vendor 분기로 A/B 돌릴 때 비용·품질 회귀를 generations 로그에서 바로 비교.
--   - model_id 안에 vendor가 슬러그 prefix로 들어가 있으나, prefix 표기가 시간이 지나면 바뀔 수 있어
--     별도 컬럼으로 영구 라벨링.
--
-- 호환성:
--   - NULL 허용. 마이그레이션 이전 row는 그대로 두고 신규 row부터 채움(backfill X).
--   - CHECK는 vendor 값만 검증. NULL/'anthropic'/'google'만 통과.
--   - 인덱스는 vendor별 비용 집계용 — (owner, provider, created) 단방향.

alter table public.generations
  add column if not exists model_provider text;

alter table public.generations
  add constraint generations_model_provider_check
  check (model_provider is null or model_provider in ('anthropic', 'google'));

create index if not exists generations_owner_provider_created_idx
  on public.generations(owner_id, model_provider, created_at desc);

comment on column public.generations.model_provider is
  'AI Gateway 벤더 라벨. NULL = 마이그레이션 이전 또는 미분류. 2026-05-28 추가.';
