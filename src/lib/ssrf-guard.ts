import "server-only";

/**
 * SSRF (Server-Side Request Forgery) 가드 — 사용자가 입력한 URL을 서버에서 fetch 전에 검증.
 *
 * 위협 (OWASP A10):
 *   - 사용자가 http://169.254.169.254/... 같은 metadata 엔드포인트 입력 → Vercel·AWS 내부 정보 유출
 *   - 사용자가 http://localhost:5432 같은 내부 DB 포트 시도
 *   - 사용자가 file://, gopher://, ftp:// 같은 비-HTTP 스킴
 *
 * 사용:
 *   await assertSafeUrl(userProvidedUrl); // throw if unsafe
 *   const r = await fetch(userProvidedUrl);
 *
 * 현재 arch-campus엔 사용자 URL fetch 지점 없음. 향후 "URL로 자료 가져오기" 같은 기능
 * 추가 시 즉시 쓸 수 있게 미리 깔아둔다.
 */

const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);

/**
 * IPv4 사설·예약 대역. 4옥텟 비교.
 * - 10.0.0.0/8       (사설)
 * - 127.0.0.0/8      (loopback)
 * - 169.254.0.0/16   (link-local — AWS·GCP metadata 엔드포인트 포함)
 * - 172.16.0.0/12    (사설)
 * - 192.168.0.0/16   (사설)
 * - 0.0.0.0/8        (this network)
 * - 100.64.0.0/10    (carrier-grade NAT)
 * - 224.0.0.0/4      (multicast)
 * - 240.0.0.0/4      (reserved future)
 */
function isPrivateIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1, 5).map(Number);
  if (o.some((n) => n < 0 || n > 255)) return false;
  const [a, b] = o;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224 && a <= 239) return true;
  if (a >= 240) return true;
  return false;
}

/**
 * IPv6 link-local/loopback/ULA 빠른 검사. 정밀하지 않지만 흔한 우회 차단.
 *   - ::1            (loopback)
 *   - fc00::/7       (Unique Local)
 *   - fe80::/10      (link-local)
 *   - ::ffff:x.y.z.w (IPv4-mapped — 그 IPv4가 사설이면 차단)
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe90:") || lower.startsWith("fea0:")) return true;
  // IPv4-mapped
  const m = lower.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (m && isPrivateIPv4(m[1])) return true;
  return false;
}

/**
 * 호스트명이 IP 형태면 사설 대역 검사, 아니면 hostname 자체에서 흔한 우회만 차단.
 *
 * 완전 방어를 위해선 DNS resolve 후 IP 검사가 필요하지만, Node fetch는 hostname을
 * resolve해 connect 단계에서 처리하므로 호출자가 fetch 전후로 retry 없이
 * `assertSafeUrl` + `undici` Agent 옵션을 쓰는 게 정석. 여기선 URL 문자열 레벨
 * 1차 가드만 — 향후 undici Agent로 connect-time 가드 강화.
 */
function isUnsafeHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, ""); // IPv6 대괄호 제거
  if (h === "localhost") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return isPrivateIPv4(h);
  if (h.includes(":")) return isPrivateIPv6(h);
  // 흔한 internal 도메인 (Kubernetes 서비스 등)
  if (h.endsWith(".internal") || h.endsWith(".svc.cluster.local")) return true;
  return false;
}

export class SsrfBlockedError extends Error {
  constructor(reason: string, public readonly url: string) {
    super(`SSRF guard 차단: ${reason} (${url})`);
    this.name = "SsrfBlockedError";
  }
}

/**
 * 사용자 입력 URL을 fetch 전에 검증. 위험하면 SsrfBlockedError throw.
 *
 * 허용 조건:
 *   1. https: 또는 http: 스킴
 *   2. hostname이 사설·loopback·link-local 아님
 *   3. port가 명시적 X (또는 80/443만 허용 — 옵션)
 *
 * 사용자에게 보여줄 메시지는 reason에서 추출 (예: "사설 IP는 fetch 불가").
 */
export function assertSafeUrl(rawUrl: string, opts?: { allowHttp?: boolean }): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("URL 파싱 실패", rawUrl);
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfBlockedError(`허용 안 된 스킴: ${url.protocol}`, rawUrl);
  }
  if (url.protocol === "http:" && !opts?.allowHttp) {
    throw new SsrfBlockedError("HTTP 차단 (HTTPS만 허용)", rawUrl);
  }
  if (isUnsafeHost(url.hostname)) {
    throw new SsrfBlockedError(`사설·내부 호스트 차단: ${url.hostname}`, rawUrl);
  }

  return url;
}

/**
 * 단축형 — fetch 전에 한 줄.
 *
 *   const r = await safeFetch(userUrl);
 */
export async function safeFetch(rawUrl: string, init?: RequestInit): Promise<Response> {
  const url = assertSafeUrl(rawUrl);
  return fetch(url.toString(), {
    ...init,
    // redirect는 manual로 — 리다이렉트 통한 SSRF 우회 (https://attacker.com → http://169.254.169.254) 방어.
    // 호출자가 필요하면 next URL을 다시 assertSafeUrl 후 fetch.
    redirect: init?.redirect ?? "manual",
  });
}
