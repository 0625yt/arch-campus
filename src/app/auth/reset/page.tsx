import { ResetPanel } from "./reset-panel";

export const dynamic = "force-dynamic";

/**
 * 비밀번호 재설정 — 메일 링크 클릭 후 도착.
 *
 * Supabase의 resetPasswordForEmail이 보낸 메일 링크는 hash fragment로 access token을 박는다.
 * 클라이언트(brawer client)가 자동으로 hash를 파싱해서 session으로 등록.
 * 그래서 이 화면은 server에서 세션 검사 X (hash는 서버로 안 옴).
 */
export default function ResetPage() {
  return (
    <main
      className="relative min-h-screen overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(122, 166, 214, 0.45), transparent 65%), radial-gradient(ellipse 60% 40% at 100% 0%, rgba(243, 207, 138, 0.40), transparent 70%), radial-gradient(ellipse 80% 55% at 0% 100%, rgba(176, 156, 200, 0.42), transparent 70%), radial-gradient(ellipse 50% 30% at 100% 100%, rgba(122, 166, 214, 0.20), transparent 70%), #ffffff",
      }}
    >
      <div className="relative mx-auto flex min-h-screen w-full max-w-[420px] flex-col justify-center px-7 py-16">
        <header>
          <h1
            className="text-[28px] leading-[1.18] wght-620 text-[var(--color-apple-ink)] sm:text-[32px]"
            style={{ letterSpacing: "-0.016em" }}
          >
            새 비밀번호를 만들어 주세요.
          </h1>
          <p
            className="mt-4 text-[14px] leading-[1.6] wght-450 text-[var(--color-apple-muted)]"
            style={{ letterSpacing: "-0.012em" }}
          >
            한 번만 더 적으면 끝이에요.
          </p>
        </header>

        <ResetPanel />
      </div>
    </main>
  );
}
