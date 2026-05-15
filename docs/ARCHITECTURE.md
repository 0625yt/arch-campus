# 아키텍처 — MVP 청사진

> **이 문서는 "이렇게 만들 것"의 가이드.** 대부분 미구현. 새 도구 만들 때 이 청사진 그대로 따른다.
> 실재 여부는 [docs/STATUS.md](STATUS.md)에서 확인.

## 1. 멀티테넌시 [미구현]

학생은 `profiles.university_id` + `profiles.department_id`로 학과에 속한다. 모든 자료·생성물은 `user_id` 스코프, 친구 초대 viral은 `course_id` 스코프.

**원칙**: userId/courseId는 **반드시 `getSession()`** ([src/lib/auth.ts](../src/lib/auth.ts))에서. 클라이언트가 보낸 ID 절대 신뢰 X.

## 2. 4-Layer 패턴 (★ 새 도구 추가 시 그대로 복제)

1. **프롬프트 룰** — `src/prompts/<tool>.md`. 캐시되는 시스템 프롬프트.
2. **API 라우트** — `src/app/api/<tool>/route.ts`. 순서:
   - `getSession()` → null이면 401
   - `sanitize()` ([src/lib/sanitize.ts](../src/lib/sanitize.ts)) + 길이 제한 ([src/lib/input-limits.ts](../src/lib/input-limits.ts))
   - `rateLimit()` ([src/lib/rate-limit.ts](../src/lib/rate-limit.ts))
   - `loadPersona()` — 학과·학년 페르소나
   - Anthropic 메시지: `system: [{cached rules}, {dynamic context}]`
   - `logUsage()` — 토큰·비용 기록
   - `saveGeneration()` — try/catch, DB 실패해도 사용자 응답은 막지 않음 (단 §3 주의)
3. **대시보드 페이지** — `src/app/dashboard/<tool>/page.tsx`. 위저드 5단계 입력, 우측 결과, `<HistorySidebar>`.
4. **History sidebar 등록** — [src/components/history-sidebar.tsx](../src/components/history-sidebar.tsx)에 도구명 + 색상.

**4개 중 하나라도 빠지면 도구는 작동하지 않는다.**

## 3. Tool enum — 세 곳 + SQL

`Tool` 타입은 [src/lib/history.ts](../src/lib/history.ts), 검증은 [src/app/api/history/route.ts](../src/app/api/history/route.ts), DB CHECK 제약은 `public.generations`에.

도구 추가 시 새 idempotent 마이그레이션 (`supabase/migrations/000N_<tool>_enum.sql`)으로 CHECK drop & re-add. **SQL 안 돌리면 `saveGeneration`이 23514 에러를 삼키고 history 저장이 조용히 실패.** 이전 프로젝트에서 반나절 디버깅한 함정.

## 4. 인증 + RLS

- Supabase Auth on edge (`@supabase/ssr`). 세션 쿠키는 [src/lib/supabase/server.ts](../src/lib/supabase/server.ts).
- **service-role 어드민 클라이언트** ([src/lib/supabase/admin.ts](../src/lib/supabase/admin.ts))는 RLS 우회용.
- RLS 정책: `users`, `courses`, `enrollments`, `generations`, `materials`. `admin` role만 전체 조회.

### 4-1. service-role 사용 체크리스트 (신규 라우트마다)

`getAdminSupabase()`는 RLS를 우회한다. 가드 빠지면 다른 사용자 데이터 노출. 신규 API 라우트·server action에서 admin client를 쓸 때 다음 4개 모두 통과해야 한다:

- [ ] **세션 확인**: 함수 첫 줄에서 `const ownerId = await getOwnerId()` (또는 `tryGetOwnerId()` + 401 분기)
- [ ] **owner 격리 쿼리**: 모든 `select`/`update`/`delete`에 `.eq("owner_id", ownerId)` (또는 `profiles`는 `.eq("id", ownerId)`)
- [ ] **insert도 검증**: 새 row의 `owner_id` 필드 = 세션 ownerId. 클라이언트가 보낸 값 신뢰 X
- [ ] **Storage**: path prefix 항상 `<ownerId>/...` 형태. 사용자 입력 path를 그대로 `download/remove`에 넘기지 X — 먼저 DB에서 owner 매칭 row 조회해 그 `storage_path`를 사용

참고 패턴: [src/app/api/materials/[id]/route.ts](../src/app/api/materials/[id]/route.ts) `DELETE` 핸들러 — owner 매칭 row 조회 → storage_path 추출 → 삭제 순서.

