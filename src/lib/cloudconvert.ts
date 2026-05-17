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
