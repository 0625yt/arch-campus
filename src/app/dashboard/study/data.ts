/* mock 데이터 — 모든 Study 라우트가 공유 */

export const COURSE_COLOR = {
  운영체제: "#7aa6d6",
  자료구조: "#7fb38c",
  데이터베이스: "#cca06b",
  알고리즘: "#a08bc4",
} as const;

export type CourseSlug = keyof typeof COURSE_COLOR;

/** 자료 상세 풀 요약 — 노션 톤. 헤딩과 불릿 섞임 */
export type SummaryBlock =
  | { kind: "para"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "callout"; tone: "highlight" | "warn"; text: string };

export interface Material {
  id: string;
  title: string;
  pages: number;
  uploaded: string;
  problems: { total: number; done: number; correct: number };
  /** 자료 카드에 노출되는 한 줄 요약 (60~80자) */
  oneLine?: string;
  /** 자료 상세 페이지 풀 요약 — 단락·헤딩 구조 */
  summary?: SummaryBlock[];
  keywords?: string[];
  unit?: string;
}

export interface Course {
  slug: CourseSlug;
  professor: string;
  semester: string;
  materials: Material[];
  /** 이번 학기 핵심 키워드 — 빈도순. 강의 페이지 상단 노출 */
  keywords?: { name: string; count: number }[];
  /** 교수님이 자주 강조한 개념 Top — 강의 페이지 노출 */
  topConcepts?: { name: string; mentions: number; materials: number }[];
}

