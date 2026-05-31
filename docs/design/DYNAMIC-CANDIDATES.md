# 다이내믹 애니메이션·디자인 후보 (대기 목록)

> 2026-05-31. 지금 적용 X — 우선순위 결정 후 일괄 적용. 사용자 결정 대기.
> 적용 시 DESIGN.md §10 (AI 티 패턴 절대 금지) 위반 안 하게 — generic Material/shadcn 톤이나 과한 spring·bounce는 피한다. Apple/Linear 톤 유지.

## 1. 자료 상세 페이지 (가장 자주 보이는 화면)

### 1-1. 요약 블록 상승 시퀀스 강화
- **현재**: `fade-up`·`fade-up-2`·`fade-up-3`로 4단계 staggered fade. 60~310ms delay.
- **개선**: 요약 본문 안의 `<h3>` 단원 헤더 + 그 아래 `<p>`/`<ul>` 묶음을 **묶음 단위로 80ms씩 stagger**. 요약 다 읽기 전에 다음 단원이 나타나 시각적으로 흐름이 보임.
- **구현 위치**: [src/app/dashboard/study/[course]/[material]/summary-column.tsx](src/app/dashboard/study/[course]/[material]/summary-column.tsx), [page.tsx](src/app/dashboard/study/[course]/[material]/page.tsx) SummaryArticle.
- **비용**: CSS only (IntersectionObserver로 viewport 진입 시 트리거). 한 번만 발화.

### 1-2. "PDF로 저장" 버튼 인터랙션
- **현재**: hover 색만 바뀜.
- **개선**: 다운로드 아이콘이 hover 시 살짝 아래로 0.5초 bounce (translateY 2px), 클릭 시 인쇄 다이얼로그 뜨기 전에 버튼 자체에 "찰칵" 펄스(scale 0.95 → 1, 120ms).
- **구현 위치**: [src/app/dashboard/study/[course]/[material]/download-summary-button.tsx](src/app/dashboard/study/[course]/[material]/download-summary-button.tsx).

### 1-3. "다시 요약" 패널 — 입력 시 라이브 카운터
- **현재**: 카운터(`{trimmed.length}/120`)가 정적. 입력 시 그냥 숫자 갱신.
- **개선**: 80자 넘어가면 카운터 색을 muted → action(주황 톤), 110자 넘으면 urgent로 점진 변화. 카운터에 살짝 scale 펄스(102%, 200ms).
- **구현 위치**: [src/app/dashboard/study/[course]/[material]/resummarize-panel.tsx](src/app/dashboard/study/[course]/[material]/resummarize-panel.tsx).

### 1-4. 자료 제목 — 첫 진입 시 글자 단위 fade
- **현재**: 제목 한 줄이 통째로 fade-up-2.
- **개선**: 제목을 글자 단위로 쪼개 30ms씩 stagger. Apple TV+ intro 톤 (과한 spring X, 부드러운 ease-out).
- **구현 위치**: [page.tsx Hero](src/app/dashboard/study/[course]/[material]/page.tsx).
- **주의**: 자료 제목이 길면 stagger가 길어져 어색. 30자 이상이면 비활성.

## 2. 글로벌 (탑바·홈 등)

### 2-1. SegmentedNav 활성 indicator 슬라이드
- **현재**: 활성 항목이 흰 캡슐 + 그림자. 페이지 이동 시 그냥 클래스만 갱신 — 새 캡슐이 "팟" 하고 나타남.
- **개선**: 활성 캡슐을 absolute로 띄우고 framer-motion 없이 CSS transform로 슬라이드 (Linear 톤). pathname 변경 시 새 항목 위치로 200ms cubic-bezier 이동.
- **구현 위치**: [src/components/global-topbar.tsx SegmentedNav](src/components/global-topbar.tsx).
- **주의**: SSR 시 위치 계산 X — 첫 마운트 시 즉시 위치 잡고 그 뒤 transition 활성.

### 2-2. 학기·주차 chip 도트 펄스
- **현재**: 도트가 정적. `boxShadow: "0 0 6px ..."`만.
- **개선**: 도트가 천천히 호흡 (1.8초 ease-in-out infinite, opacity 0.7↔1). globals.css에 이미 `time-bar-pulse` 있어 재사용 가능.
- **구현 위치**: [global-topbar.tsx SemesterChip](src/components/global-topbar.tsx).

### 2-3. ProfileMenu 드롭다운 진입
- **현재**: `animation: scale-in 160ms ease-out`. 그대로 OK.
- **개선 후보**: 메뉴 안 항목들이 진입 후 10ms씩 stagger(이미 sheet-stagger 패턴 있음). 4개 항목이라 별로 차이 없을 수도.

## 3. 학습 흐름

### 3-1. 퀴즈 정답·오답 피드백
- **현재 확인 필요**: quiz-solver.tsx 동작 톤. 정답 시 carrot/박수 같은 generic은 절대 X (DESIGN.md §10 위반).
- **개선 방향**: 정답 시 카드 테두리만 살짝 action 색으로 200ms 깜빡, 오답은 urgent 색. 흔들림·이모지 X.

### 3-2. 자료 업로드 진행
- **현재**: 스피너 + "N개 중 K번째 올리는 중…" 텍스트.
- **개선**: 파일별 진행을 작은 가로 막대로 시각화 (Linear의 sync indicator 톤). 업로드 완료된 파일은 ✓ 변하며 옅어짐.
- **구현 위치**: [src/app/dashboard/study/[course]/upload-zone.tsx](src/app/dashboard/study/[course]/upload-zone.tsx).

## 4. 우선순위 (사용자 결정 대기)

| 항목 | 빈도 | 영향 | 작업량 | 추천 |
|---|---|---|---|---|
| 2-1 SegmentedNav slide | 매 페이지 | 높음 (글로벌) | 중 (2~3h) | ★ 1순위 |
| 1-1 요약 stagger | 자료 열 때마다 | 중 | 소 (1h) | ★ 2순위 |
| 1-2 PDF 버튼 인터랙션 | 다운로드 시 | 작음 | 소 (30m) | 3순위 |
| 2-2 학기 도트 펄스 | 매 페이지 | 작음 | 소 (10m) | 무난 |
| 3-1 퀴즈 피드백 | 학습 흐름 | 중 | 중 | 별도 (DESIGN 검토 필요) |
| 1-3 카운터 색 변화 | 재요청 시 | 작음 | 소 | 무난 |
| 1-4 글자 단위 fade | 첫 진입 1회 | 작음 | 중 | 우선순위 낮음 |

## 5. 적용 시 가드

- DESIGN.md §10 (AI 티 패턴) 다시 읽고 적용
- bounce·spring 과하면 안 됨 — Apple/Linear 톤은 ease-out + 200~300ms 범위
- IntersectionObserver/CSS only 우선 — JS 애니 라이브러리(framer-motion) 도입 보류 (번들 크기)
- 모바일에서도 동작 확인 (CLAUDE.md §1 반응형 1급)
