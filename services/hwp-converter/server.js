import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10);
const MAX_BYTES = 25 * 1024 * 1024;
const SOFFICE_TIMEOUT_MS = 40_000;
const AUTH_TOKEN = process.env.HWP_CONVERTER_TOKEN;

const app = express();
app.disable("x-powered-by");
app.use(express.raw({ type: "application/octet-stream", limit: MAX_BYTES }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "hwp-converter" });
});

app.post("/convert", async (req, res) => {
  if (AUTH_TOKEN) {
    const provided = req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== AUTH_TOKEN) return res.status(401).json({ error: "unauthorized" });
  }
  const target = (req.query.to ?? "pdf").toString();
  if (target !== "pdf") return res.status(400).json({ error: "only to=pdf is supported" });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "empty body" });
  }
  if (req.body.length > MAX_BYTES) {
    return res.status(413).json({ error: "file too large" });
  }

  const filenameRaw = req.header("x-filename") ?? "input.hwp";
  const filename = decodeFilename(filenameRaw);
  const ext = filename.toLowerCase().endsWith(".hwpx") ? "hwpx" : "hwp";

  const workDir = await mkdtemp(join(tmpdir(), "hwp-conv-"));
  const inputPath = join(workDir, `input.${ext}`);
  const outputPath = join(workDir, "input.pdf");

  try {
    await writeFile(inputPath, req.body);
    await runSoffice(inputPath, workDir);
    const pdf = await readFile(outputPath);
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-length", pdf.length.toString());
    res.send(pdf);
  } catch (err) {
    console.error("convert failed", err);
    res.status(500).json({
      error: "conversion failed",
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});

function decodeFilename(raw) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return "input.hwp";
  }
}

function runSoffice(inputPath, outDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "soffice",
      [
        "--headless",
        "--norestore",
        "--nologo",
        "--nofirststartwizard",
        "--convert-to",
        "pdf",
        "--outdir",
        outDir,
        inputPath,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("soffice timeout"));
    }, SOFFICE_TIMEOUT_MS);

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`soffice exit ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

app.listen(PORT, () => {
  console.info(`hwp-converter listening on :${PORT}`);
});
