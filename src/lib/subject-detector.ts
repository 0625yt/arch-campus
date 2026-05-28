/**
 * 강의명·과목명·자료 제목·classification.domain에서 학문 영역을 자동 분류.
 *
 * 왜:
 *   - 같은 "lecture" 자료라도 수학은 공식·증명 중심, 영어는 어휘·문법 중심이어야 학생에게 가치 있음
 *   - subject-playbook이 영역별 디테일 사전을 들고 있고, 이 detector가 어느 사전을 열지 결정
 *
 * 룰:
 *   1) classification.domain (이미 Haiku 1차 분류기가 뽑음) — 신뢰도 최상. 있으면 그것만 봄
 *   2) 강의명(courseName) 토큰 매칭
 *   3) 자료 제목(materialTitle) 토큰 매칭
 *   4) 다 실패하면 "default"
 *
 * 영역 종류 (10개): english, japanese, chinese, math, physics, chemistry,
 *   biology, cs, humanities, default.
 *
 * 추가 입력은 별도 PR에서 (예: 사용자가 수동 override).
 */

export type SubjectArea =
  | "english"
  | "japanese"
  | "chinese"
  | "math"
  | "physics"
  | "chemistry"
  | "biology"
  | "cs"
  | "humanities"
  | "default";

interface DetectInput {
  /** Haiku 1차 분류기의 결과 domain. "STEM", "인문학", "외국어" 등 자유 문자열. */
  classificationDomain?: string | null;
  courseName?: string | null;
  materialTitle?: string | null;
}

/**
 * 영역별 토큰 사전 — 한국어·영어 변형 다 포함. 부분 일치(includes).
 *
 * 우선순위 중요: 위에 있는 영역이 먼저 매치되면 그 영역으로 확정. 그래서
 * "영문학"(영어 + 인문)은 "humanities"가 먼저 와야 인문으로 분류됨 (literature 톤).
 */
const TOKEN_MAP: Array<{ area: SubjectArea; tokens: string[] }> = [
  // 인문학·사회과학을 먼저 — "영문학 개론"이 영어로 잘못 가지 않도록
  {
    area: "humanities",
    tokens: [
      "영문학",
      "국문학",
      "문학",
      "literature",
      "역사",
      "history",
      "철학",
      "philosophy",
      "심리",
      "psychology",
      "사회",
      "sociology",
      "경제",
      "economics",
      "economy",
      "경영",
      "business",
      "마케팅",
      "marketing",
      "정치",
      "politics",
      "법",
      "law",
      "행정",
      "교육",
      "education",
      "인류",
      "anthropology",
    ],
  },
  // 컴공 — "프로그래밍 언어론"처럼 인문 같지 않게 정확히
  {
    area: "cs",
    tokens: [
      "컴퓨터",
      "computer",
      "프로그래밍",
      "programming",
      "코딩",
      "coding",
      "알고리즘",
      "algorithm",
      "자료구조",
      "data structure",
      "데이터베이스",
      "database",
      "소프트웨어",
      "software",
      "네트워크",
      "network",
      "운영체제",
      "operating system",
      "os",
      "인공지능",
      "ai",
      "머신러닝",
      "machine learning",
      "딥러닝",
      "deep learning",
      "웹 개발",
      "frontend",
      "backend",
      "react",
      "javascript",
      "python",
    ],
  },
  // STEM 4종
  {
    area: "math",
    tokens: [
      "수학",
      "math",
      "calculus",
      "미적분",
      "미분",
      "적분",
      "선형대수",
      "linear algebra",
      "확률",
      "probability",
      "통계",
      "statistics",
      "이산수학",
      "discrete math",
      "기하",
      "geometry",
      "수론",
      "number theory",
    ],
  },
  {
    area: "physics",
    tokens: [
      "물리",
      "physics",
      "역학",
      "mechanics",
      "전자기",
      "electromagnetism",
      "양자",
      "quantum",
      "상대성",
      "relativity",
      "열역학",
      "thermodynamics",
    ],
  },
  {
    area: "chemistry",
    tokens: [
      "화학",
      "chemistry",
      "유기화학",
      "organic chemistry",
      "무기화학",
      "inorganic",
      "분석화학",
      "analytical",
      "물리화학",
      "physical chemistry",
      "생화학",
      "biochemistry",
    ],
  },
  {
    area: "biology",
    tokens: [
      "생물",
      "biology",
      "생명과학",
      "life science",
      "유전",
      "genetics",
      "세포",
      "cell biology",
      "분자생물학",
      "molecular biology",
      "해부",
      "anatomy",
      "생리",
      "physiology",
      "미생물",
      "microbiology",
      "생태",
      "ecology",
    ],
  },
  // 외국어 — 인문보다 뒤에 배치 (영문학은 인문)
  {
    area: "english",
    tokens: [
      "영어",
      "english",
      "글로컬",
      "reading",
      "writing",
      "grammar",
      "회화",
      "speaking",
      "tofel",
      "toefl",
      "toeic",
      "ielts",
      "오픽",
      "opic",
    ],
  },
  {
    area: "japanese",
    tokens: ["일본어", "japanese", "jlpt", "일본문화"],
  },
  {
    area: "chinese",
    tokens: ["중국어", "chinese", "hsk", "중국문화"],
  },
];

