import "server-only";
import { safeFetch } from "./ssrf-guard";

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
 * 일시적 장애로 분류해 재시도할 가치가 있는지 판단.
 *
 * 재시도 O: 네트워크 오류, 5xx, 429 (rate limit), job 생성 HTTP 실패.
 * 재시도 X: API 키 누락(영구), 4xx 거절(파일 형식·권한), 변환 자체 실패(같은 파일·같은 결과).
 */
function isRetriableConvertError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("CLOUDCONVERT_API_KEY 미설정")) return false;
  if (msg.includes("확장자를 알 수 없는")) return false;
  if (msg.includes("변환 실패")) return false; // CloudConvert가 명시적으로 status=error
  // job 생성 4xx — 잘못된 요청. 5xx·네트워크면 재시도.
  const httpMatch = msg.match(/job 생성 실패: (\d{3})/);
  if (httpMatch) {
    const code = Number(httpMatch[1]);
    return code >= 500 || code === 429;
  }
  // 상태 조회 실패·타임아웃·다운로드 실패는 일시적일 수 있음
  return true;
}

/**
 * Office 파일을 PDF로 변환. 일시적 장애(네트워크·5xx·429·다운로드 실패) 시 자동 재시도.
 *
 * 백오프: 1s → 3s → 8s. 최대 3회 시도. 영구 실패(키 누락·잘못된 파일)는 즉시 throw.
 * convertToPdfOnce가 실제 한 번 호출 로직, convertToPdf는 재시도 래퍼.
 */
export async function convertToPdf(opts: {
  sourceUrl: string;
  filename: string;
}): Promise<Uint8Array> {
  const RETRY_DELAYS_MS = [1000, 3000, 8000];
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await convertToPdfOnce(opts);
    } catch (e) {
      lastErr = e;
      if (!isRetriableConvertError(e) || attempt >= RETRY_DELAYS_MS.length) {
        throw e;
      }
      const delay = RETRY_DELAYS_MS[attempt];
      console.warn(
        `[cloudconvert] 재시도 ${attempt + 1}/${RETRY_DELAYS_MS.length} (${delay}ms 대기): ${e instanceof Error ? e.message : e}`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * 한 번 호출 — 흐름:
 *   1) /jobs POST — import-url(우리 signed URL) → convert(pdf) → export-url 3-task 묶음
 *   2) /jobs/:id GET 폴링 (5s × 최대 60회 = 5분)
 *   3) export task의 result.files[0].url에서 PDF 바이트 다운로드
 *
 * 입력은 우리 Storage의 signed download URL — CloudConvert가 직접 받아 처리.
 * 결과 파일은 30일 후 자동 삭제 (CloudConvert 정책).
 *
 * 에러: API 키 누락, 변환 실패, 폴링 5분 초과, 결과 다운로드 실패 — 각각 throw.
 */
async function convertToPdfOnce(opts: {
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

  // 2) 폴링 — 첫 1분은 3초 간격(빠른 변환 잡 빠르게 catch), 그 뒤 5초 간격.
  // status fetch가 연속 3회 실패하면 throw (네트워크 장애 빠르게 노출, 5분 대기 X).
  const startedAt = Date.now();
  const TIMEOUT_MS = 5 * 60 * 1000;
  let consecutiveStatusFailures = 0;
  while (Date.now() - startedAt < TIMEOUT_MS) {
    const elapsed = Date.now() - startedAt;
    const intervalMs = elapsed < 60_000 ? 3_000 : 5_000;
    await new Promise((r) => setTimeout(r, intervalMs));
    const statusRes = await fetch(`${API_BASE}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    }).catch((e) => {
      console.warn(`[cloudconvert] status fetch 네트워크 오류: ${e}`);
      return null;
    });
    if (!statusRes || !statusRes.ok) {
      consecutiveStatusFailures++;
      if (consecutiveStatusFailures >= 3) {
        const statusCode = statusRes ? `HTTP ${statusRes.status}` : "네트워크 끊김";
        throw new Error(`CloudConvert 상태 조회 연속 실패 (${statusCode})`);
      }
      continue;
    }
    consecutiveStatusFailures = 0;
    const statusJob = (await statusRes.json()) as CCJobResponse;
    if (statusJob.data.status === "error") {
      const failed = statusJob.data.tasks.find((t) => t.status === "error");
      throw new Error(`CloudConvert 변환 실패: ${failed?.message ?? failed?.code ?? "unknown"}`);
    }
    if (statusJob.data.status === "finished") {
      const exportTask = statusJob.data.tasks.find((t) => t.name === "export-file");
      const fileUrl = exportTask?.result?.files?.[0]?.url;
      if (!fileUrl) throw new Error("CloudConvert: export URL 누락");
      // 3) 결과 다운로드 — CloudConvert 응답이 변조되거나 SSRF 유도하는 URL이 들어와도
      //    safeFetch가 사설·loopback·link-local·메타데이터(169.254.169.254) 호스트를 차단.
      //    redirect도 manual로 막아 우회 차단.
      const fileRes = await safeFetch(fileUrl);
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

/**
 * cloudconvert에 보내도 PDF로 바뀌어 돌아올 수 있는 Office 계열 확장자.
 * PDF·이미지·텍스트(txt/md/json/csv 등)는 변환 대상 X — 호출자가 사전 차단해야 함.
 */
export const CONVERTIBLE_EXTENSIONS = [
  "pptx",
  "ppt",
  "docx",
  "doc",
  "hwpx",
  "hwp",
  "odt",
  "odp",
  "rtf",
] as const;

/**
 * 파일명이 cloudconvert로 PDF 변환 가능한지 체크. enqueue 전에 호출.
 */
export function isConvertibleToPdf(filename: string): boolean {
  const ext = filename2ext(filename);
  return ext !== null;
}

function filename2ext(name: string): string | null {
  const dot = name.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return (CONVERTIBLE_EXTENSIONS as readonly string[]).includes(ext) ? ext : null;
}
