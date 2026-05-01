"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * 실시간 카운트다운.
 * - 24시간 이내: "6시간 41분 23초 남음" (1초마다 갱신)
 * - 1~7일: "3일 12시간 남음" (1분마다 갱신)
 * - 7일+: "12일 남음" (1시간마다 갱신)
 */
export function Countdown({
  target,
  className,
  prefix,
  suffix,
}: {
  target: Date | string;
  className?: string;
  prefix?: string;
  suffix?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = typeof target === "string" ? new Date(target) : target;
    const diffMs = t.getTime() - Date.now();

    // 24시간 이내면 1초마다, 아니면 1분마다
    const intervalMs = diffMs < 24 * 60 * 60_000 ? 1000 : 60_000;
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [target]);

  if (!now) {
    return <span className={className}>{prefix}계산 중{suffix}</span>;
  }

  const t = typeof target === "string" ? new Date(target) : target;
  const diffMs = t.getTime() - now.getTime();

  if (diffMs <= 0) {
    return (
      <span className={cn(className, "wght-560 text-[var(--color-urgent)]")}>
        {prefix}마감 지났어요{suffix}
      </span>
    );
  }

  const totalSec = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  let label: string;
  if (days >= 7) {
    label = `${days}일 남음`;
  } else if (days >= 1) {
    label = `${days}일 ${hours}시간 남음`;
  } else {
    // 24시간 이내 — 초까지
    label = `${hours}시간 ${minutes}분 ${seconds.toString().padStart(2, "0")}초 남음`;
  }

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {label}
      {suffix}
    </span>
  );
}