/**
 * classification.domain 우선 매핑 — Haiku 1차 분류기 결과를 우리 영역으로 변환.
 * 1차 분류기는 자유 문자열이라 한국어/영어/대소문자 변형 다 받음.
 */
function fromClassificationDomain(domain: string): SubjectArea | null {
  const d = domain.toLowerCase().trim();
  if (!d) return null;
  if (d.includes("수학") || d.includes("math")) return "math";
  if (d.includes("물리") || d.includes("physics")) return "physics";
  if (d.includes("화학") || d.includes("chem")) return "chemistry";
  if (d.includes("생물") || d.includes("biology") || d.includes("life")) return "biology";
  if (
    d.includes("컴퓨터") ||
    d.includes("computer") ||
    d.includes("코딩") ||
    d.includes("cs") ||
    d.includes("프로그래밍")
  )
    return "cs";
  if (d.includes("일본") || d.includes("japanese")) return "japanese";
  if (d.includes("중국") || d.includes("chinese")) return "chinese";
  if (d.includes("영어") && !d.includes("영문학")) return "english";
  if (
    d.includes("인문") ||
    d.includes("humanit") ||
    d.includes("사회") ||
    d.includes("social") ||
    d.includes("경제") ||
    d.includes("경영") ||
    d.includes("역사") ||
    d.includes("법")
  )
    return "humanities";
  return null;
}

function matchTokens(text: string): SubjectArea | null {
  const lower = text.toLowerCase();
  for (const { area, tokens } of TOKEN_MAP) {
    for (const tok of tokens) {
      if (lower.includes(tok.toLowerCase())) return area;
    }
  }
  return null;
}

export function detectSubject(input: DetectInput): SubjectArea {
  // 1순위: Haiku 분류기 결과
  if (input.classificationDomain) {
    const fromDomain = fromClassificationDomain(input.classificationDomain);
    if (fromDomain) return fromDomain;
  }
  // 2순위: 강의명
  if (input.courseName) {
    const fromCourse = matchTokens(input.courseName);
    if (fromCourse) return fromCourse;
  }
  // 3순위: 자료 제목
  if (input.materialTitle) {
    const fromMaterial = matchTokens(input.materialTitle);
    if (fromMaterial) return fromMaterial;
  }
  return "default";
}

/**
 * UI 라벨 — 영역 코드를 한국어로 보여줘야 할 때 (디버깅·subject override UI 등).
 */
export const SUBJECT_LABEL: Record<SubjectArea, string> = {
  english: "영어",
  japanese: "일본어",
  chinese: "중국어",
  math: "수학",
  physics: "물리",
  chemistry: "화학",
  biology: "생물",
  cs: "컴퓨터과학",
  humanities: "인문·사회",
  default: "기본",
};
