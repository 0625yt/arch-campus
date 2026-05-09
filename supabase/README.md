# Supabase 마이그레이션

이 폴더의 SQL 파일은 **순서대로** 실행되어야 합니다 (`0001_init.sql` → `0002_storage.sql` → ...).

## 적용 방법 — 둘 중 하나

### A. 대시보드에서 직접 (간단, 처음 한 번)

1. https://supabase.com/dashboard → 프로젝트 선택
2. 왼쪽 사이드바 **SQL Editor**
3. "New query" → `0001_init.sql` 내용 통째로 붙여넣기 → **RUN**
4. 같은 방식으로 `0002_storage.sql`
5. 결과: Tables 메뉴에 `profiles · courses · materials · generations` / Storage에 `materials` 버킷

### B. Supabase CLI로 (협업·CI 시)

```bash
# 한 번만: CLI 설치
npm install -g supabase

# 로그인
supabase login

# 프로젝트 연결 (.env.local의 SUPABASE_PROJECT_REF 사용)
supabase link --project-ref $SUPABASE_PROJECT_REF

# 마이그레이션 push
supabase db push
```

## 변경 시 규칙

- 기존 파일을 **수정하지 않음**. 새 변경은 새 파일 (`0003_xxx.sql`)
- DESTRUCTIVE 마이그레이션(컬럼 삭제·타입 변경)은 사용자에게 한 번 더 확인
- 모든 새 테이블에 RLS 활성화 + `auth.uid() = owner_id` 정책 필수 (CLAUDE.md §1)

## RLS 정책 요약

| 테이블 | select | insert | update | delete |
|---|---|---|---|---|
| profiles | 본인만 | 본인만 (트리거가 자동) | 본인만 | (cascade) |
| courses | 본인만 | 본인만 | 본인만 | 본인만 |
| materials | 본인만 | 본인만 | 본인만 | 본인만 |
| generations | 본인만 | 본인만 | service_role만 | service_role만 |
| storage.materials | 첫 폴더 = uid | 동일 | 동일 | 동일 |

`generations`는 **immutable 기록** — 사용자가 자기 비용 기록을 수정 못 하게 의도. service_role(서버)만 정정 가능.

## 트리거

- `auth.users` insert → `handle_new_user()` → `profiles` 자동 행 생성
- 모든 `updated_at`은 `touch_updated_at()` 트리거 자동 갱신 (현재는 profiles만)

## 환경변수 매핑 (.env.local)

| 변수 | 어디서 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API → service_role |
| `SUPABASE_PROJECT_REF` | Settings → General → Reference ID |
| `SUPABASE_DB_URL` | Database → Connection string → URI (CLI 쓸 때만) |
