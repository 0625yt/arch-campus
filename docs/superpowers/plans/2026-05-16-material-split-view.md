# Material 상세 split-view + 자동 PDF 변환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** material 상세 페이지에 좌(원본 PDF iframe) + 우(요약 + 페이지 칩) split-view 추가. Office 파일은 업로드 시 CloudConvert로 PDF 변환을 자동 백그라운드 잡으로 실행.

**Architecture:** finalize 응답은 그대로 즉시. summarize·quiz·convert-pdf 3 잡이 `after()` 콜백에서 병렬 실행. 상세 페이지는 server에서 mime_type + active job을 보고 4-way 분기. 변환 완료 시 client polling이 `router.refresh()`로 자연 갱신.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, Supabase Storage(service-role), CloudConvert API v2 (REST + polling).

**Spec reference:** [docs/superpowers/specs/2026-05-16-material-split-view-design.md](../specs/2026-05-16-material-split-view-design.md)

**검증 정책 (CLAUDE.md §2, §7):**
- 이 프로젝트는 unit test 러너 없음. TDD 형식 task 대신 **`npx tsc --noEmit` 타입 체크 + 프로덕션 실측**으로 검증
- 외부 영향 변경(API/배포)은 §7에 따라 push 전 사용자 명시 승인

---

## 사전 준비 (작업 전)

- [ ] **0.1 CLOUDCONVERT_API_KEY 발급**

사용자가 직접 해야 하는 단계:
1. https://cloudconvert.com/register 가입 (무료 1000 conversions/월)
2. Dashboard → API Keys → 새 키 생성, scopes: `task.read task.write user.read`
3. 키 복사

- [ ] **0.2 `.env.local`에 키 추가**

`.env.local`에 다음 줄 추가:
```
CLOUDCONVERT_API_KEY=<발급받은_키>
```

서버 변수라 `NEXT_PUBLIC_` 접두사 **금지** (clientbundle 노출 방지).

- [ ] **0.3 Vercel env에도 키 추가**

```bash
vercel env add CLOUDCONVERT_API_KEY production
# 프롬프트에 키 붙여넣기
vercel env add CLOUDCONVERT_API_KEY preview
```

---

## Task 1: DB 마이그레이션 — `original_storage_path` + `jobs.tool` CHECK 확장

**Files:**
- Create: `supabase/migrations/0011_materials_pdf_convert.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

파일 `supabase/migrations/0011_materials_pdf_convert.sql`:

```sql
-- 0011_materials_pdf_convert.sql
-- ─────────────────────────────────────────────────────────
-- Office → PDF 자동 변환을 위한 두 가지 변경:
--   1) materials.original_storage_path — 원본 파일 경로 보존
--   2) jobs.tool CHECK 제약에 'convert-pdf' 추가
-- ─────────────────────────────────────────────────────────

-- 1) 원본 경로 보존 컬럼
alter table public.materials
  add column if not exists original_storage_path text;

comment on column public.materials.original_storage_path is
  'Office → PDF 자동 변환 시 원본 파일 경로 보존. NULL이면 업로드 그대로가 storage_path.';

-- 2) jobs.tool CHECK 갱신 (기존 9개 + convert-pdf)
alter table public.jobs drop constraint if exists jobs_tool_check;
alter table public.jobs add constraint jobs_tool_check check (tool in (
  'summarize',
  'quiz',
  'presentation',
  'wizard-cram',
  'wizard-assignment',
  'wizard-exam',
  'syllabus-extract',
  'timetable-extract',
  'post-mortem',
  'convert-pdf'
));
```

- [ ] **Step 2: 사용자에게 Supabase Dashboard 실행 안내**

```
새 마이그레이션을 적용해야 합니다. Supabase Dashboard → SQL Editor에서
supabase/migrations/0011_materials_pdf_convert.sql 의 내용을 그대로 실행해 주세요.

CLAUDE.md §6에 따라 마이그레이션은 사용자가 직접 실행합니다.
```

- [ ] **Step 3: 적용 후 사용자 확인 받기**

사용자가 "적용됨" 응답하면 다음 단계로. 응답 전엔 멈춤.

- [ ] **Step 4: 타입 재생성 안내(선택)**

사용자가 Supabase 타입 자동 생성 스크립트를 운영한다면:
```bash
npx supabase gen types typescript --linked > src/lib/supabase/types.ts
```
없으면 다음 task에서 string column으로 다루므로 skip OK.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0011_materials_pdf_convert.sql
git commit -m "Add materials.original_storage_path + jobs.tool=convert-pdf

Schema groundwork for the auto Office→PDF conversion path. Original
file location is preserved so we can re-download/re-convert later
without losing the upload, and the jobs CHECK is widened to allow
the new convert-pdf job type."
```

---

## Task 2: `MaterialDetail`에 `mimeType` + `storagePath` 노출

**Files:**
- Modify: `src/lib/data/materials.ts` (interface + getMaterialDetail SELECT)

분기에 `mime_type`과 `storage_path` 둘 다 필요. 지금은 둘 다 노출 안 됨.

- [ ] **Step 1: `MaterialDetail` interface 확장**

`src/lib/data/materials.ts` 21-31 행:

```ts
export interface MaterialDetail {
  id: string;
  title: string;
  type: MaterialRow["type"];
  pageCount: number | null;
  uploadedAt: string;
  course: { id: string; name: string; color: string | null } | null;
  summary: SummarizeOutputT | null;
  summaryKeywords: string[] | null;
  lastSummarizedAt: string | null;
  mimeType: string | null;
  storagePath: string | null;
}
```