코드 리뷰 시 admin client 호출처에 위 4개 중 하나라도 빠지면 머지 차단.

## 5. 페르소나 기반 생성

모든 프롬프트는 학생 페르소나(전공·학년·이번 학기 과목·목표 학점·관심 자격증·동아리/알바 시간)로 파라미터화. `user_personas` (JSONB) 테이블.
**결과물이 generic하면 프롬프트 룰을 의심하기 전에 페르소나 빈 값 먼저 확인.**

## 6. 프롬프트 인젝션 방어

사용자 자유 입력은 `<user_input>` 태그로 user-role 메시지에 넣고, 시스템 프롬프트엔 직접 concat 금지. [src/lib/sanitize.ts](../src/lib/sanitize.ts) 경유.

## 7. 학습 루프 검증 파이프라인 (★ 신뢰의 핵심)

문제 생성 후 노출 전 서버 검증:

```
문제 생성
  → 출처 근거 span이 원문에 실제 존재? (substring match)
  → 정답이 보기 안에 있나?
  → 보기 중복 없나?
  → 객관식이면 정답 1개·오답 N-1개 명확?
통과한 것만 노출
```

이 검증 우회하는 PR 받지 않는다.

## 8. 강의계획서 파싱 — 80% 자동 + 20% 확인

100% 자동은 함정. 신뢰도 점수 표시:

- ≥ 80%: 자동 등록, 토스트 "X건 자동 등록됨, 클릭해 확인"
- < 80%: 한 화면에서 사용자가 빠르게 confirm/edit (체크박스 UX)

확신 없는 추출을 자동 등록하면 사용자가 시험을 놓친다.

---

## 9. 데이터·AI 파이프라인

```
파일 업로드 → 포맷 판별 → 텍스트 추출/OCR → 블록 정규화 →
청킹 → 임베딩 → pgvector 저장 → RAG 검색 →
요약/문제/일정/위저드 결과 생성 → 검증 → 사용자 노출
```

| 영역 | 선택 | 비고 |
|---|---|---|
| 디지털 PDF | PyMuPDF + pdfplumber | 서버리스 함수 또는 Vercel Sandbox |
| 스캔 OCR | PaddleOCR (PP-StructureV3) | 비용 큼 — 무료 티어 제한 |
| HWPX | python-hwpx | HWP는 변환 안내 |
| 임베딩 | text-embedding-3-small | $0.02/1M tokens |
| 벡터 DB | Supabase pgvector | $25/mo부터 |
| 파일 저장 | Vercel Blob 또는 Cloudflare R2 | 사용자 업로드 비공개 기본값 |

사용자 업로드 자료는 비공개 기본값. 학습 재사용 옵트인 분리.

---

## 10. 디자인 검증 워크플로 (UI 작업 끝낼 때마다)

**왜**: PRODUCT.md §2 반응형 1급 정책. 데스크톱에서만 잘 보이는 거 100% 막아야 함.

**단계**:
1. `npm run build` 통과 (타입 + 정적 생성)
2. `npm run dev` 띄우고 `curl localhost:3000/<route>` 200
3. 3 viewport 확인 — xl 1440, desktop 1280, iPad 820, iPhone 14

**Playwright 스크립트** (`/tmp/shoot.mjs` 패턴):
```js
import { chromium, devices } from 'playwright';
const URL = 'http://localhost:3000/dashboard/today';
const targets = [
  { name: 'xl-1440', viewport: { width: 1440, height: 900 } },
  { name: 'desktop-1280', viewport: { width: 1280, height: 900 } },
  { name: 'ipad-820', viewport: { width: 820, height: 1180 } },
  { name: 'mobile-iphone14', device: 'iPhone 14' },
];
const browser = await chromium.launch();
for (const t of targets) {
  const ctx = await browser.newContext(
    t.device ? devices[t.device] : { viewport: t.viewport, deviceScaleFactor: 2 }
  );
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `/tmp/screenshots/${t.name}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
```

**합격 기준**:
- 4개 viewport 모두 한국어 깨짐 0건
- 모바일에서 콘텐츠가 사이드바·탭바와 겹치지 않음
- 첫 화면(스크롤 없는 viewport) 안에 핵심 정보 가시
- 호버 액션이 모바일에서 영구 노출 X

**주의**: `.next/` 캐시가 globals.css 변경을 못 받으면 `rm -rf .next && npm run dev` 재시작.