export const COURSES: Course[] = [
  {
    slug: "운영체제",
    professor: "김지훈 교수",
    semester: "2026 봄학기",
    keywords: [
      { name: "프로세스", count: 24 },
      { name: "교착 상태", count: 18 },
      { name: "세마포어", count: 16 },
      { name: "스케줄링", count: 14 },
      { name: "임계 구역", count: 12 },
      { name: "뮤텍스", count: 10 },
      { name: "페이지 교체", count: 9 },
      { name: "컨텍스트 스위칭", count: 8 },
      { name: "TLB", count: 6 },
      { name: "라운드 로빈", count: 5 },
    ],
    topConcepts: [
      { name: "교착 상태 4가지 필요조건", mentions: 7, materials: 2 },
      { name: "임계 구역 해법 (Peterson)", mentions: 5, materials: 1 },
      { name: "페이지 교체 알고리즘", mentions: 4, materials: 1 },
    ],
    materials: [
      {
        id: "process-sync",
        title: "5주차 — 프로세스 동기화",
        pages: 42,
        uploaded: "2시간 전",
        problems: { total: 12, done: 5, correct: 4 },
        oneLine: "임계 구역과 세마포어, 교착 상태 4가지 필요조건과 예방 전략",
        keywords: ["임계 구역", "세마포어", "교착 상태", "Peterson 알고리즘", "뮤텍스", "모니터"],
        unit: "프로세스 동기화",
        summary: [
          {
            kind: "para",
            text: "여러 프로세스가 공유 자원에 동시에 접근할 때 발생하는 문제와 해법을 다룬다. 임계 구역(Critical Section) 안에서는 한 번에 한 프로세스만 실행되도록 보장해야 한다는 게 핵심.",
          },
          { kind: "h2", text: "임계 구역 문제" },
          {
            kind: "para",
            text: "여러 프로세스가 공유 변수를 읽고 쓰는 코드 영역. 동시 접근을 막지 않으면 결과가 실행 순서에 따라 달라지는 경쟁 상태(race condition)가 발생한다. 해결의 3가지 조건은 상호 배제, 진행, 한정 대기.",
          },
          { kind: "h2", text: "Peterson 알고리즘" },
          {
            kind: "para",
            text: "두 프로세스 사이에서 SW만으로 임계 구역 문제를 푸는 가장 단순한 방법. flag와 turn 두 변수를 사용한다. 단점은 두 프로세스 가정 — 일반화하려면 베이커리 알고리즘 등으로 확장 필요.",
          },
          {
            kind: "callout",
            tone: "highlight",
            text: "교수님이 시험에 자주 내는 포인트 — Peterson은 \"왜 두 프로세스만 되는가\". 답: turn 변수가 단일 정수라서.",
          },
          { kind: "h2", text: "세마포어와 뮤텍스" },
          {
            kind: "bullets",
            items: [
              "세마포어 — 정수 카운터. wait/signal 연산. 자원이 N개일 때 일반화 가능",
              "이진 세마포어 ≈ 뮤텍스. 단 소유권 개념 차이 있음",
              "모니터 — 컴파일러 수준에서 캡슐화. Java synchronized가 그 예",
            ],
          },
          { kind: "h2", text: "교착 상태 (Deadlock)" },
          {
            kind: "para",
            text: "두 개 이상의 프로세스가 서로의 자원을 기다리며 모두 멈춘 상태. 발생하려면 4가지 조건이 모두 성립해야 한다.",
          },
          {
            kind: "bullets",
            items: [
              "상호 배제 — 자원을 한 번에 한 프로세스만 사용",
              "점유와 대기 — 자원 가진 채로 다른 자원 대기",
              "비선점 — 강제로 빼앗을 수 없음",
              "원형 대기 — 대기 그래프에 사이클 존재",
            ],
          },
          {
            kind: "callout",
            tone: "warn",
            text: "흔한 실수 — \"선점 가능\"이 4조건 중 하나라고 답하는 경우. 정답은 \"비선점\". 헷갈리지 말 것.",
          },
          { kind: "h2", text: "예방 전략" },
          {
            kind: "para",
            text: "4조건 중 하나라도 차단하면 교착 상태를 막을 수 있다. 자원 정렬·은행원 알고리즘 등이 실무에서 쓰이지만, 대부분의 OS는 검출 후 회복 방식을 선택한다 — 사전 예방의 비용이 너무 크기 때문.",
          },
        ],
      },
      {
        id: "memory",
        title: "4주차 — 메모리 관리",
        pages: 38,
        uploaded: "1주 전",
        problems: { total: 10, done: 10, correct: 8 },
        oneLine: "페이징·세그멘테이션과 가상 메모리, 페이지 교체 알고리즘 비교",
        keywords: ["페이징", "세그멘테이션", "가상 메모리", "TLB", "페이지 폴트", "LRU"],
        unit: "메모리 관리",
        summary: [
          {
            kind: "para",
            text: "물리 메모리는 한정돼있는데 프로세스는 그보다 큰 주소 공간이 필요하다. 이 간극을 메우는 게 가상 메모리. 운영체제와 MMU가 함께 주소 변환과 페이지 교체를 담당한다.",
          },
          { kind: "h2", text: "페이징 vs 세그멘테이션" },
          {
            kind: "bullets",
            items: [
              "페이징 — 고정 크기 블록(페이지). 외부 단편화 없음, 내부 단편화 있음",
              "세그멘테이션 — 논리 단위(코드/데이터/스택)로 분할. 외부 단편화 발생",
              "현대 시스템은 둘을 결합 (Linux는 페이징 중심)",
            ],
          },
          { kind: "h2", text: "TLB (Translation Lookaside Buffer)" },
          {
            kind: "para",
            text: "페이지 테이블 검색은 매번 메모리 접근이 필요하다. TLB는 최근 변환 결과를 캐싱해서 이를 1~2 사이클로 줄인다. 컨텍스트 스위치 시 TLB 플러시 비용이 큼.",
          },
          { kind: "h2", text: "페이지 교체 알고리즘" },
          {
            kind: "bullets",
            items: [
              "FIFO — 단순. Belady 이상현상(프레임 늘려도 페이지 폴트 늘 수 있음)",
              "LRU — 가장 오래 안 쓴 페이지 교체. 구현 비용 큼",
              "Clock — LRU 근사. 실무에서 많이 쓰임",
              "Optimal — 미래를 아는 가정. 비교용 이론값",
            ],
          },
          {
            kind: "callout",
            tone: "highlight",
            text: "시험 단골 — Belady 이상현상은 FIFO에만 발생, LRU에는 발생하지 않는다.",
          },
        ],
      },
      {
        id: "scheduling",
        title: "3주차 — 프로세스 스케줄링",
        pages: 30,
        uploaded: "2주 전",
        problems: { total: 8, done: 8, correct: 7 },
        oneLine: "FCFS·SJF·라운드 로빈 비교, 컨텍스트 스위칭 비용",
        keywords: ["FCFS", "SJF", "라운드 로빈", "우선순위", "컨텍스트 스위칭"],
        unit: "프로세스 스케줄링",
        summary: [
          {
            kind: "para",
            text: "CPU는 한 번에 한 프로세스만 실행한다. 어떤 프로세스에게 CPU를 줄지 정하는 게 스케줄링. 평균 대기 시간·응답 시간·처리량이 평가 지표.",
          },
          { kind: "h2", text: "주요 알고리즘" },
          {
            kind: "bullets",
            items: [
              "FCFS — 도착 순서. 단순하지만 호위 효과(convoy effect) 발생",
              "SJF — 짧은 작업 우선. 평균 대기 시간 최적이나 기아 발생 가능",
              "라운드 로빈 — 시간 할당량(quantum) 단위 순환. 응답성 좋음",
              "우선순위 — 높은 우선순위 우선. 에이징으로 기아 방지",
            ],
          },
          {
            kind: "callout",
            tone: "highlight",
            text: "시험에 자주 나오는 계산 — 간트 차트 그려서 평균 대기 시간 구하기. 도착 시간 다른 경우 주의.",
          },
        ],
      },
    ],
  },
  {
    slug: "자료구조",
    professor: "박서연 교수",
    semester: "2026 봄학기",
    keywords: [
      { name: "이진 트리", count: 22 },
      { name: "균형", count: 15 },
      { name: "AVL", count: 12 },
      { name: "Red-Black", count: 11 },
      { name: "회전", count: 10 },
      { name: "BST", count: 9 },
      { name: "순회", count: 7 },
      { name: "B-Tree", count: 5 },
    ],
    topConcepts: [
      { name: "AVL 회전 4가지 (LL/LR/RR/RL)", mentions: 6, materials: 2 },
      { name: "Red-Black 5가지 속성", mentions: 5, materials: 1 },
    ],
    materials: [
      {
        id: "bst",
        title: "4주차 — 이진 탐색 트리",
        pages: 28,
        uploaded: "어제",
        problems: { total: 10, done: 10, correct: 9 },
        oneLine: "BST 삽입·삭제·탐색과 최악 시간 복잡도, 순회 3종 비교",
        keywords: ["BST", "삽입", "삭제", "전위·중위·후위 순회", "균형"],
        unit: "BST",
        summary: [
          {
            kind: "para",
            text: "왼쪽 서브트리의 모든 키 < 루트 < 오른쪽 서브트리의 모든 키. 이 단순한 규칙이 평균 O(log n) 탐색을 가능하게 한다. 단 데이터가 정렬돼서 들어오면 한쪽으로 치우쳐 O(n)이 된다.",
          },
          { kind: "h2", text: "기본 연산" },
          {
            kind: "bullets",
            items: [
              "탐색 — 루트와 비교 후 좌/우 재귀",
              "삽입 — 탐색 후 빈 자리에 추가",
              "삭제 — 3가지 경우(자식 0/1/2). 자식 2개면 후속자(successor)로 대체",
            ],
          },
          { kind: "h2", text: "순회" },
          {
            kind: "para",
            text: "전위(루트→좌→우), 중위(좌→루트→우), 후위(좌→우→루트). BST의 중위 순회는 정렬된 결과를 준다 — 이게 BST의 핵심 가치 중 하나.",
          },
          {
            kind: "callout",
            tone: "warn",
            text: "최악 시간 복잡도가 O(n)이라는 게 BST의 한계. 그래서 5장에서 균형 트리(AVL, Red-Black)로 넘어간다.",
          },
        ],
      },
      {
        id: "balanced",
        title: "5장 — 균형 트리",
        pages: 35,
        uploaded: "3일 전",
        problems: { total: 0, done: 0, correct: 0 },
        oneLine: "AVL과 Red-Black 트리 비교, 회전 연산과 실무 선택 기준",
        keywords: ["AVL", "Red-Black", "회전", "Balance Factor", "B-Tree"],
        unit: "균형 트리",
        summary: [
          {
            kind: "para",
            text: "BST의 최악 O(n) 문제를 해결하기 위해 트리 모양을 강제로 균형 잡힌 상태로 유지하는 자료구조. 삽입·삭제 시마다 회전 연산으로 보정한다.",
          },
          { kind: "h2", text: "AVL 트리" },
          {
            kind: "para",
            text: "Balance Factor = 왼쪽 높이 - 오른쪽 높이. 모든 노드에서 |BF| ≤ 1을 유지. 깨지면 회전으로 복원한다.",
          },
          {
            kind: "bullets",
            items: [
              "LL 회전 — 왼쪽-왼쪽 무거움. 우회전 1번",
              "RR 회전 — 오른쪽-오른쪽. 좌회전 1번",
              "LR 회전 — 왼쪽-오른쪽. 좌회전 → 우회전",
              "RL 회전 — 오른쪽-왼쪽. 우회전 → 좌회전",
            ],
          },
          { kind: "h2", text: "Red-Black 트리" },
          {
            kind: "para",
            text: "AVL보다 균형이 느슨하지만 회전 횟수가 적다. 5가지 속성으로 정의되며, 실무 표준 (Linux CFS 스케줄러, C++ map, Java TreeMap).",
          },
          {
            kind: "callout",
            tone: "highlight",
            text: "AVL vs Red-Black 선택 기준 — 탐색 빈도가 높으면 AVL(더 균형), 삽입·삭제가 많으면 Red-Black(회전 적음).",
          },
        ],
      },
    ],
  },
  {
    slug: "데이터베이스",
    professor: "이민호 교수",
    semester: "2026 봄학기",
    keywords: [
      { name: "정규화", count: 18 },
      { name: "함수 종속", count: 14 },
      { name: "BCNF", count: 9 },
      { name: "조인", count: 8 },
      { name: "후보키", count: 7 },
      { name: "트랜잭션", count: 5 },
    ],
    topConcepts: [
      { name: "1NF → 3NF 변환 절차", mentions: 4, materials: 1 },
      { name: "BCNF와 3NF 차이", mentions: 3, materials: 1 },
    ],
    materials: [
      {
        id: "norm",
        title: "정규화 1~3NF",
        pages: 35,
        uploaded: "3일 전",
        problems: { total: 8, done: 3, correct: 2 },
        oneLine: "함수 종속 → 1NF → 2NF → 3NF 단계별 변환과 BCNF 판별",
        keywords: ["함수 종속", "1NF", "2NF", "3NF", "BCNF", "후보키"],
        unit: "정규화",
        summary: [
          {
            kind: "para",
            text: "데이터 중복과 이상 현상(삽입·삭제·갱신)을 줄이기 위해 릴레이션을 단계적으로 분해하는 절차. 각 단계는 이전 단계를 만족해야 한다.",
          },
          { kind: "h2", text: "함수 종속 (Functional Dependency)" },
          {
            kind: "para",
            text: "X → Y는 \"X가 같으면 Y도 같다\"는 의미. 후보키와 비키 속성 간의 관계를 정의하는 핵심 개념. 정규화는 결국 함수 종속을 깔끔하게 정리하는 작업이다.",
          },
          { kind: "h2", text: "1NF → 2NF → 3NF" },
          {
            kind: "bullets",
            items: [
              "1NF — 모든 속성이 원자값(atomic). 다중값·중첩 X",
              "2NF — 1NF + 부분 함수 종속 제거. 후보키의 일부에만 의존하는 비키 속성 분리",
              "3NF — 2NF + 이행적 함수 종속 제거. 비키 → 비키 의존 X",
            ],
          },
          {
            kind: "callout",
            tone: "warn",
            text: "헷갈리기 쉬운 부분 — 2NF는 \"복합키\"가 있을 때만 의미가 있다. 단일키면 자동으로 2NF.",
          },
          { kind: "h2", text: "BCNF" },
          {
            kind: "para",
            text: "3NF의 강화 버전. 모든 결정자가 후보키여야 한다. 3NF는 만족하지만 BCNF는 위반하는 경우가 시험에 자주 나옴.",
          },
          {
            kind: "callout",
            tone: "highlight",
            text: "교수님 강조 포인트 — 정규화를 너무 많이 하면 조인이 늘어나 성능 저하. 실무는 3NF에서 멈추거나 의도적 비정규화를 한다.",
          },
        ],
      },
    ],
  },
  {
    slug: "알고리즘",
    professor: "최도현 교수",
    semester: "2026 봄학기",
    keywords: [
      { name: "DP", count: 16 },
      { name: "메모이제이션", count: 12 },
      { name: "최적 부분 구조", count: 10 },
      { name: "점화식", count: 9 },
      { name: "탑다운", count: 7 },
      { name: "바텀업", count: 7 },
    ],
    topConcepts: [
      { name: "점화식 세우기 패턴", mentions: 5, materials: 1 },
      { name: "메모이제이션 vs 타뷸레이션", mentions: 3, materials: 1 },
    ],
    materials: [
      {
        id: "dp",
        title: "동적 계획법 입문",
        pages: 22,
        uploaded: "1주 전",
        problems: { total: 14, done: 0, correct: 0 },
        oneLine: "최적 부분 구조 판별, 점화식 세우기, 탑다운·바텀업 구현 비교",
        keywords: ["DP", "메모이제이션", "타뷸레이션", "점화식", "최적 부분 구조"],
        unit: "DP",
        summary: [
          {
            kind: "para",
            text: "큰 문제를 작은 부분 문제로 나누어 풀고, 그 결과를 저장해 재사용하는 기법. 분할 정복과 다른 점은 \"부분 문제가 겹친다(overlapping)\"는 점.",
          },
          { kind: "h2", text: "DP가 가능한 조건" },
          {
            kind: "bullets",
            items: [
              "최적 부분 구조 — 부분 문제의 최적해가 전체 최적해를 구성",
              "중복 부분 문제 — 같은 부분 문제가 여러 번 나타남",
            ],
          },
          { kind: "h2", text: "두 가지 구현 방식" },
          {
            kind: "bullets",
            items: [
              "탑다운(메모이제이션) — 재귀 + 캐시. 직관적, 함수 호출 오버헤드",
              "바텀업(타뷸레이션) — 반복문 + 배열. 빠르고 메모리 효율적",
            ],
          },
          {
            kind: "callout",
            tone: "highlight",
            text: "점화식이 핵심. 점화식만 정확히 세우면 코드는 거의 자동으로 따라온다.",
          },
          {
            kind: "callout",
            tone: "warn",
            text: "흔한 실수 — 그리디로 풀 수 있는 걸 DP로 풀거나, 그 반대. 최적 부분 구조 + 중복 부분 문제 둘 다 확인할 것.",
          },
        ],
      },
    ],
  },
];

export function getCourse(slug: string): Course | undefined {
  return COURSES.find((c) => c.slug === slug);
}

/**
 * 강의에서 "이어서 보기" 자료 반환.
 * 우선순위: 풀이 미완료(done<total) → 가장 최근 업로드 → 첫 자료
 */
export function getResumeMaterial(slug: string): Material | undefined {
  const course = getCourse(slug);
  if (!course || course.materials.length === 0) return undefined;
  const inProgress = course.materials.find(
    (m) => m.problems.total > 0 && m.problems.done < m.problems.total,
  );
  return inProgress ?? course.materials[0];
}

export function getMaterial(
  courseSlug: string,
  materialId: string,
): { course: Course; material: Material } | undefined {
  const course = getCourse(courseSlug);
  if (!course) return undefined;
  const material = course.materials.find((m) => m.id === materialId);
  if (!material) return undefined;
  return { course, material };
}