- [ ] **Step 2: `MaterialDetailRaw`에 두 컬럼 추가**

55-66 행 근처:

```ts
interface MaterialDetailRaw {
  id: string;
  title: string;
  type: MaterialRow["type"];
  page_count: number | null;
  uploaded_at: string;
  summary_payload: unknown;
  summary_keywords: string[] | null;
  last_summarized_at: string | null;
  course_id: string | null;
  courses: Pick<CourseRow, "id" | "name" | "color"> | null;
  mime_type: string | null;
  storage_path: string | null;
}
```

- [ ] **Step 3: SELECT 쿼리에 두 컬럼 추가**

68-97 행의 `getMaterialDetail`:

```ts
export async function getMaterialDetail(opts: {
  ownerId: string;
  materialId: string;
}): Promise<MaterialDetail | null> {
  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("materials")
    .select(
      "id, title, type, page_count, uploaded_at, summary_payload, summary_keywords, last_summarized_at, course_id, mime_type, storage_path, courses(id, name, color)",
    )
    .eq("id", opts.materialId)
    .eq("owner_id", opts.ownerId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as unknown as MaterialDetailRaw;

  return {
    id: row.id,
    title: row.title,
    type: row.type,
    pageCount: row.page_count,
    uploadedAt: row.uploaded_at,
    course: extractCourse(row.courses),
    summary: parseSummary(row.summary_payload),
    summaryKeywords: row.summary_keywords ?? null,
    lastSummarizedAt: row.last_summarized_at,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
  };
}
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/materials.ts
git commit -m "Expose mimeType + storagePath on MaterialDetail

The material detail page needs to branch on mime_type (PDF vs Office)
and to mint signed read URLs from storage_path, but neither field was
being returned from getMaterialDetail. Adds both to the interface and
the SELECT projection."
```

---

## Task 3: `createSignedReadUrl` helper (Storage 1h TTL)

**Files:**
- Modify: `src/lib/storage.ts` (export 추가)

- [ ] **Step 1: helper 추가**

`src/lib/storage.ts`의 `downloadMaterialFile` 다음, `SignedUploadTarget` 위에 추가:

```ts
/**
 * 원본 파일을 클라이언트가 직접 열 수 있게 signed download URL을 발급한다.
 *
 * iframe·다운로드 링크용. service-role로 만들지만 URL이 storagePath까지 잠겨있어
 * 다른 사용자 영역엔 접근 불가. (admin.ts §4-1 storage 격리.)
 *
 * TTL: 기본 1시간 — 사용자 세션 보호 + 유출 시 자연 만료의 균형.
 */
export async function createSignedReadUrl(opts: {
  storagePath: string;
  ttlSec?: number;
}): Promise<string> {
  const admin = getAdminSupabase();
  const ttl = opts.ttlSec ?? 3600;
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(opts.storagePath, ttl);
  if (error || !data) {
    throw new Error(`signed read URL 발급 실패: ${error?.message ?? "no data"}`);
  }
  return data.signedUrl;
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "Add createSignedReadUrl helper for client-side PDF viewing

The split-view iframe needs a signed URL it can load directly. Helper
mirrors the createMaterialUploadUrl pattern (service-role, owner path
already baked into storagePath) but returns a download/read URL with a
1h TTL by default."
```

---

## Task 4: `src/lib/cloudconvert.ts` — Office → PDF 변환 client

**Files:**
- Create: `src/lib/cloudconvert.ts`

CloudConvert API v2 sync 패턴: `POST /jobs`로 `import/url` + `convert` + `export/url` 세 task를 하나의 job으로 묶어 보내고, `GET /jobs/:id` 폴링으로 상태 확인. 완료되면 `export/url` task의 `result.files[0].url`에서 결과 PDF 다운로드.

- [ ] **Step 1: client 작성**

