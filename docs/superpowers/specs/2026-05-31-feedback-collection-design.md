# 인앱 피드백 수집 + 관리자 분석 화면 — 1차 설계

작성일: 2026-05-31
범위: 1차 (수집 + 관리자 화면 + 즉석 AI 분석 버튼)

## 목표

학생이 요약/퀴즈 결과에 별점·카테고리·한 줄 의견을 남기면, 관리자(본인)가 한 화면에서 보고 상태 관리하고, 필요하면 AI로 패턴을 묶어 본 뒤 프롬프트 수정 의사결정을 한다. 실제 프롬프트 수정은 사람 + Claude Code 워크플로우로 (자동 적용 X).

## 1차에서 만드는 것 / 안 만드는 것

**만든다:**
- `feedback` 테이블 + RLS
- 요약 상세 페이지 피드백 버튼
- 퀴즈 풀이 화면 문항별 "이 문제 이상해요" 버튼
- 피드백 입력 모달 (별점 1~5 + 카테고리 + 한 줄)
- `/admin/feedback` 리스트 + 필터 + 상세 + 상태 변경
- "선택 항목 AI 묶기" 일회성 분석 버튼 (Haiku 호출, 결과 모달 표시)

**안 만든다 (2차 이후):**
- 주기 cron 클러스터링 / `feedback_cluster` 테이블
- GitHub Issue 자동 생성 (수동: 본인이 Claude Code에 한 줄 지시)
- 시스템 자동 row (Zod 실패·재요청 3회 등)
- `prompt_version` 추적
- 적용 전후 효과 비교 리포트
- CSV 내보내기

## 데이터

**migration `0024_feedback.sql`** (사용자 측에서 이미 적용함):

```sql
create table feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('summary','quiz_item')),
  target_id uuid not null,
  generation_id uuid references generations(id),
  rating int not null check (rating between 1 and 5),
  category text not null,
  body text check (length(body) <= 500),
  status text not null default 'new'
    check (status in ('new','triaged','accepted','wontfix')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index feedback_status_created_idx on feedback(status, created_at desc);
create index feedback_target_idx on feedback(target_type, target_id);

alter table feedback enable row level security;
create policy feedback_owner_insert on feedback for insert with check (owner_id = auth.uid());
create policy feedback_owner_select on feedback for select using (owner_id = auth.uid());
```

`target_id`는 polymorphic 참조라 FK 없이 `target_type`으로 분기. `generation_id`는 원본 LLM 호출 추적의 생명선.

**카테고리 enum (앱 레벨):**
- summary: `accuracy` 정확도 / `omission` 누락 / `format` 형식 / `tone` 말투 / `other` 기타
- quiz_item: `answer_wrong` 정답 오류 / `explanation_wrong` 해설 오류 / `distractor_wrong` 보기 설명 오류 / `unclear` 모호 / `other` 기타

## 학생 측 UI

### 피드백 모달 (`src/components/feedback-modal.tsx`)

- props: `targetType`, `targetId`, `generationId?`, `onClose`
- 별점 1~5 (별 아이콘 5개, 클릭/키보드)
- 카테고리 select (target_type별 옵션 다름)
- body textarea, 500자 카운터
- 제출 → `POST /api/feedback` → 토스트 "피드백 고마워요"
- 같은 (owner, target) 24시간 중복이면 409 → "이미 남기셨어요"

### 트리거 버튼

- **요약 상세** (`summary-column.tsx`): `<article>` 헤더 액션 영역에 작은 "피드백" 버튼. DownloadSummaryButton 옆.
- **퀴즈 풀이** (`/dashboard/quiz/...` 풀이 화면 문항 카드): 카드 하단 푸터에 "이 문제 이상해요" 텍스트 버튼. 풀이 완료 후에도 보이게.

### API `POST /api/feedback`

- Zod body: `{ targetType, targetId(uuid), generationId?(uuid), rating(1-5), category(string), body?(<=500) }`
- 세션 필수 → `owner_id = session.user.id`
- 24시간 중복 차단: `SELECT 1 FROM feedback WHERE owner_id=? AND target_type=? AND target_id=? AND created_at > now() - interval '24 hours'` → 있으면 409
- `category`는 target_type별 허용 enum으로 server 측 재검증
- 성공 시 `{ id }` 반환

## 관리자 측

### 가드

- `process.env.ADMIN_USER_IDS` (콤마 구분 user_id 목록)
- 새로운 미들웨어 분기 또는 `/admin/layout.tsx`에서 서버 측 세션 + 화이트리스트 검사. 둘 다 무방하지만 코드량 적은 layout 가드 채택.
- 비인가 사용자 → `/`로 redirect

### `/admin/feedback` 리스트

- 서버 컴포넌트, `getAdminSupabase()`로 service-role 쿼리 (RLS 우회)
- 필터: `status`(기본 new) · `targetType` · `category` · 별점 ≤ N
- 정렬: 별점 낮은 순 / 신규 순 (URL searchParams)
- 페이지당 50건, "더 보기"
- 컬럼: 별점·카테고리·body 미리보기 60자·target_type·작성시간·상태 배지

