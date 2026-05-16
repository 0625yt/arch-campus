# Material 상세 split-view + 자동 PDF 변환 — Design

> 2026-05-16. 스프린트 다음 작업.
> 사용자 요청: "자료 들어가면 좌측에 원본 + 우측에 요약, 페이지 번호 클릭하면 좌측 점프. Office 파일은 자동 PDF 변환."

---

## 목적

학생이 자료 페이지에서 **원본을 보면서 요약을 같이 읽도록**. 요약 안의 페이지 칩(`p.2`)을 누르면 좌측 PDF가 해당 페이지로 점프. 신뢰감↑, 자료 검증 시간↓.

PPTX·DOCX·HWPX 등 Office 파일은 업로드 시 **자동으로 PDF로 변환**하여 동일한 split-view 경험 제공.

---

## 범위

### 포함
- material 상세 페이지 (`/dashboard/study/[course]/[material]`) 데스크톱(≥md)에서 sticky 좌(PDF iframe) + 스크롤 우(요약) 레이아웃
- 요약 블록(`h2`/`para`/`bullets`/`callout`) 각각 `sourcePage` 있을 때 `p.N` 칩 표시
- 칩 클릭 → 데스크톱: iframe page fragment 갱신 / 모바일: `target="_blank"` 새 탭
- 업로드 후 mime_type이 PDF가 아니면 CloudConvert API로 자동 PDF 변환 후 Storage 교체
- 변환 진행 중 좌측 placeholder + client polling
- 변환 실패 시 "원본 다운로드" fallback

### 제외 (Phase 2)
- PPT/DOCX 외 변환 (이미지·CSV·동영상)
- Resizable split bar
- PDF 페이지 썸네일 좌측 트레이
- 메모·형광펜
- Webhook 기반 변환 (현재는 poll)

---

## 의사결정 표

| 결정 | 선택 | 근거 |
|---|---|---|
| 좌측 뷰어 | 브라우저 native `<iframe src#page=N>` | 의존성 0KB, 모든 모던 브라우저 지원, 페이지 fragment 동작 |
| 변환 엔진 | CloudConvert API | LibreOffice/Vercel 미지원, 1000 conv/월 무료, 외부 의존이지만 검증된 서비스 |
| 변환 시점 | 별도 `convert-pdf` job (after 콜백 병렬) | finalize 응답 즉시, UI는 폴링으로 자연 갱신 |
| Signed URL TTL | 1h | 균형. 사용자 세션 길이 충분, 유출돼도 1h 후 자연 만료 |
| 모바일 split | 안 함 — 단일 컬럼 + `target="_blank"` | iframe 모바일 UX 안 좋음, OS native PDF 뷰어가 더 나음 |
| 데스크톱 분할 비율 | 고정 (좌 ~55%, 우 45%) | resizable 안 함 (Phase 2). max-w 풀고 전체 viewport 활용 |

---

## 아키텍처

### 데이터 흐름

```
[브라우저] file drop (.pptx)
  ↓
[POST /api/materials/upload-url] signed upload URL + materialId
  ↓
[브라우저 → Supabase Storage] PUT (Vercel 함수 우회, 25MB 한도)
  ↓
[POST /api/materials/finalize]
  1. owner-prefix 검증
  2. Storage 다운로드 → parseDocument (텍스트 추출 — PPTX/DOCX 그대로 잘 됨)
  3. materials INSERT (mime_type=원본, storage_path=원본)
  4. enqueueJob × 3:
     - summarize (텍스트 기반, PDF 안 기다림)
     - quiz
     - convert-pdf (이미 PDF면 skip)
  5. after() → 3 잡 병렬 실행
  6. 클라이언트에 materialId 즉시 응답
  ↓
[브라우저] router.push(/dashboard/study/[course]/[materialId])
  ↓
[server: page.tsx]
  - getMaterialDetail()
  - if mime_type=pdf → createSignedReadUrl() → MaterialView(pdfUrl, summary)
  - if !pdf + summary 있음 + active convert-pdf job: SummaryColumn + 좌측 "PDF 변환 중" placeholder (client polling)
  - if !pdf + 변환 실패: SummaryColumn + 좌측 "원본 다운로드" 카드

[runConvertPdfJob (after 콜백 안에서 실행)]
  1. CloudConvert에 원본 업로드 (storage_path으로 다운로드 후 재업로드)
  2. PDF 변환 작업 생성 → status polling (5초 간격, 최대 5분)
  3. 결과 PDF 다운로드
  4. Storage에 <ownerId>/<materialId>.pdf로 PUT
  5. materials UPDATE:
       - original_storage_path = (구) storage_path
       - storage_path = 새 PDF 경로
       - mime_type = "application/pdf"
  6. markJobDone

[클라이언트: PdfConvertLoading (혹은 MaterialView 안 분기)]
  - useActiveJobs로 이 materialId 앞 convert-pdf 잡 폴링
  - active O → 좌측 placeholder + spinner
  - active X (직전엔 있었음) → router.refresh → 서버가 새 storage_path로 다시 그림
```

