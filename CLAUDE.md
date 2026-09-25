# CLAUDE.md

> **2026-09-17 구현 기준:** 실제 구조·진행 상태는 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/STATUS.md](docs/STATUS.md), [점검 보고서](docs/audit/2026-09-17-feature-audit.md)를 우선 확인한다. 모델 라우팅은 `getModelIdFor()`/`resolveModel()`가 단일 출처이며 `TOOL_MODEL`만으로 판단하지 않는다. 문서의 과거 모델·버전·가격은 lockfile과 공식 자료를 재확인한다.

이 파일은 Claude Code가 이 저장소에서 코드를 작성할 때 따르는 **행동 규칙**입니다.
규칙 외 정보는 별도 문서로 분리:

- **현재 무엇이 살아있는지 / 미구현인지** → [docs/STATUS.md](docs/STATUS.md)
- **새 도구 만들 때 따를 청사진 (4-Layer, RLS, 검증, 파이프라인)** → [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **컨벤션 + Karpathy 4원칙** → [docs/CONVENTIONS.md](docs/CONVENTIONS.md)
- **제품 정체성·MVP 범위·로드맵·KPI** → [docs/PRODUCT.md](docs/PRODUCT.md)
- **디자인 가이드** → [docs/design/DESIGN.md](docs/design/DESIGN.md) — 특히 §10 절대 금지 (AI 티 패턴: 좌측 동그라미 점·마침표 카피 남발·generic shadcn 모달)
- **도입 보류 외부 자료** → [docs/REFERENCES.md](docs/REFERENCES.md)
- **코드 리뷰 서브에이전트**: `Agent` 툴에 `subagent_type: "code-reviewer"`

---

## 0. 방향성 가드 (코딩 시작 전 항상)

새 기능 요청을 받으면:

1. [docs/PRODUCT.md](docs/PRODUCT.md) §2 (MVP 범위) 확인
2. **§2-2 명시적 제외** (자격증·팀플·취업·HWP 등)이면 → 즉시 코딩 X. "Phase 2/3 범위인데 지금 추가할까요?" 묻기
3. 범위 의심되면 §2-3의 4문항 자가검증

방향 모를 때 멈추고 묻는다. **5초 확인 < 5시간 복구.**

---

## 1. 스택 & 모델 라우팅 (★ 비용 통제)

- **Next.js 16.2.4 + React 19.2.4 (App Router)** — breaking change 큼. 라우팅·서버 컴포넌트·캐싱 코드 작성 전에 `node_modules/next/dist/docs/` 먼저 읽는다.
- **Tailwind v4** (`@tailwindcss/postcss`) — 외부 폰트(Pretendard CDN)는 `@import "tailwindcss"` 앞에 와야 함.
- **AI SDK** — Vercel AI SDK v6 (`ai`) + `@ai-sdk/anthropic` + `@ai-sdk/google` SDK **직접 사용**. AI Gateway는 보류(카드·크레딧 필요). 인증: `ANTHROPIC_API_KEY`(필수) + `GOOGLE_GENERATIVE_AI_API_KEY`(vendor 플래그 켤 때). prompt caching(`cache_control: { type: "ephemeral", ttl: "1h" }`)은 Anthropic에서만 의미. 새 도구는 [src/lib/claude.ts](src/lib/claude.ts) 패턴 복제.
- **모델 라우팅** (★ 비용 통제, 2026-07-24 전면 Gemini 전환) — 라우팅은 `resolveModel()`. **전체 표·실측 A/B 근거는 [docs/COST.md](docs/COST.md)가 단일 출처.** 모든 도구가 Gemini(Claude는 env 원복용으로만 남김). 아래는 env override 없는 기본값.
  - **Gemini 3.5 Flash-Lite** (`gemini-3.5-flash-lite`, $0.30/$2.50) — 대부분: **quiz** · summarize · **chat**(자료RAG) · chat-free · exam-extract · **exam-solve** · **report-structure** · **quiz-grade** · **quiz-verify** · event-parse · pdf-ocr. 실측으로 판정·풀이·요약·챗 다 통과(COST §9). quiz는 강화 파이프라인(verbatim + evidence검증 + **의미 dedup** + 스마트 topup + 2차 검수)이 전제 — 빼면 안 됨.
  - **Gemini 3.6 Flash** (`gemini-3.6-flash`, $1.50/$7.50) — 위저드: presentation · wizard-assignment/exam/cram. Flash-Lite는 발표 슬라이드 감각 약해 탈락 → 상위 Flash.
  - **Gemini 3.1 Pro** (`gemini-3.1-pro-preview`, $2/$12, **thinking budget 512**) — Vision: syllabus-extract · timetable-extract. 실측 시간표 요일 9/9(Flash-Lite 오추출). thinking 낮춰 정확도 유지 + 5.6배 빠름. **3.x Pro는 thinking 0 거부** → `callProviderOptions`가 512로 자동 설정.
  - **모델 추가 시 3곳 동기화 필수**: `modelTier`(tier 분류) + `PRICING`(단가) + `estimateCost`(분기). 하나라도 빠지면 비용 집계 틀어짐.
  - 도구별 env 원복 안전판(전부 Gemini→Claude): `QUIZ_MODEL_VENDOR=anthropic` · `CHAT_MODEL=haiku` · `EXAM_SOLVE_MODEL=haiku` · `QUIZ_GRADE_MODEL=haiku` · `QUIZ_VERIFY_MODEL=haiku` · `SYLLABUS_MODEL=haiku|sonnet` · `SUMMARY_MODEL_VENDOR=anthropic` 등.
  - ⚠️ **프로덕션(Vercel) env는 코드에서 확인 불가** — 실제 prod 모델 확정은 `vercel env ls` 필요.
  - ⚠️ **post-mortem은 미구현**(실제 AI 호출 0건, 라우팅 라벨만).
- **Supabase** (Auth + Postgres + Storage + Realtime). RLS 켜둠, 어드민 작업은 service-role로 우회 + userId를 세션과 재검증. (pgvector 미사용 — RAG는 풀텍스트 기반. 단 quiz **의미 dedup**은 `gemini-embedding-001` 임베딩을 런타임에서 코사인 비교만 하고 저장 안 함 — [semantic-dedup.ts](src/lib/services/semantic-dedup.ts).)
- **Remotion 사용 X** — 이전 프로젝트와 혼동 주의. 영상 생성 없음.
- **언어**: UI·콘텐츠·프롬프트 한국어. 변수명·함수명·주석 영어.
- **반응형 1급**: Mobile (<640) · iPad (768~1024) · Desktop (≥1280) **동등 지원**. 상세 [DESIGN.md §13](docs/design/DESIGN.md#13-반응형-전략--1급-시민).

---

## 2. 명령어

```bash
npm run dev          # Next dev :3000
npm run build        # 프로덕션 빌드 + 타입 검증
npm run typecheck    # tsc --noEmit (빠른 타입 체크)
npm run check        # Biome lint + format
npm run check:fix    # Biome lint + format --write
npm run test         # Vitest 1회
npm run verify:env   # .env.local 환경변수 누락 검사
```

린트·포맷은 **Biome**, 테스트는 **Vitest**. UI 검증은 [docs/ARCHITECTURE.md §10](docs/ARCHITECTURE.md#10-디자인-검증-워크플로-ui-작업-끝낼-때마다).

---

## 3. 배포

- 프로덕션: https://arch-campus.vercel.app
- **GitHub auto-deploy** — `main` push → production / 다른 브랜치 → preview URL
- 수동 배포 `vercel --prod`는 사용자 명시 요청 시만
- `vercel.json` framework preset 고정용. 함부로 지우지 X
- 환경변수: `vercel env pull .env.local`
- 롤백: Vercel 대시보드 Deployments에서 "Promote to Production"

---

## 4. AI 윤리·치팅 라인 (★ 제품의 사활)

이 서비스는 **학습 보조**이지 **대신 써주는 AI**가 아니다. 다만 "결과물이 안 나오면 학생이 안 쓴다"는 현실(2026-05-31 사용자 결정)에 따라 **초안 생성은 허용**하되, 그대로 제출 못 하게 4중 가드로 막는다.

**구현 규칙 (모든 본문 생성 위저드 = 독후감·발표대본·보고서·자소서·이력서·공모전 제안)**:

1. **워터마크 강제** — 결과물 머리·꼬리 양쪽에 박는다. 복붙해도 같이 따라가게 굵게.
   > ⚠️ AI 초안입니다. **본인 표현으로 다시 쓰지 않으면 학교 표절 검사기에 잡힙니다.** 제출 책임은 본인.

2. **인용·출처 표시 강제** — 책·논문·강의자료 인용한 문장 옆에 `[출처: ...]` 자동 삽입. 사실 주장 문장이 인용 없이 나오면 안 됨.

3. **"내 표현으로 다시 쓰기" 버튼** — 결과 화면 1급 액션. 클릭 시 한 번 더 LLM 호출해 paraphrasing. 학생이 워터마크 무시 못 하게 이 버튼이 가장 크고 눈에 띄어야 함.

4. **약관 명시** — "AI 초안 그대로 제출 시 학칙·저작권 위반 책임은 사용자". 가입 시 동의 + 결과물 푸터에 한 줄.

**여전히 만들지 않는 것**:
- 시험 답 풀어주기 ("기출 문제집 사진 → 정답" 차단. 본인 자료 기반 학습 문제만)
- 객관식·서술형 정답 직접 출력 (학습 큐·해설은 OK)
- 학교가 명시적으로 금지한 형태 (예: 특정 학교의 AI 사용 금지 과제 — 사용자 약관에 본인 확인 책임)

**새 위저드 만들 때 자가검증 (코딩 전)**:
- 결과물에 위 4중 가드 다 박혔나?
- "이게 Gauth/뤼튼처럼 보이나?" — 본인 자료·맥락 없이 외부 자료만 입력해도 결과 나오면 위험. 자기 자료·자기 경험을 항상 입력 변수로 요구.

---

## 5. 컴플라이언스 — 한국 법규

- **저작권**: 사용자 업로드 강의자료는 교수 저작물. 학습 재사용 옵트인 분리. 약관에 "본인이 정당하게 보유한 자료만 업로드".
- **개인정보**: 학번·연락처 패턴 자동 마스킹. 신고 시 24시간 내 게시 중단.
- **AI 활용 가이드**: 워터마크(§4) + 학칙 위반 시 사용자 책임 명시.

위 셋 중 하나에 닿는 기능은 코딩 전에 "법무 검토 필요해 보입니다" 알림.

---

## 6. 확인 없이 하지 마라

- `rm -rf`, `git push --force`, `git reset --hard`
- 이미 적용된 마이그레이션 파일 삭제·수정
- `.env`·키·토큰 포함 파일을 git add
- Supabase Dashboard에서 직접 SQL 돌리기 (사용자가 직접)
- `vercel --prod` (사용자가 명시 요청한 경우만)
- 사용자 데이터 (페르소나, 업로드 자료) 삭제·이전
- 모델 변경 — 라우팅 테이블(§1) 바꾸기 전 비용 영향 보고
- 사용자가 명시 요청 안 한 메모리·설정·선호 저장 (자동 저장 X)

의심되면 묻는다.

---

## 7. 검증 없이 "끝" 선언 X

배포·외부 환경에 영향 가는 작업은 실제 환경에서 한 번 돌려본 뒤에만 보고:

- API 라우트 수정 → 로컬에서 해당 엔드포인트 호출해서 응답 확인 (curl 또는 브라우저)
- Vercel 배포 후 → 변경된 페이지를 프로덕션 URL에서 직접 열어 확인
- AI 파서·추출기 수정 → 실제 사용자 자료(시간표 PDF 등)로 한 번 돌려서 결과 비교
- 같은 워크어라운드 두 번 실패 → 멈추고 사용자에게 보고. 세 번째 시도 X

"빌드 통과" ≠ "기능 동작". UI/파싱/외부 호출은 빌드 통과해도 런타임에서 깨짐.

---

## 8. 에이전트 자동 라우팅

작업을 받으면 아래 표를 보고 **자동으로** 해당 에이전트(`Agent` 툴 + `subagent_type`) 호출. 사용자가 명시 안 해도 메인 컨텍스트가 알아서 위임. 호출 전 한 줄로 "이 작업은 X 에이전트에 맡길게요" 알리고 진행.

| 작업 신호 | 에이전트 | 이유 |
|---|---|---|
| 작은 버그 수정·1~2 파일 변경·"이 줄만 고쳐줘" | `minimal-change-engineer` | 폭주 리팩터 방지. 우리 §6·7과 결 일치 |
| Supabase 쿼리 느림·인덱스·N+1·timetable/events 조회 튜닝 | `database-optimizer` | Postgres·Supabase 전문. 학생 늘면 필수 |
| UI 톤 다듬기·CSS 시스템·디자인 토큰·DESIGN.md 보완 | `design-ux-architect` | 디자인 일관성. DESIGN.md §1~13과 같이 작동 |
| "다음에 뭐 할까"·우선순위·MVP 범위 결정·PRODUCT.md 보완 | `product-sprint-prioritizer` | 적자 통제 + Phase 1/2/3 판단 |
| 큰 변경(>200줄·새 라우트·새 위저드) 끝난 후 PR 직전 | `code-reviewer` | 우리 가드 두툼하게 박힌 기존 에이전트 |
| 코드베이스 광범위 탐색·"X가 어디 있어"·여러 파일 검색 | `Explore` (built-in) | 메인 컨텍스트 보호 |
| 큰 작업의 구현 전략·아키텍처 결정 | `Plan` (built-in) | 200줄+ 또는 새 시스템 |

**중복·충돌 방지:**
- 한 작업에 두 에이전트 동시 호출 X. 자연스러운 순서: `Plan` → 구현 → `code-reviewer`
- 사용자가 "그냥 너가 해" 하면 위 라우팅 무시하고 메인 컨텍스트가 직접 처리
- 발췌 에이전트(agency-agents 출신)는 [.claude/agents/_GUARDS.md](.claude/agents/_GUARDS.md) 머리에 박힘 — 모델 라우팅·치팅 라인·MVP 범위 다 알고 있음

**superpowers skill (자동 발동):**
- `brainstorming` — 새 기능 요청 시 spec 먼저 (우리 §0과 일치)
- `verification-before-completion` — 끝 선언 전 검증 (§7 강화)
- `systematic-debugging` — "왜 안 돼" 류 시 가설→증명 절차
- 이 셋은 자동 발동되며 우리 가드와 결이 같아 끄지 않음. 거슬리면 사용자가 "건너뛰고 바로" 한마디로 무시

---

## 9. 작업 시작 전 체크리스트

새 task마다 통과:

- [ ] [docs/PRODUCT.md](docs/PRODUCT.md) §2 MVP 범위 안인가? — NO면 사용자 확인
- [ ] 새 도구라면 [docs/ARCHITECTURE.md §2 4-Layer](docs/ARCHITECTURE.md#2-4-layer-패턴--새-도구-추가-시-그대로-복제) 모두 손댈 준비됐나?
- [ ] DB 스키마 변경 있다면 마이그레이션 SQL 파일도 만들고 사용자에게 실행 안내?
- [ ] 새 라우트에서 `getAdminSupabase()` 쓰면 [ARCHITECTURE.md §4-1](docs/ARCHITECTURE.md#4-1-service-role-사용-체크리스트-신규-라우트마다) 4개 가드 다 박혔나? (RLS 우회 → 가드 빠지면 데이터 노출)
- [ ] AI 호출이면 모델 라우팅(§1) 맞나? Sonnet 남발 X
- [ ] 위저드라면 "치팅 도구"로 안 보이나? (§4)
- [ ] 끝나고 `npm run dev` 골든패스 돌릴 건가? (CONVENTIONS.md)
- [ ] UI 작업이면 [디자인 검증 워크플로](docs/ARCHITECTURE.md#10-디자인-검증-워크플로-ui-작업-끝낼-때마다) 거칠 건가?
- [ ] 큰 변경(>200줄, 새 라우트, 새 위저드)이면 끝난 후 `code-reviewer` 서브에이전트 호출할 건가?
- [ ] 외부 영향 작업(배포·API·파서)이면 §7 (검증 없이 끝 X) 통과했나?

흐려지면 멈추고 묻는다.
