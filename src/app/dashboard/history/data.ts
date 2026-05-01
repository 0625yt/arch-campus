/* mock — 활동 히스토리 통합 */

export type ActivityKind = "문제" | "위저드" | "자료" | "오답";

export interface Activity {
  id: string;
  kind: ActivityKind;
  course?: string;
  title: string;
  meta?: string;
  href: string;
  at: Date;
  /** 정답/오답 등 결과 — 옵션 */
  result?: { label: string; tone: "good" | "bad" | "neutral" };
}

function ago(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

export const ACTIVITIES: Activity[] = [
  {
    id: "a1",
    kind: "문제",
    course: "운영체제",
    title: "프로세스 동기화 · 문제 5",
    meta: "객관식 · 보통",
    href: "/dashboard/study/운영체제/process-sync",
    at: ago(35),
    result: { label: "맞음", tone: "good" },
  },
  {
    id: "a2",
    kind: "문제",
    course: "운영체제",
    title: "프로세스 동기화 · 문제 6",
    meta: "객관식 · 보통",
    href: "/dashboard/study/운영체제/process-sync",
    at: ago(42),
    result: { label: "틀림 · 교착 상태", tone: "bad" },
  },
  {
    id: "a3",
    kind: "위저드",
    course: "데이터베이스",
    title: "발표자료 구조화 — 정규화 사례 분석",
    meta: "10분 · 같은 과 학생",
    href: "/dashboard/tools/presentation",
    at: ago(180),
    result: { label: "5장 슬라이드", tone: "neutral" },
  },
  {
    id: "a4",
    kind: "자료",
    course: "운영체제",
    title: "5주차 — 프로세스 동기화",
    meta: "42p · 요약 + 키워드 4개",
    href: "/dashboard/study/운영체제/process-sync",
    at: ago(240),
  },
  {
    id: "a5",
    kind: "문제",
    course: "자료구조",
    title: "이진 탐색 트리 · 문제 10",
    meta: "서술형 · 어려움",
    href: "/dashboard/study/자료구조/bst",
    at: ago(60 * 22),
    result: { label: "맞음", tone: "good" },
  },
  {
    id: "a6",
    kind: "오답",
    course: "데이터베이스",
    title: "정규화 1~3NF · 문제 3",
    meta: "BCNF로 가야 함",
    href: "/dashboard/study/데이터베이스/norm",
    at: ago(60 * 26),
    result: { label: "재시도 필요", tone: "bad" },
  },
  {
    id: "a7",
    kind: "위저드",
    course: "알고리즘",
    title: "벼락치기 학습 계획 — 동적 계획법",
    meta: "3시간 시나리오",
    href: "/dashboard/tools",
    at: ago(60 * 50),
    result: { label: "30분 · 1시간 · 3시간", tone: "neutral" },
  },
  {
    id: "a8",
    kind: "자료",
    course: "자료구조",
    title: "5장 — 균형 트리",
    meta: "35p · 업로드만",
    href: "/dashboard/study/자료구조/balanced",
    at: ago(60 * 72),
  },
  {
    id: "a9",
    kind: "문제",
    course: "운영체제",
    title: "메모리 관리 · 문제 8",
    meta: "객관식 · 보통",
    href: "/dashboard/study/운영체제/memory",
    at: ago(60 * 24 * 7),
    result: { label: "맞음", tone: "good" },
  },
  {
    id: "a10",
    kind: "위저드",
    course: "운영체제",
    title: "기출형 문제 생성 — 메모리 관리",
    meta: "객관식 10문제 · 보통",
    href: "/dashboard/study/운영체제/memory",
    at: ago(60 * 24 * 8),
    result: { label: "10문제 생성", tone: "neutral" },
  },
  {
    id: "a11",
    kind: "자료",
    course: "데이터베이스",
    title: "정규화 1~3NF",
    meta: "35p",
    href: "/dashboard/study/데이터베이스/norm",
    at: ago(60 * 24 * 14),
  },
  {
    id: "a12",
    kind: "위저드",
    course: "자료구조",
    title: "리포트 구조 설계 — 트리 자료구조 비교",
    meta: "6섹션 · 1500자",
    href: "/dashboard/tools",
    at: ago(60 * 24 * 21),
    result: { label: "목차 + 가이드", tone: "neutral" },
  },
];

/* ─────────── 활동 통계 (mock) ─────────── */

export interface WeekStats {
  streak: number;
  problemsSolved: number;
  accuracy: number; // 0~1
  hours: number;
  /** 최근 14일 — 각 칸 = 한 날의 활동 양 (0~4 단계) */
  contributions: number[];
}

export const WEEK: WeekStats = {
  streak: 5,
  problemsSolved: 18,
  accuracy: 0.78,
  hours: 6.5,
  contributions: [2, 0, 1, 3, 2, 4, 3, 1, 0, 2, 4, 3, 2, 4],
};