### 컴포넌트 단위

| 컴포넌트 | 타입 | 입력 | 책임 |
|---|---|---|---|
| `MaterialView` | client | `pdfUrl`, `summary`, `detail` | viewport 분기, page state, PageChip ↔ PdfViewer 연결 |
| `PdfViewer` | client | `src`, `page` | `<iframe>` + `key={page}` remount로 fragment 점프 |
| `SummaryColumn` | client | `summary`, `onPageClick` | 기존 SummaryArticle 본문 + 블록마다 PageChip |
| `PageChip` | client | `page`, `onClick` | `p.N` 칩 시각 + 위임 |
| `PdfConvertLoading` | client | `materialId` | active convert-pdf 잡 폴링 + 완료 시 refresh |
| `createSignedReadUrl` | server | `storagePath`, `ttl` | service-role download signed URL |
| `runConvertPdfJob` | server | `jobId`, `ownerId`, `materialId`, `storagePath`, `filename` | CloudConvert 호출, 결과 Storage 교체, DB 업데이트 |

### DB 변경

`jobs.tool`은 text + CHECK 제약 (0008_jobs.sql:11). 새 tool 추가하려면 CHECK 갱신 필요.

```sql
-- supabase/migrations/0011_materials_pdf_convert.sql

-- 1) materials에 원본 경로 보존 컬럼
alter table public.materials
  add column if not exists original_storage_path text;

comment on column public.materials.original_storage_path is
  'Office → PDF 자동 변환 시 원본 파일 경로 보존. NULL이면 업로드 그대로가 storage_path.';

-- 2) jobs.tool CHECK 제약에 'convert-pdf' 추가
alter table public.jobs drop constraint if exists jobs_tool_check;
alter table public.jobs add constraint jobs_tool_check check (tool in (
  'summarize', 'quiz', 'presentation',
  'wizard-cram', 'wizard-assignment', 'wizard-exam',
  'syllabus-extract', 'timetable-extract', 'post-mortem',
  'convert-pdf'
));
```

### 새 환경변수

| Key | Where | Required |
|---|---|---|
| `CLOUDCONVERT_API_KEY` | Vercel env (prod·preview), `.env.local` | yes (Office 변환에 필수) |

### 클라이언트 흐름 분기 (`page.tsx`)

```
if (!detail.summary)
  → SummaryLoading (기존, 그대로)

if (detail.summary && mimeType === 'application/pdf')
  → MaterialView(pdfUrl, summary)   // 신규 split-view

if (detail.summary && mimeType !== 'application/pdf' && convertPdfJobActive)
  → SummaryColumn + PdfConvertLoading placeholder

if (detail.summary && mimeType !== 'application/pdf' && !convertPdfJobActive)
  → SummaryColumn + "원본 다운로드 (변환 못 함)" 카드
```

### Edge cases

| 케이스 | 대응 |
|---|---|
| summary 아직 없음 | 기존 SummaryLoading 그대로 (이번 spec 안 건드림) |
| 원본 이미 PDF | convert-pdf 잡 큐잉 안 함 (finalize에서 skip) |
| storage_path null | "파일을 못 찾았어요" 카드 |
| iframe 로드 실패 | "PDF 다운로드" 링크 fallback |
| CloudConvert 실패 (API 오류·timeout) | job error → UI에 "변환 실패, 원본 다운로드만 가능" |
| Signed URL 1h 만료 (탭 오래 열어둠) | 페이지 새로고침으로 회복. Phase 2에서 client 갱신 |
| 모바일에서 PDF 보고 싶을 때 | `p.N` 칩 → `target="_blank"` → OS native PDF 뷰어 |
| 변환 중 사용자가 이미 잘 안 들어옴 | polling이 자동 router.refresh로 처리 |