### 상세 모달

- 행 클릭 → 모달 (Sheet 컴포넌트 활용)
- 표시: 피드백 원본 + 작성자 이메일/ID + target 링크 + **원본 generation** (generation_id로 join → rawText 또는 payload 일부 + 모델 ID + 토큰 usage)
- 액션 버튼 3개: `triaged` · `accepted` · `wontfix` + `admin_note` 한 줄
- `PATCH /api/admin/feedback/[id]` 호출 → 갱신 후 모달 닫힘 + 리스트 revalidate

### `PATCH /api/admin/feedback/[id]`

- admin 가드 (env 화이트리스트)
- Zod: `{ status, adminNote?(<=500) }`
- service-role로 update, `updated_at = now()`

### "선택 항목 AI 묶기" 버튼

- 리스트 우상단. 체크박스로 선택된 N건이 있거나, "현재 필터 전체 묶기" 옵션
- 클릭 → `POST /api/admin/feedback/analyze` `{ ids: uuid[] }` (또는 `{ filter: {...} }`)
- 서버:
  1. service-role로 해당 feedback들 + generations(있으면) join
  2. target_type별로 그룹화
  3. 각 그룹마다 해당 도구 프롬프트 파일을 `fs.readFile('src/prompts/{tool}.md', 'utf-8')`로 로드
  4. Haiku 4.5에 `(현재 프롬프트, 피드백 N건, 원본 generation 일부)` 묶어서 던짐
  5. 응답 JSON: `{ clusters: [{ title, severity('high'|'mid'|'low'), feedbackIds, suspectedPromptSection, suggestedFix }] }`
  6. DB 저장 X — 일회성. 비용: 50건 < $0.01
- 클라이언트는 결과 카드 목록을 모달에 표시. 카드 펼치면 묶인 피드백 원본 보기.

## 파일 변경

```
신규:
  src/lib/schemas/feedback.ts                    (Zod + enum)
  src/components/feedback-modal.tsx              (입력 UI)
  src/components/feedback-trigger-button.tsx     (트리거 버튼)
  src/app/api/feedback/route.ts                  (POST)
  src/app/admin/layout.tsx                       (admin 가드)
  src/app/admin/feedback/page.tsx                (리스트)
  src/app/admin/feedback/feedback-detail-modal.tsx
  src/app/admin/feedback/analyze-button.tsx
  src/app/api/admin/feedback/[id]/route.ts       (PATCH)
  src/app/api/admin/feedback/analyze/route.ts    (POST)

수정:
  src/app/dashboard/study/[course]/[material]/summary-column.tsx
  (퀴즈 풀이 카드 컴포넌트 — 위치 코드 탐색 후 결정)
  .env.example                                   (ADMIN_USER_IDS 추가)
```

## 비용·성능

- 학생 측 피드백 insert: 일반 Supabase write, 무시 가능
- AI 분석 (Haiku, 50건 + 프롬프트 동봉): 입력 ~5k · 출력 ~2k 토큰 → 약 $0.005 / 호출
- 관리자가 하루 몇 번 누른다고 가정 → 월 1달러 미만

## 테스트

**Vitest:**
- `POST /api/feedback` Zod 검증, 24시간 중복 차단, target_type별 category enum 재검증
- `/admin/*` 가드: ADMIN_USER_IDS 미포함 시 redirect, 포함 시 통과
- `PATCH /api/admin/feedback/[id]` 상태 enum 검증

**수동 (CLAUDE.md §7):**
- 학생 계정으로 요약/퀴즈 페이지 → 피드백 모달 → 제출 → DB 행 확인
- 관리자 계정으로 `/admin/feedback` → 리스트 표시 + 상세 + 상태 변경 + 분석 버튼

## 디자인 가이드 준수

- 모달은 우리 BottomSheet/Sheet 컴포넌트 재사용 (DESIGN.md §10 generic shadcn 모달 금지)
- 별점은 텍스트 라벨 동반("별 4점 — 좋아요")
- "AI 분석" 결과 카드에 ⚠️ "참고용 제안 — 자동 적용 안 됨" 명시 (CLAUDE.md §4 정신)

## 보안

- `/admin/*` 미들웨어 가드 + layout 가드 이중. layout에서 세션 + env 화이트리스트 체크.
- API 라우트도 동일 가드 inline. URL 직접 호출 차단.
- service-role 사용 라우트는 ARCHITECTURE.md §4-1 4개 가드 모두 박힘.

## Open Items (구현 단계에서 결정)

- 퀴즈 풀이 화면 컴포넌트 경로 — `src/app/dashboard/quiz/` 하위에서 카드 렌더 컴포넌트 탐색 필요
- generations 테이블의 `payload`/`rawText` 구조가 도구별로 달라, 분석 라우트에서 안전하게 추출하는 헬퍼 필요
