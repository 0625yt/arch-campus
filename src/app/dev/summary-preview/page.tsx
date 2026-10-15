import { readFile } from "node:fs/promises";
import { notFound } from "next/navigation";
import { SummarizeOutput } from "@/lib/schemas";
import { SummaryPreview } from "./summary-preview";
export const dynamic = "force-dynamic";
export default async function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  let summary: ReturnType<typeof SummarizeOutput.parse>;
  try {
    summary = SummarizeOutput.parse(
      JSON.parse(await readFile(`${process.cwd()}/.tmp/summary-100-pages.json`, "utf8")),
    );
  } catch {
    notFound();
  }
  return <SummaryPreview summary={summary} />;
}
