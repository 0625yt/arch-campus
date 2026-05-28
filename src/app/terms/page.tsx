import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white px-5 py-8 text-[var(--color-apple-ink)] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-[760px]">
        <Header eyebrow="Terms" title="이용약관" />

        <section className="mt-10 space-y-8 text-[14px] leading-[1.8] wght-450 text-[var(--color-apple-muted)]">
          <PolicyBlock title="1. 서비스의 역할">
            arch는 대학 생활에서 발생하는 강의자료, 일정, 과제, 복습 흐름을 정리하는 학습 보조
            서비스입니다. 제출물 작성, 시험 응시, 학사 판단의 최종 책임은 사용자에게 있습니다.
          </PolicyBlock>
          <PolicyBlock title="2. 사용자 자료">
            사용자는 본인이 이용할 권한이 있는 자료만 업로드해야 합니다. 타인의 저작물, 개인정보,
            시험 부정행위에 해당할 수 있는 자료는 업로드하지 않아야 합니다.
          </PolicyBlock>
          <PolicyBlock title="3. AI 결과">
            AI가 만든 요약, 일정 후보, 체크리스트, 문제는 보조 정보입니다. 중요한 마감, 제출 형식,
            평가 기준은 반드시 원문과 함께 확인해야 합니다.
          </PolicyBlock>
          <PolicyBlock title="4. 제한 사항">
            서비스는 부정행위, 대리 작성, 저작권 침해, 타인 정보 수집을 돕기 위해 사용할 수
            없습니다. 위반이 확인되면 이용이 제한될 수 있습니다.
          </PolicyBlock>
          <PolicyBlock title="5. 문의">
            약관과 서비스 이용 관련 문의는 운영자에게 전달할 수 있습니다. 정식 출시 전 약관은 베타
            운영 정책에 맞춰 업데이트될 수 있습니다.
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
