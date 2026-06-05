import { describe, expect, it } from "vitest";
import { isoToKstMinutes } from "./time-grid";

/**
 * 시간 변환 회귀 테스트 — 캘린더 일정이 엉뚱한 시각에 그려지던 버그 방지.
 *
 * 2026-06-05: isoToKstMinutes가 `new Date(d.toLocaleString(...))` 라운드트립을 써서
 *   실행 환경 타임존으로 재해석돼, KST 09:00 강의가 00:00(UTC)에 그려졌다.
 *   (한국 브라우저에선 우연히 맞아 안 잡힘 — UTC 서버/외국 클라이언트에서만 깨짐.)
 *   Intl part 직접 읽기로 고친 뒤, 어느 환경에서 돌려도 KST 분이 나와야 한다.
 *
 * 핵심 불변식: KST hh:mm 강의의 UTC ISO를 넣으면 hh*60+mm 분이 나온다.
 */
describe("isoToKstMinutes — KST 분 추출 (환경 비의존)", () => {
  it("KST 09:00 (= UTC 00:00) → 540분", () => {
    // KST 09:00 = UTC 00:00. 이게 깨지면 09:00 강의가 00:00에 그려진다(과거 버그).
    expect(isoToKstMinutes("2026-06-05T00:00:00.000Z")).toBe(9 * 60);
  });

  it("KST 13:30 (= UTC 04:30) → 810분", () => {
    expect(isoToKstMinutes("2026-06-05T04:30:00.000Z")).toBe(13 * 60 + 30);
  });

  it("KST 00:00 (= 전날 UTC 15:00) → 0분 (자정)", () => {
    expect(isoToKstMinutes("2026-06-04T15:00:00.000Z")).toBe(0);
  });

  it("KST 23:50 (= UTC 14:50) → 1430분", () => {
    expect(isoToKstMinutes("2026-06-05T14:50:00.000Z")).toBe(23 * 60 + 50);
  });

  it("이미 +09:00 오프셋 박힌 ISO도 동일하게 KST 분", () => {
    // 같은 순간을 KST 오프셋으로 표기 — 결과는 09:00 → 540분으로 같아야.
    expect(isoToKstMinutes("2026-06-05T09:00:00+09:00")).toBe(9 * 60);
  });
});
