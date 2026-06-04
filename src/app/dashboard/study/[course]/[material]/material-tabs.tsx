import Link from "next/link";
import type { MaterialListItem } from "@/lib/data/materials";

/**
 * 자료 상세 페이지 상단 — 같은 과목의 다른 자료들 가로 chip rail.
 *
 * 사용자 요청 (2026-05-30): 한 자료 보다가 같은 과목 다른 자료로 가려면 뒤로 → 다시 진입.
 * → 자료 페이지 위에 형제 자료 chip 가로로 쭉. 현재 자료는 검은 active.
 *
 * 톤:
 *  - chip pill (rounded-full)
 *  - 숫자 단서 (1, 2, 3 ...) + 문서 아이콘 + 제목 (truncate)
 *  - 현재 자료는 bg ink + 흰 글자
 *  - 가로 overflow scroll + scrollbar-hidden
 *  - 우측 "N / M 개 자료" 라벨
 */
export function MaterialTabs({
  courseLabel,
  materials,
  currentMaterialId,
}: {
  courseLabel: string;
  materials: MaterialListItem[];
  currentMaterialId: string;
}) {
  if (materials.length <= 1) return null;

  const currentIdx = materials.findIndex((m) => m.id === currentMaterialId);
  const currentLabel = currentIdx >= 0 ? currentIdx + 1 : 1;

  return (
    <nav
      aria-label="같은 과목 자료"
      className="fade-up fade-up-1 mt-4 flex items-center gap-2 sm:mt-5"
    >
      <ul
        className="flex flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {materials.map((m, idx) => {
          const isActive = m.id === currentMaterialId;
          const num = idx + 1;
          return (
            <li key={m.id} className="shrink-0" style={{ scrollSnapAlign: "start" }}>
              <Link
                href={`/dashboard/study/${encodeURIComponent(courseLabel)}/${m.id}`}
                aria-current={isActive ? "page" : undefined}
                className={`spring-press group inline-flex h-9 items-center gap-2 rounded-full pl-2 pr-3.5 transition-all ${
                  isActive
                    ? "bg-[var(--color-apple-ink)] text-white shadow-[0_4px_12px_-4px_rgba(0,0,0,0.25)]"
                    : "border border-[var(--color-apple-hairline-soft)] bg-white text-[var(--color-apple-muted)] hover:border-[var(--color-apple-hairline)] hover:text-[var(--color-apple-ink)]"
                }`}
                style={{ letterSpacing: "-0.012em" }}
                title={m.title}
              >
                <span
                  className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10.5px] wght-700 tabular-nums ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-[var(--color-apple-pearl)] text-[var(--color-apple-muted)]"
                  }`}
                >
                  {num}
                </span>
                <DocIcon />
                <span className="max-w-[160px] truncate text-[12.5px] wght-620 sm:max-w-[200px]">
                  {m.title}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <span
        className="shrink-0 text-[11.5px] wght-560 tabular-nums text-[var(--color-apple-muted)]"
        style={{ letterSpacing: "-0.012em" }}
      >
        {currentLabel} / {materials.length}
      </span>
    </nav>
  );
}

function DocIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="shrink-0 opacity-80"
    >
      <path
        d="M4.5 1.5h5L12 4v9.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M9 1.5V4h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
