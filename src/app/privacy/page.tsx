import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-8 text-[var(--color-apple-ink)] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-[760px]">
        <Header eyebrow="Privacy" title="개인정보처리방침" />

        <section className="mt-10 space-y-8 text-[14px] leading-[1.8] wght-450 text-[var(--color-apple-muted)]">
          <PolicyBlock title="1. 수집하는 정보">
            로그인에 필요한 계정 식별 정보, 사용자가 직접 입력한 프로필, 업로드한 학습 자료, 생성된
            일정, 퀴즈, 요약, 활동 기록을 서비스 제공을 위해 처리합니다.
          </PolicyBlock>
          <PolicyBlock title="2. 이용 목적">
            자료 분석, 일정 후보 생성, 과목별 학습 기록, 복습 큐, 계정 보안, 오류 분석과 서비스
            개선을 위해 정보를 사용합니다.
          </PolicyBlock>
          <PolicyBlock title="3. 자료 처리 원칙">
            사용자가 올린 강의자료와 일정 정보는 사용자의 학습 흐름을 만들기 위한 목적으로
            처리됩니다. 공개 기능이나 팀 공유 기능이 없는 한 다른 사용자에게 노출하지 않습니다.
          </PolicyBlock>
          <PolicyBlock title="4. 보관과 삭제">
            사용자는 계정 설정에서 계정 삭제를 요청할 수 있으며, 삭제 요청이 완료되면 관련 데이터와
            저장 객체를 함께 정리합니다.
          </PolicyBlock>
          <PolicyBlock title="5. 외부 처리">
            AI 분석, 파일 변환, 인증 등 서비스 제공에 필요한 범위에서 외부 처리 시스템을 사용할 수
            있습니다. 정식 출시 전 세부 목록은 운영 정책에 맞춰 갱신됩니다.
          </PolicyBlock>
        </section>
      </div>
    </main>
  );
}

function Header({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header>
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-[13px] wght-620 text-[var(--color-apple-muted)] transition-colors hover:text-[var(--color-apple-ink)]"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[var(--color-apple-ink)] text-[12px] wght-700 text-white">
          a
        </span>
        arch
      </Link>
      <p className="mt-12 text-[12px] wght-700 uppercase text-[var(--color-apple-action)]">
        {eyebrow}
      </p>
      <h1 className="mt-3 text-[38px] leading-[1.08] wght-700 sm:text-[52px]">{title}</h1>
      <p className="mt-4 text-[13px] wght-450 text-[var(--color-apple-muted)]">
        시행일: 2026년 5월 27일
      </p>
    </header>
  );
}

function PolicyBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="border-t border-[var(--color-apple-hairline-soft)] pt-5">
      <h2 className="text-[17px] wght-700 text-[var(--color-apple-ink)]">{title}</h2>
      <p className="mt-2">{children}</p>
    </article>
  );
}
