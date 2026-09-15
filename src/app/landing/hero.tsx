import { ArrowDown, ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import styles from "./landing.module.css";
import { SemesterDemo } from "./semester-demo";

const FLOWS = [
  { number: "01", title: "흩어진 일정은", result: "한눈에", href: "#product" },
  { number: "02", title: "쌓여 있는 자료는", result: "핵심만", href: "#material" },
  { number: "03", title: "헷갈렸던 문제는", result: "한 번 더", href: "#flow" },
] as const;

export function LandingHero({ startHref, startLabel }: { startHref: string; startLabel: string }) {
  return (
    <section className={styles.hero} aria-labelledby="landing-title">
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowRule} aria-hidden />
            대학생의 다음 장을 위해
            <span className={styles.edition}>ARCH CAMPUS</span>
          </p>
          <h1 id="landing-title" className={styles.heroTitle}>
            <span>이번 학기,</span>
            <span className={styles.titleAccent}>좀 가볍게.</span>
          </h1>
          <p className={styles.heroDescription}>
            쌓인 PDF도, 다가오는 마감도.
            <br />
            일정부터 요약·문제·복습까지,
            <br className={styles.mobileBreak} /> 한곳에서 이어가세요.
          </p>
          <div className={styles.heroActions}>
            <Link href={startHref} className={styles.primaryLink}>
              {startLabel}
              <ArrowUpRight size={19} aria-hidden />
            </Link>
            <a href="#product" className={styles.textLink}>
              어떻게 달라질까요
              <ArrowDown size={16} aria-hidden />
            </a>
          </div>
          <p className={styles.heroFootnote}>
            <Check size={13} aria-hidden />
            베타 기간 무료 <span aria-hidden>·</span> 카드 등록 없이 시작
          </p>
        </div>
        <SemesterDemo />
      </div>
      <div className={styles.flowIndex}>
        <p className={styles.flowIndexIntro}>
          내 학기의 흐름을
          <br />
          바꾸는 작은 연결
        </p>
        {FLOWS.map((flow) => (
          <a href={flow.href} className={styles.flowIndexItem} key={flow.number}>
            <span className={styles.flowIndexNumber}>{flow.number}</span>
            <span>
              <span className={styles.flowIndexLabel}>{flow.title}</span>
              <strong>{flow.result}</strong>
            </span>
            <ArrowUpRight size={19} aria-hidden />
          </a>
        ))}
      </div>
    </section>
  );
}
