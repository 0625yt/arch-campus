import { redirect } from "next/navigation";
import { safeAuthRedirect } from "@/lib/auth-redirect";
import { requiresMfa } from "@/lib/mfa";
import { getServerSupabase } from "@/lib/supabase/server";
import { MfaChallenge } from "./mfa-challenge";

export const dynamic = "force-dynamic";
export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeAuthRedirect((await searchParams).next);
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!(await requiresMfa(supabase, user)))
    redirect(next.startsWith("/auth/mfa") ? "/dashboard" : next);
  const factors = (user.factors ?? [])
    .filter((f) => f.status === "verified" && f.factor_type === "totp")
    .map((f) => ({ id: f.id, name: f.friendly_name || "인증 앱" }));
  return (
    <main className="auth-light flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <section className="w-full max-w-sm">
        <h1 className="text-3xl font-semibold">2단계 인증</h1>
        <p className="mt-4 text-sm text-slate-600">등록한 인증 앱의 6자리 코드를 입력해주세요.</p>
        <MfaChallenge factors={factors} next={next} />
      </section>
    </main>
  );
}
