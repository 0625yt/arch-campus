export interface JobCheckpoint {
  stage: string;
  progress: number;
  at: string;
}

export function parseJobCheckpoints(value: unknown): JobCheckpoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): JobCheckpoint[] => {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.stage !== "string" ||
      typeof item.progress !== "number" ||
      !Number.isFinite(item.progress) ||
      item.progress < 0 ||
      item.progress > 100 ||
      typeof item.at !== "string" ||
      !Number.isFinite(Date.parse(item.at))
    )
      return [];
    return [{ stage: item.stage, progress: item.progress, at: item.at }];
  });
}

/** Keep the last useful processing stage visible after a terminal failure marker. */
export function lastProcessingCheckpoint(value: unknown): JobCheckpoint | null {
  return (
    parseJobCheckpoints(value).findLast(
      (item) => !["failed", "completed", "cancelled"].includes(item.stage),
    ) ?? null
  );
}