### Risk / 트레이드오프

- **CloudConvert 외부 의존**: ZDR 옵션 켜고 변환 후 30일 자동 삭제 정책 따름. 자료 잠시 외부 가지만 학생 자료 = 교수 강의자료라 PII 위험 낮음. PRODUCT.md §5 컴플라이언스 라인 안 침범.
- **변환 무료 한도 1000건/월**: 사용자 약 160명까지 무료 (학생 1인 20자료 × 30% Office). 초과 후 ~$0.01/건 — Phase 2 결제 도입 시 가격 모델에 반영.
- **iframe fragment remount 깜빡임**: 같은 URL의 `#page=N`만 바꿔도 Chrome이 가끔 점프 안 함 → `key={page}` 강제 remount로 안정성↑, 깜빡임↓ 트레이드오프.
- **변환 평균 10~30초**: 첫 진입 시 사용자가 좌측 placeholder 봐야 함. 비동기 잡으로 잘라서 UI 즉시 표시 + polling으로 자연 갱신.

---

## 보안

- service-role로 Storage·CloudConvert 호출 (서버 only)
- `CLOUDCONVERT_API_KEY`는 `NEXT_PUBLIC_` 접두사 X — 클라이언트 번들 노출 금지
- finalize·convert-pdf 모두 `<ownerId>/...` owner-prefix 검증 (ARCHITECTURE.md §4-1)
- signed read URL은 storagePath까지 잠겨있어 다른 사용자 영역 침범 불가
- CloudConvert에 보낼 때 원본 파일명 그대로 — 학번·이름 노출 위험 낮음 (학생이 직접 올린 자료)

---

## 검증 (구현 후 §7 외부 영향 작업)

배포 후 프로덕션에서:
1. PDF 자료 업로드 → split-view 즉시 표시, `p.N` 클릭 시 좌측 점프 확인
2. PPTX 자료 업로드 → "PDF 변환 중" placeholder + 우측 요약 진행 → 변환 완료 후 자동으로 PDF 뷰어 표시
3. DOCX 자료 업로드 → 같은 흐름
4. 변환 실패 시뮬레이션 (API key 임시로 잘못 박기) → "원본 다운로드" fallback 표시
5. 모바일 viewport → 칩 클릭 시 새 탭 동작

---

## 작업 단위 (writing-plans skill로 넘기는 입력)

대략 6~8h 추정. 다음 단위로 쪼개기 적합:

1. **DB**: 마이그레이션 0011 (`original_storage_path` 컬럼) + 사용자에게 Supabase Dashboard 실행 안내
2. **Storage helper**: `createSignedReadUrl()` in `src/lib/storage.ts`
3. **CloudConvert client**: `src/lib/cloudconvert.ts` — API key·upload·convert·download·poll
4. **convert-pdf job runner**: `runConvertPdfJob()` (materials/route.ts 안 또는 별도 services 파일)
5. **finalize 라우트 수정**: non-pdf면 convert-pdf 잡 추가 큐잉
6. **page.tsx 분기 변경**: mime_type 기반 4-way 분기
7. **`MaterialView`**: 데스크톱 split layout + viewport 분기
8. **`PdfViewer`**: `<iframe>` + key remount
9. **`SummaryColumn`** + **`PageChip`**: 기존 SummaryArticle 확장
10. **`PdfConvertLoading`**: 좌측 placeholder + active job 폴링
11. **검증**: 프로덕션 배포 + 4가지 자료 타입 실측

---

## Phase 2 (이번 spec 제외, 미래)

- Webhook 기반 변환 트리거 (CloudConvert webhook → 우리 라우트가 callback)
- Resizable split bar (react-resizable-panels)
- PDF 페이지 썸네일 좌측 트레이
- 페이지별 메모·형광펜
- 변환 큐 모니터링 대시보드 (관리자용)
- Office 외 형식 (이미지·CSV·동영상)