```ts
// src/lib/cloudconvert.ts
import "server-only";

const API_BASE = "https://api.cloudconvert.com/v2";

interface CCTask {
  id: string;
  name: string;
  status: "waiting" | "processing" | "finished" | "error";
  result?: {
    files?: Array<{ filename: string; url: string }>;
  };
  message?: string;
  code?: string;
}

interface CCJobResponse {
  data: {
    id: string;
    status: "waiting" | "processing" | "finished" | "error";
    tasks: CCTask[];
  };
}

/**
 * Office 파일을 PDF로 변환한다. 흐름:
 *   1) /jobs POST — import-url(우리 signed URL) → convert(pdf) → export-url 3-task 묶음
 *   2) /jobs/:id GET 폴링 (5s × 최대 60회 = 5분)
 *   3) export task의 result.files[0].url에서 PDF 바이트 다운로드
 *
 * 입력은 우리 Storage의 signed download URL — CloudConvert가 직접 받아 처리.
 * 결과 파일은 30일 후 자동 삭제 (CloudConvert 정책).
 *
 * 에러: API 키 누락, 변환 실패, 폴링 5분 초과, 결과 다운로드 실패 — 각각 throw.
 */
export async function convertToPdf(opts: {
  sourceUrl: string;
  filename: string;
}): Promise<Uint8Array> {
  const apiKey = process.env.CLOUDCONVERT_API_KEY;
  if (!apiKey) throw new Error("CLOUDCONVERT_API_KEY 미설정");

  // 입력 파일명에서 확장자만 따와 input_format 결정
  const ext = filename2ext(opts.filename);
  if (!ext) throw new Error(`확장자를 알 수 없는 파일: ${opts.filename}`);

  // 1) job 생성
  const jobRes = await fetch(`${API_BASE}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      tasks: {
        "import-file": {
          operation: "import/url",
          url: opts.sourceUrl,
          filename: opts.filename,
        },
        "convert-file": {
          operation: "convert",
          input: "import-file",
          input_format: ext,
          output_format: "pdf",
        },
        "export-file": {
          operation: "export/url",
          input: "convert-file",
        },
      },
    }),
  });

  if (!jobRes.ok) {
    const detail = await jobRes.text().catch(() => "");
    throw new Error(`CloudConvert job 생성 실패: ${jobRes.status} ${detail}`);
  }
  const job = (await jobRes.json()) as CCJobResponse;
  const jobId = job.data.id;

  // 2) 폴링
  const startedAt = Date.now();
  const TIMEOUT_MS = 5 * 60 * 1000;
  while (Date.now() - startedAt < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 5_000));
    const statusRes = await fetch(`${API_BASE}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!statusRes.ok) continue; // 한 번 실패는 재시도
    const statusJob = (await statusRes.json()) as CCJobResponse;
    if (statusJob.data.status === "error") {
      const failed = statusJob.data.tasks.find((t) => t.status === "error");
      throw new Error(
        `CloudConvert 변환 실패: ${failed?.message ?? failed?.code ?? "unknown"}`,
      );
    }
    if (statusJob.data.status === "finished") {
      const exportTask = statusJob.data.tasks.find((t) => t.name === "export-file");
      const fileUrl = exportTask?.result?.files?.[0]?.url;
      if (!fileUrl) throw new Error("CloudConvert: export URL 누락");
      // 3) 결과 다운로드
      const fileRes = await fetch(fileUrl);
      if (!fileRes.ok) {
        throw new Error(`결과 PDF 다운로드 실패: ${fileRes.status}`);
      }
      const buf = await fileRes.arrayBuffer();
      return new Uint8Array(buf);
    }
    // waiting | processing → 계속
  }
  throw new Error("CloudConvert 변환 타임아웃 (5분 초과)");
}

function filename2ext(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  // CloudConvert가 받는 Office 확장자 화이트리스트
  const allowed = ["pptx", "ppt", "docx", "doc", "hwpx", "hwp", "odt", "odp", "rtf"];
  return allowed.includes(ext) ? ext : null;
}
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/cloudconvert.ts
git commit -m "Add CloudConvert client for Office→PDF conversion

Single export convertToPdf({ sourceUrl, filename }). Wires a 3-task
job (import/url → convert → export/url), polls every 5s for up to 5
minutes, downloads the result PDF on success. Errors surface as throws
so the calling job can mark itself failed."
```

---

## Task 5: `runConvertPdfJob` 함수

**Files:**
- Modify: `src/app/api/materials/route.ts` (helper export 추가)

`runSummarizeJob` · `runQuizJob`와 같은 위치에 두면 finalize에서 같이 import 한 번에 끝남.

- [ ] **Step 1: import 추가**

`src/app/api/materials/route.ts` 상단 import에 추가:

```ts
import { convertToPdf } from "@/lib/cloudconvert";
import { createSignedReadUrl, downloadMaterialFile } from "@/lib/storage";
```

(`downloadMaterialFile` 이미 다른 곳에서 쓰일 수 있음 — 중복 제거)

- [ ] **Step 2: `runConvertPdfJob` 추가**

`runQuizJob` 함수 다음(파일 끝부분 `emptyToUndef` 위)에 추가:

```ts
/**
 * Office 자료를 PDF로 변환해 Storage·DB를 교체한다.
 *
 * 흐름:
 *   1) markJobRunning
 *   2) Storage signed read URL 1h 발급 → CloudConvert에 input으로 전달
 *   3) convertToPdf → PDF 바이트 받음
 *   4) Storage에 <ownerId>/<materialId>.pdf로 PUT (admin client, upsert)
 *   5) materials UPDATE:
 *        original_storage_path = (구) storage_path
 *        storage_path          = 새 PDF 경로
 *        mime_type             = "application/pdf"
 *   6) markJobDone
 *
 * 실패 시 markJobError. materials row는 건드리지 않아 원본 그대로 남음.
 */
export async function runConvertPdfJob(opts: {
  jobId: string;
  ownerId: string;
  materialId: string;
  /** 변환 전 storage_path (원본 Office 파일) */
  sourceStoragePath: string;
  /** 원본 파일명 (확장자 + CloudConvert input_format 추정용) */
  filename: string;
}): Promise<void> {
  try {
    await markJobRunning(opts.jobId);

    const sourceUrl = await createSignedReadUrl({
      storagePath: opts.sourceStoragePath,
      ttlSec: 3600,
    });

    const pdfBytes = await convertToPdf({
      sourceUrl,
      filename: opts.filename,
    });

    const pdfPath = `${opts.ownerId}/${opts.materialId}.pdf`;
    const admin = getAdminSupabase();
    const { error: putErr } = await admin.storage
      .from("materials")
      .upload(pdfPath, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });
    if (putErr) throw new Error(`PDF 저장 실패: ${putErr.message}`);

    const { error: updErr } = await admin
      .from("materials")
      .update({
        original_storage_path: opts.sourceStoragePath,
        storage_path: pdfPath,
        mime_type: "application/pdf",
      })
      .eq("id", opts.materialId)
      .eq("owner_id", opts.ownerId);
    if (updErr) throw new Error(`materials 갱신 실패: ${updErr.message}`);

    // markJobDone은 모델 호출용 시그니처라 더미 값 — convert-pdf는 AI 호출 없음
    await markJobDone({
      jobId: opts.jobId,
      result: { pdfPath },
      modelId: "cloudconvert",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0, // 무료 한도 안 — 초과 시 별도 계측
    });
  } catch (e) {
    await markJobError({
      jobId: opts.jobId,
      errorMessage: e instanceof Error ? e.message : String(e),
    });
  }
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/materials/route.ts
git commit -m "Add runConvertPdfJob — Office→PDF via CloudConvert

Lives alongside runSummarizeJob/runQuizJob so finalize can import them
all from one place. On success it swaps the Storage path + mime_type
in materials, preserving the original path in original_storage_path.
Failure is caught and logged as a job error; the source file stays
intact so the user still has the download fallback."
```

---

## Task 6: `/api/materials/finalize` 수정 — non-PDF면 convert-pdf 잡 큐잉

**Files:**
- Modify: `src/app/api/materials/finalize/route.ts`

- [ ] **Step 1: import 추가**

상단 import 블록:

```ts
import { runConvertPdfJob, runQuizJob, runSummarizeJob, stripExt } from "@/app/api/materials/route";
```

- [ ] **Step 2: 응답 인터페이스 확장**

`PipelineOk` 안 `jobs` 필드에 `convertPdf` 추가 (optional — PDF면 없음):

```ts
interface PipelineOk {
  ok: true;
  materialId: string;
  parser: string;
  pageCount: number | null;
  jobs: {
    summarize: { id: string; status: "pending" | "running" | "done" | "error" | "cancelled" };
    quiz: { id: string; status: "pending" | "running" | "done" | "error" | "cancelled" };
    convertPdf?: { id: string; status: "pending" | "running" | "done" | "error" | "cancelled" };
  };
}
```

- [ ] **Step 3: convert-pdf 잡 큐잉 로직 추가**

기존 `enqueueJob × 2` 블록 직후, `after()` 블록 직전에 삽입:

```ts
const needsPdfConvert = mimeType !== "application/pdf";
const convertEnqueue = needsPdfConvert
  ? await enqueueJob({
      ownerId,
      materialId: material.id,
      tool: "convert-pdf",
      inputParams: {
        materialId: material.id,
        sourceStoragePath: body.storagePath,
        filename: body.filename,
      },
    })
  : null;
```

- [ ] **Step 4: `after()` 콜백에 변환 잡 추가**

기존 `after(async () => { await Promise.all([runSummarizeJob..., runQuizJob...]); });`를 다음으로 교체:

```ts
after(async () => {
  const jobs: Array<Promise<unknown>> = [
    runSummarizeJob({
      jobId: summarizeEnqueue.job.id,
      ownerId,
      materialId: material.id,
      title,
      type,
      fullText: parsed.text,
      sanitizedText: parsed.sanitizedText,
      pageCount: parsed.pageCount ?? null,
      parserWarnings: parsed.warnings,
    }),
    runQuizJob({
      jobId: quizEnqueue.job.id,
      ownerId,
      materialId: material.id,
      courseId: body.courseId ?? null,
      title,
      type,
      fullText: parsed.text,
      sanitizedText: parsed.sanitizedText,
      pageCount: parsed.pageCount ?? null,
      parserWarnings: parsed.warnings,
      difficulty: (body.difficulty ?? "보통") as Difficulty,
      requestedCount: body.count ?? 10,
    }),
  ];
  if (convertEnqueue) {
    jobs.push(
      runConvertPdfJob({
        jobId: convertEnqueue.job.id,
        ownerId,
        materialId: material.id,
        sourceStoragePath: body.storagePath,
        filename: body.filename,
      }),
    );
  }
  await Promise.all(jobs);
});
```

- [ ] **Step 5: 응답 jobs에 convertPdf 포함**

기존 `return NextResponse.json({ ok: true, ... jobs: { summarize, quiz } })`를:

```ts
return NextResponse.json({
  ok: true,
  materialId: material.id,
  parser: parsed.source,
  pageCount: parsed.pageCount ?? null,
  jobs: {
    summarize: { id: summarizeEnqueue.job.id, status: summarizeEnqueue.job.status },
    quiz: { id: quizEnqueue.job.id, status: quizEnqueue.job.status },
    ...(convertEnqueue && {
      convertPdf: { id: convertEnqueue.job.id, status: convertEnqueue.job.status },
    }),
  },
});
```

- [ ] **Step 6: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/app/api/materials/finalize/route.ts
git commit -m "Queue convert-pdf job from finalize for non-PDF uploads

Adds a third background job in the after() callback when the uploaded
file is not already a PDF. Response shape gets an optional jobs.convertPdf
so the client can poll if it cares; for PDFs the field is just absent."
```

---

## Task 7: `[material]/page.tsx` 4-way 분기 + `pdfUrl` fetch

**Files:**
- Modify: `src/app/dashboard/study/[course]/[material]/page.tsx`

- [ ] **Step 1: import 추가**

상단 import 블록:

```ts
import { getLatestJob } from "@/lib/data/jobs";
import { createSignedReadUrl } from "@/lib/storage";
```

- [ ] **Step 2: detail fetch 이후 분기 데이터 준비**

`const detail = await getMaterialDetail(...)` 이후, `return` 이전에 추가:

```ts
const isPdf = detail.mimeType === "application/pdf";
let pdfUrl: string | null = null;
let convertingPdf = false;
let convertFailed = false;

if (isPdf && detail.storagePath) {
  try {
    pdfUrl = await createSignedReadUrl({ storagePath: detail.storagePath });
  } catch {
    pdfUrl = null; // iframe fallback
  }
} else if (!isPdf) {
  const convertJob = await getLatestJob({
    ownerId,
    materialId: detail.id,
    tool: "convert-pdf",
  });
  if (convertJob && (convertJob.status === "pending" || convertJob.status === "running")) {
    convertingPdf = true;
  } else if (convertJob && convertJob.status === "error") {
    convertFailed = true;
  }
}
```

- [ ] **Step 3: summary 있을 때 분기 교체**

기존:
```tsx
{detail.summary ? (
  <SummaryArticle summary={detail.summary} className="mt-14 fade-up fade-up-3 sm:mt-16" />
) : (
  <SummaryLoading ... />
)}
```

다음으로 교체:

```tsx
{detail.summary ? (
  isPdf && pdfUrl ? (
    <MaterialView
      pdfUrl={pdfUrl}
      summary={detail.summary}
      className="mt-14 fade-up fade-up-3 sm:mt-16"
    />
  ) : convertingPdf ? (
    <SplitWithConvertingLeft
      materialId={detail.id}
      summary={detail.summary}
      className="mt-14 fade-up fade-up-3 sm:mt-16"
    />
  ) : convertFailed ? (
    <SplitWithFailedLeft
      materialId={detail.id}
      summary={detail.summary}
      filename={detail.title}
      className="mt-14 fade-up fade-up-3 sm:mt-16"
    />
  ) : (
    <SummaryArticle summary={detail.summary} className="mt-14 fade-up fade-up-3 sm:mt-16" />
  )
) : (
  <SummaryLoading
    materialId={detail.id}
    className="mt-14 fade-up fade-up-3 sm:mt-16"
    fallback={<EmptySummary materialId={detail.id} />}
  />
)}
```

- [ ] **Step 4: 컨테이너 max-width 확장**

현재 line 34:
```tsx
<div className="mx-auto w-full max-w-[920px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:px-12">
```

split-view용으로 데스크톱에서 더 넓게:
```tsx
<div className="mx-auto w-full max-w-[920px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:max-w-[1400px] md:px-12">
```

`max-w-[1400px]`는 md+ 에서만 적용 — 모바일은 기존 그대로.

- [ ] **Step 5: import — 신규 컴포넌트 (다음 task에서 만들 것)**

타입 에러 잠시 나는 게 정상 (다음 task에서 컴포넌트 생성). import 라인은 다음 task에서 추가.

- [ ] **Step 6: Commit (컴포넌트 생성 후 한 번에)**

이 task의 변경은 task 8·9 완료 후 함께 commit.

---

## Task 8: `MaterialView` + `PdfViewer` + `PageChip` 컴포넌트

**Files:**
- Create: `src/app/dashboard/study/[course]/[material]/material-view.tsx`

데스크톱 split + 모바일 단일 컬럼을 한 클라이언트 컴포넌트로. iframe fragment 점프, page state.

- [ ] **Step 1: 파일 작성**

```tsx
// src/app/dashboard/study/[course]/[material]/material-view.tsx
"use client";

import { useState } from "react";
import { SummaryColumn } from "./summary-column";
import type { SummarizeOutputT } from "@/lib/schemas";

/**
 * 자료 상세의 split-view 본체.
 *
 * 데스크톱(md+): 좌측 sticky PDF iframe + 우측 스크롤 summary.
 * 모바일(<md): 단일 컬럼 summary만. 페이지 칩은 새 탭으로 PDF를 열도록 분기.
 *
 * iframe은 page 바뀔 때 key remount — Chrome이 같은 URL의 #page=N fragment만
 * 바뀌면 가끔 점프 안 하는 버그가 있어, 안정성 우선 위해 강제 remount.
 */
export function MaterialView({
  pdfUrl,
  summary,
  className,
}: {
  pdfUrl: string;
  summary: SummarizeOutputT;
  className?: string;
}) {
  const [page, setPage] = useState<number>(1);

  function jumpDesktop(target: number) {
    setPage(target);
  }
  function jumpMobile(target: number) {
    window.open(`${pdfUrl}#page=${target}`, "_blank", "noopener");
  }

  return (
    <section className={className}>
      {/* 데스크톱: split */}
      <div className="hidden md:grid md:grid-cols-[1.2fr_1fr] md:gap-6 lg:grid-cols-[1.3fr_1fr] lg:gap-8">
        <div className="sticky top-4 h-[calc(100vh-2rem)] overflow-hidden rounded-[18px] bg-white">
          <PdfViewer src={pdfUrl} page={page} />
        </div>
        <SummaryColumn summary={summary} onPageClick={jumpDesktop} />
      </div>

      {/* 모바일: 단일 컬럼 */}
      <div className="md:hidden">
        <SummaryColumn summary={summary} onPageClick={jumpMobile} />
      </div>
    </section>
  );
}

function PdfViewer({ src, page }: { src: string; page: number }) {
  // key remount로 fragment 점프를 안정적으로
  return (
    <iframe
      key={page}
      src={`${src}#page=${page}`}
      title="자료 원본 PDF"
      className="h-full w-full"
    />
  );
}

export function PageChip({ page, onClick }: { page: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center rounded-[6px] border border-[var(--color-apple-hairline)] bg-white px-1.5 py-0.5 text-[11px] wght-560 tabular-nums text-[var(--color-apple-muted)] hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
      style={{ letterSpacing: "-0.012em" }}
    >
      p.{page}
    </button>
  );
}
```

- [ ] **Step 2: 타입 체크 (이번 컴포넌트만)**

Run: `npx tsc --noEmit`
Expected: `summary-column.tsx 없음` 에러 (다음 task에서 만듦). 다른 에러 없음 확인.

---

## Task 9: `SummaryColumn` 컴포넌트 — 기존 SummaryArticle 확장 + PageChip 박기

**Files:**
- Create: `src/app/dashboard/study/[course]/[material]/summary-column.tsx`

`page.tsx`의 기존 `SummaryArticle` (37~157 부근) 로직을 그대로 옮기면서 각 block에 PageChip 추가.

- [ ] **Step 1: 기존 SummaryArticle 마크업 확인**

```bash
grep -n "function SummaryArticle\|function SummaryBlocks\|function Keywords" src/app/dashboard/study/\[course\]/\[material\]/page.tsx
```

`page.tsx`의 SummaryArticle / SummaryBlocks 구조를 그대로 복제 + 각 블록에 `sourcePage` 있으면 PageChip 추가.

- [ ] **Step 2: 파일 작성**

```tsx
// src/app/dashboard/study/[course]/[material]/summary-column.tsx
"use client";

import { WizardWatermark } from "@/components/wizard-shell";
import type { SummarizeOutputT } from "@/lib/schemas";
import { PageChip } from "./material-view";

/**
 * 자료 상세의 우측(또는 모바일 단일) 요약 컬럼.
 *
 * 기존 page.tsx의 SummaryArticle 구조를 그대로 가져오되 각 블록의 sourcePage가
 * 있으면 PageChip을 박는다. 칩 클릭은 onPageClick으로 위임 — 데스크톱이면
 * 좌측 iframe 점프, 모바일이면 새 탭.
 */
export function SummaryColumn({
  summary,
  onPageClick,
}: {
  summary: SummarizeOutputT;
  onPageClick: (page: number) => void;
}) {
  return (
    <article className="rounded-[18px] bg-white p-7 sm:p-9">
      <p
        className="text-[15px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.022em" }}
      >
        {summary.leadSentence}
      </p>

      <div className="mt-8 flex flex-col gap-6">
        {summary.blocks.map((block, i) => (
          <BlockRow key={i} block={block} onPageClick={onPageClick} />
        ))}
      </div>

      {summary.reviewSpots.length > 0 && (
        <div className="mt-10 rounded-[12px] bg-[var(--color-apple-pearl)] p-5 sm:p-6">
          <p
            className="text-[11px] wght-560 uppercase tracking-[0.06em] text-[var(--color-apple-muted)]"
          >
            복습 포인트
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {summary.reviewSpots.map((spot, i) => (
              <li key={i}>
                <p
                  className="text-[14px] wght-560 text-[var(--color-apple-ink)]"
                  style={{ letterSpacing: "-0.012em" }}
                >
                  {spot.title}
                </p>
                <p
                  className="mt-1 text-[13px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
                  style={{ letterSpacing: "-0.022em" }}
                >
                  {spot.why}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <WizardWatermark modelText={summary.watermark} />
    </article>
  );
}

function BlockRow({
  block,
  onPageClick,
}: {
  block: SummarizeOutputT["blocks"][number];
  onPageClick: (page: number) => void;
}) {
  const chip = block.sourcePage ? (
    <PageChip page={block.sourcePage} onClick={() => onPageClick(block.sourcePage as number)} />
  ) : null;

  if (block.type === "h2") {
    return (
      <div className="flex flex-wrap items-baseline gap-2">
        <h2
          className="text-[20px] wght-620 text-[var(--color-apple-ink)] sm:text-[22px]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {block.content}
        </h2>
        {chip}
      </div>
    );
  }
  if (block.type === "para") {
    return (
      <div>
        <p
          className="text-[15px] leading-[1.65] wght-450 text-[var(--color-apple-ink)]"
          style={{ letterSpacing: "-0.012em" }}
        >
          {block.content}
        </p>
        {chip && <div className="mt-2">{chip}</div>}
      </div>
    );
  }
  if (block.type === "bullets") {
    return (
      <div>
        <ul className="flex flex-col gap-2">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex gap-2 text-[14.5px] leading-[1.6] wght-450 text-[var(--color-apple-ink)]"
              style={{ letterSpacing: "-0.012em" }}
            >
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-apple-muted)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {chip && <div className="mt-2">{chip}</div>}
      </div>
    );
  }
  // callout
  const toneClass =
    block.tone === "warn"
      ? "bg-[#fff5f5] border-[#f7c5c5]"
      : block.tone === "tip"
        ? "bg-[#f0f9f1] border-[#bee0c1]"
        : "bg-[#f0f7ff] border-[#c8e0f3]";
  return (
    <div className={`rounded-[12px] border p-4 ${toneClass}`}>
      <p
        className="text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-ink)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {block.content}
      </p>
      {chip && <div className="mt-2">{chip}</div>}
    </div>
  );
}
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 다른 에러 없음. `SplitWithConvertingLeft`/`SplitWithFailedLeft`/`MaterialView` import 에러는 task 7·10 완료 후 사라짐.

---

## Task 10: 변환 중·실패 placeholder 컴포넌트 + polling

**Files:**
- Create: `src/app/dashboard/study/[course]/[material]/pdf-convert-states.tsx`

좌측에 "변환 중" 카드(폴링) 또는 "변환 실패" 카드(다운로드 fallback). 우측은 SummaryColumn 그대로.

- [ ] **Step 1: 파일 작성**

```tsx
// src/app/dashboard/study/[course]/[material]/pdf-convert-states.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useActiveJobs } from "@/lib/hooks/use-active-jobs";
import type { SummarizeOutputT } from "@/lib/schemas";
import { SummaryColumn } from "./summary-column";

/**
 * Office 원본인데 PDF 변환이 아직 안 끝난 상태의 split-view.
 * 좌측: spinner + "PDF 변환 중" 카드. polling.
 * 우측: 일반 SummaryColumn (page 칩은 변환 끝나기 전엔 동작 X — 일단 그대로 클릭 가능,
 *       모바일 새 탭으로 가도 원본 파일이라 페이지 점프 미지원이지만 다운은 됨).
 */
export function SplitWithConvertingLeft({
  materialId,
  summary,
  className,
}: {
  materialId: string;
  summary: SummarizeOutputT;
  className?: string;
}) {
  const router = useRouter();
  const { jobs } = useActiveJobs();
  const sawActiveRef = useRef(false);
  const active = jobs.find((j) => j.materialId === materialId && j.tool === "convert-pdf");

  useEffect(() => {
    if (active) {
      sawActiveRef.current = true;
      return;
    }
    if (sawActiveRef.current) {
      router.refresh();
    }
  }, [active, router]);

  // 모바일·데스크톱 모두 SummaryColumn은 같은 동작 — 일단 좌측은 데스크톱에서만 표시
  function onChipClick() {
    // 변환 끝나기 전엔 페이지 점프 의미 없음 — no-op
  }

  return (
    <section className={className}>
      <div className="hidden md:grid md:grid-cols-[1.2fr_1fr] md:gap-6 lg:grid-cols-[1.3fr_1fr] lg:gap-8">
        <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col items-center justify-center rounded-[18px] bg-white px-8 py-12 text-center">
          <span
            aria-hidden
            className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--color-apple-hairline)] border-t-[var(--color-apple-action)]"
          />
          <p
            className="mt-5 text-[15px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            원본을 PDF로 바꾸는 중이에요
          </p>
          <p
            className="mt-2 max-w-[340px] text-[13px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            보통 10~30초 걸려요. 끝나면 자동으로 원본이 표시돼요.
          </p>
        </div>
        <SummaryColumn summary={summary} onPageClick={onChipClick} />
      </div>
      <div className="md:hidden">
        <SummaryColumn summary={summary} onPageClick={onChipClick} />
      </div>
    </section>
  );
}

/**
 * Office 원본 + PDF 변환 실패한 상태.
 * 좌측: "변환 실패, 원본 다운로드" fallback. 우측: SummaryColumn.
 */
export function SplitWithFailedLeft({
  materialId,
  summary,
  filename,
  className,
}: {
  materialId: string;
  summary: SummarizeOutputT;
  filename: string;
  className?: string;
}) {
  async function onDownload() {
    const r = await fetch(`/api/materials/${materialId}/original-url`, { cache: "no-store" });
    const b = (await r.json().catch(() => null)) as { ok: true; url: string } | { ok: false; error: string } | null;
    if (b && b.ok) {
      window.open(b.url, "_blank", "noopener");
    } else {
      alert(b && !b.ok ? b.error : "다운로드 URL 발급 실패");
    }
  }

  return (
    <section className={className}>
      <div className="hidden md:grid md:grid-cols-[1.2fr_1fr] md:gap-6 lg:grid-cols-[1.3fr_1fr] lg:gap-8">
        <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col items-center justify-center rounded-[18px] bg-white px-8 py-12 text-center">
          <p
            className="text-[15px] wght-560 text-[var(--color-apple-ink)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            원본을 PDF로 바꾸지 못했어요
          </p>
          <p
            className="mt-2 max-w-[340px] text-[13px] leading-[1.55] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.022em" }}
          >
            요약은 정상이에요. 원본 파일은 아래에서 받을 수 있어요.
          </p>
          <button
            type="button"
            onClick={onDownload}
            className="mt-6 rounded-[8px] border border-[var(--color-apple-hairline)] bg-white px-4 py-2 text-[13px] wght-560 text-[var(--color-apple-ink)] hover:border-[var(--color-apple-action)] hover:text-[var(--color-apple-action)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            {filename} 다운로드
          </button>
        </div>
        <SummaryColumn summary={summary} onPageClick={() => {}} />
      </div>
      <div className="md:hidden">
        <SummaryColumn summary={summary} onPageClick={() => {}} />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: original 다운로드 라우트 추가**

`SplitWithFailedLeft`가 호출하는 `/api/materials/[id]/original-url` 라우트:

Create: `src/app/api/materials/[id]/original-url/route.ts`

```ts
import { NextResponse } from "next/server";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { createSignedReadUrl } from "@/lib/storage";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface OkResp { ok: true; url: string }
interface ErrResp { ok: false; error: string }

/**
 * 변환 실패 시 원본 Office 파일을 사용자가 다운받을 수 있게 signed URL 발급.
 * original_storage_path가 있으면 그걸, 없으면 storage_path를 노출.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse<OkResp | ErrResp>> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }
  const { id } = await ctx.params;

  const admin = getAdminSupabase();
  const { data, error } = await admin
    .from("materials")
    .select("storage_path, original_storage_path")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "자료를 찾을 수 없어요" }, { status: 404 });
  }
  const path = (data.original_storage_path as string | null) ?? (data.storage_path as string | null);
  if (!path) {
    return NextResponse.json({ ok: false, error: "원본 파일이 없어요" }, { status: 404 });
  }
  try {
    const url = await createSignedReadUrl({ storagePath: path });
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "URL 발급 실패" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: page.tsx import 추가 (task 7 미완 항목)**

`src/app/dashboard/study/[course]/[material]/page.tsx` 상단 import에 추가:

```ts
import { MaterialView } from "./material-view";
import { SplitWithConvertingLeft, SplitWithFailedLeft } from "./pdf-convert-states";
```

- [ ] **Step 4: 타입 체크**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit (task 7·8·9·10 한 번에)**

```bash
git add \
  src/app/dashboard/study/\[course\]/\[material\]/page.tsx \
  src/app/dashboard/study/\[course\]/\[material\]/material-view.tsx \
  src/app/dashboard/study/\[course\]/\[material\]/summary-column.tsx \
  src/app/dashboard/study/\[course\]/\[material\]/pdf-convert-states.tsx \
  src/app/api/materials/\[id\]/original-url/route.ts
git commit -m "Add split-view material detail + PDF-convert UI states

PDF uploads now get a desktop split-view: sticky iframe on the left,
scrollable summary with p.N chips on the right. Clicking a chip remounts
the iframe at #page=N; on mobile the chip opens a new tab instead.

Office uploads land on one of three left-side states depending on the
convert-pdf job: a polling spinner while it runs, a finished PDF iframe
once done (via router.refresh), or a download-original fallback if it
errored. The summary column stays identical across all states."
```

---

## Task 11: 프로덕션 배포 + 4가지 자료 타입 실측

**Files:**
- 변경 없음 — git push만

- [ ] **Step 1: 사용자에게 마이그레이션 적용 확인**

배포 전 0011 마이그레이션이 production Supabase에 적용됐는지 사용자에게 확인:
```
0011 마이그레이션이 production Supabase Dashboard에서 실행됐는지 확인해 주세요.
안 됐으면 지금 SQL Editor에서 실행 후 알려주세요.
```

- [ ] **Step 2: Vercel env에 CLOUDCONVERT_API_KEY 있는지 확인 안내**

```
Vercel project → Settings → Environment Variables → CLOUDCONVERT_API_KEY가
Production·Preview 둘 다 박혀있는지 확인해 주세요.
```

- [ ] **Step 3: push (사용자 명시 승인 받은 후)**

```bash
git push origin main
```

GitHub auto-deploy 트리거됨.

- [ ] **Step 4: 빌드 완료 모니터**

```bash
vercel ls --prod | grep "arch-campus-" | head -1
```
`● Ready` 확인 (~1분).

- [ ] **Step 5: 실측 시나리오 4종**

사용자가 프로덕션에서 직접:

1. **PDF 자료 업로드** → 상세 페이지 진입
   - 데스크톱: 좌측 iframe + 우측 요약 + `p.N` 칩 클릭 시 iframe 점프 확인
   - 모바일: 단일 컬럼, 칩 클릭 시 새 탭

2. **PPTX 자료 업로드 (Unit 6 같은 파일)** → 상세 진입
   - 즉시 도착 시: 좌측 "PDF 변환 중" spinner + 우측 요약 (요약이 먼저 완료될 수도 있음)
   - 10~30초 후 자동 refresh → 좌측 iframe으로 교체

3. **DOCX 자료 업로드** → 같은 흐름 확인

4. **변환 실패 시뮬레이션** (선택):
   - 일시적으로 Vercel env의 `CLOUDCONVERT_API_KEY`를 잘못된 값으로 바꾸고 자료 1개 업로드 → "변환 실패, 원본 다운로드" fallback 확인
   - 끝나면 키 원복 + 재배포

- [ ] **Step 6: 실측 통과 후 진단 메모 기록**

`docs/diagnostics/2026-05-16-split-view-verification.md` 같은 파일에 결과 짧게 (어느 파일 타입 OK / 못 본 케이스). Optional.

---

## Plan Self-Review (작성자 점검)

- **Spec coverage**: spec의 모든 결정점이 task로 매핑됐는지 확인
  - DB (original_storage_path + jobs.tool CHECK) → Task 1 ✓
  - createSignedReadUrl → Task 3 ✓
  - CloudConvert client → Task 4 ✓
  - convert-pdf job runner → Task 5 ✓
  - finalize 수정 → Task 6 ✓
  - page.tsx 분기 → Task 7 ✓
  - MaterialView/PdfViewer/PageChip → Task 8 ✓
  - SummaryColumn → Task 9 ✓
  - PdfConvertLoading (변환 중) + 변환 실패 fallback → Task 10 ✓
  - 검증 → Task 11 ✓
  - MaterialDetail에 mimeType·storagePath 노출 → Task 2 ✓ (spec엔 명시 없었으나 page.tsx 분기 필수 — 자체 발견)

- **Placeholder scan**: "TBD", "TODO", "fill in" 없음. 모든 step에 실제 코드 박힘.

- **Type consistency**:
  - `runConvertPdfJob` 시그니처 (Task 5) ↔ finalize 호출 (Task 6 Step 4) — `sourceStoragePath` · `filename` 두 곳 일치 ✓
  - `MaterialDetail.mimeType` · `storagePath` (Task 2) ↔ page.tsx에서 `detail.mimeType` · `detail.storagePath` (Task 7) ✓
  - `createSignedReadUrl({ storagePath, ttlSec })` (Task 3) ↔ runConvertPdfJob·page.tsx 호출 ✓
  - `PageChip` props (Task 8) ↔ SummaryColumn에서 호출 (Task 9) ✓

이슈 없음 — plan 완성.

---

## 작업 시간 추정

| Task | 추정 |
|---|---|
| 0. 사전 준비 (사용자) | 10분 |
| 1. 마이그레이션 | 15분 |
| 2. MaterialDetail 확장 | 15분 |
| 3. createSignedReadUrl | 10분 |
| 4. CloudConvert client | 45분 |
| 5. runConvertPdfJob | 30분 |
| 6. finalize 수정 | 30분 |
| 7. page.tsx 분기 | 30분 |
| 8. MaterialView | 45분 |
| 9. SummaryColumn | 45분 |
| 10. 변환 상태 컴포넌트 | 1h |
| 11. 배포 + 실측 | 30분 |
| **합계** | **~6h** |

