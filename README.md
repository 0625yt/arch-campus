# arch-campus

한국 대학생을 위한 과목별 자료 학습·시간표·일정 관리 서비스.

강의자료 업로드 → 요약·자료 질문 → 연습 문제 → 채점·오답 복습을 연결한다. 시간표와 강의계획서는 추출 결과를 사용자가 확인하고 저장한다.

- [운영 사이트](https://arch-campus.vercel.app)
- [기능 현황](docs/STATUS.md): 구현·부분 구현·미구현 구분
- [2026-09-22 보완 보고서](docs/audit/2026-09-22-hardening.md): 테스트 근거·제약·수정 사항
- [다음 작업](docs/NEXT-STEPS.md), [실제 구조](docs/ARCHITECTURE.md), [제품 로드맵](docs/PRODUCT.md)

## 현재 제공하는 기능

| 영역 | 구현 내용 |
|---|---|
| 내 캠퍼스 | 주간/오늘/목록 시간표, 강의실·교수·수업 시간, 과목 수정, 우선순위·예정 일정 |
| 공부 공간 | 과목·교수·강의실 검색, 학기/개인 공부 분류, 최근 활동 이어가기 |
| 자료함 | 업로드, 제목 검색·요약 필터, 이동·삭제, 비동기 처리 상태·오류 복구 |
| 학습 | 요약, PDF 분할 보기, 출처 이동, 자료 챗·자유 챗, 문제 생성·기출 추출·채점·오답 |
| 일정 | 월·주·일·연 뷰, 일정 CRUD, 자연어 입력, 시간표·강의계획서 추출·확인·저장 |
| 도구 | 발표, 리포트 구조, 요구사항 체크, 벼락치기 계획, 독후감의 5개 위저드 |
| 계정 | 이메일/Google 로그인, 온보딩, 비밀번호 재설정, 전체 로그아웃·계정 삭제, TOTP 등록 UI |
| 운영 | 피드백 수집·관리, 작업 상태, 사용자별 데이터 격리, 호출 제한 |

**아직 제공하지 않음:** FSRS 간격 반복, 푸시 알림, 외부 캘린더 양방향 동기화, 결제·사용량 과금, 친구 초대 보상, 성적·합격 추적, 팀플·진로 위저드. MFA 로그인 화면·서버 AAL2 검증과 DB 직접 접근 제한 정책은 운영 DB에 적용했고 실접근 29개 검사로 검증했다. 복구 코드는 아직 제공하지 않는다.

## 실행

Node.js는 배포 환경과 같은 24.x 권장. 정확한 설치 버전은 `package-lock.json` 기준.

```sh
npm ci
# 신뢰하는 프로젝트 설정으로 .env.local 구성 (비밀 키 커밋 금지)
npm run verify:env
npm run dev
```

`verify:env`는 설정·Auth·DB·Storage를 읽기 전용으로 확인한다. 키 값이나 사용자 행 내용은 출력하지 않는다. AI 생성 요청은 보내지 않는다.

```sh
npm run verify:env -- --models   # 현재 라우팅 모델의 API 가용성 추가 확인
npm run test                   # 단위 테스트; 실제 AI 평가는 기본 건너뜀
npm run test:e2e                # 로컬 3010, 모바일·태블릿·노트북
npm run typecheck
npm run build
npm run check                  # 저장소 전체 규칙 검사; 잔여 문제는 점검 보고서 참조
```

`E2E_BASE_URL`은 테스트할 외부 주소, `E2E_STORAGE_STATE`는 전용 테스트 계정의 세션 파일이다. 세션 파일은 비밀정보이며 커밋하지 않는다. UI 테스트 일부는 로컬 개발용 예시 데이터와 가짜 네트워크 응답을 사용한다. 테스트 통과를 실제 AI 품질·다른 사용자 데이터 격리 전체 검증으로 해석하지 않는다.

## 기술 구성

Next.js App Router · React 19 · TypeScript · Tailwind CSS 4 · Supabase Auth/Postgres/Storage · Vercel AI SDK 6 · Zod · Vitest · Playwright/axe · Biome.

- 모델 선택의 단일 출처: `src/lib/claude.ts`의 **`getModelIdFor()`/`resolveModel()`**. `TOOL_MODEL`만 읽으면 분기에서 바뀌는 기본값을 놓친다.
- 기본 주요 모델: 요약·문제·챗은 Gemini 3.5 Flash-Lite, 발표 등 위저드는 Gemini 3.6 Flash, 시간표·강의계획서는 Gemini 3.1 Pro Preview. 환경변수로 달라질 수 있다.
- Google 기본 경로는 `GOOGLE_GENERATIVE_AI_API_KEY`, Anthropic을 선택한 경로는 `ANTHROPIC_API_KEY` 필요. 자동으로 다른 회사의 모델로 전환되는 장애 복구를 가정하지 않는다.
- 자료: PDF/DOCX/PPTX/XLSX/TXT/MD 및 이미지. HWP/HWPX는 별도 변환 서비스 설정 필요. 구형 DOC/PPT/XLS는 기본 파서에서 거절한다.
- 저장소에는 0001~0027 SQL 마이그레이션이 있다. 2026-09-25에 운영 스키마와 0001~0026 결과를 대조해 이력을 정합화하고 0027을 적용했다.
- 분산 호출 제한: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. 없으면 **인스턴스별 메모리 제한**으로 작동한다.

## 개발과 배포

- 이 Next.js 버전의 로컬 가이드 `node_modules/next/dist/docs/`를 먼저 읽는다.
- 입력 검증, 서버 사용자 확인, `owner_id` 제한, 파일 경로 검증을 유지한다.
- `/dev/*`, `/dashboard/dev/*`는 운영에서 차단한다. 개발용 사용자 fallback도 운영에 적용하지 않는다.
- 디자인의 현재 기준은 [ARCH-CAMPUS-STYLE.md](docs/design/ARCH-CAMPUS-STYLE.md).
- 기존 Vercel 프로젝트는 `arch-campus`. 배포 요청 시 `vercel deploy --prod`; 완료 후 인증된 화면과 비로그인 접근을 별도로 확인한다. Git 브랜치와 운영 배포는 동일하다고 가정하지 않는다.
- 과거 조사·수치·계획은 당시 기록이다. 가격·모델 지원·보안 수정은 공식 자료와 현재 테스트로 재확인한다.
