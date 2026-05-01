# REFERENCES.md — 도입 보류 중인 외부 자료·라이브러리

> 지금은 가져오지 않지만, 도입 시점이 오면 **다시 찾지 않도록** 정리. 각 항목은 **언제 도입할지(트리거)**·**무엇을 차용할지(범위)**·**버려야 할 것(스킵 사유)** 까지 적는다. CLAUDE.md §1 MVP 가드를 통과한 시점에만 도입.

---

## 1. 인증 + RAG 보일러플레이트

### 1-1. supabase-community/chatgpt-your-files
- URL: https://github.com/supabase-community/chatgpt-your-files
- 신호: Supabase 공식, 512 stars
- **도입 트리거**: Phase 1 5~6주차 — "학습 루프 (자료 → 요약 → 문제)" 작업 직전
- **차용 범위**:
  - Edge Function에서 PDF/문서 처리 (`/supabase/functions/embed`)
  - 헤딩 기반 청킹 전략
  - RLS로 임베딩 테이블 사용자 스코프
  - pgvector + match_documents RPC 패턴
- **버릴 것**: OpenAI 임베딩 호출 → Voyage 또는 text-embedding-3-small로 교체. UI는 0부터 우리 디자인.
- **차용 방법**: 클론 X. `git clone /tmp/`로 임시 받아서 위 4개 패턴만 우리 코드에 옮긴다.

### 1-2. ElectricCodeGuy/SupabaseAuthWithSSR
- URL: https://github.com/ElectricCodeGuy/SupabaseAuthWithSSR
- 신호: 391 stars, 적합도 최상
- **도입 트리거**: 3~4주차 인프라 작업 중 인증 레이어 만들 때
- **차용 범위**:
  - `@supabase/ssr`로 Server Component에서 세션 읽기
  - 미들웨어에서 토큰 갱신 패턴
  - PDF 업로드 → pgvector 파이프라인 (`/lib/voyage-embedding.ts` 같은 어댑터)
- **버릴 것**: 멀티 LLM 추상화 (우리는 Anthropic 단일). UI 컴포넌트.
- **차용 방법**: `src/lib/supabase/{client,server,middleware}.ts` 3개 파일 패턴만 옮긴다.

---

## 2. Anthropic SDK 참고

### 2-1. anthropics/claude-cookbooks
- URL: https://github.com/anthropics/claude-cookbooks
- 신호: 41.9k stars, 공식
- **이미 반영**: `src/lib/claude.ts` 가 `misc/prompt_caching.ipynb` 패턴 따름
- **재방문 트리거**: tool use, thinking, citations, batch API 도입 시
- **읽어둘 것**:
  - `misc/prompt_caching.ipynb` — TTL·breakpoint 전략
  - `misc/extended_thinking.ipynb` — 시험 후 회고 같은 추론 작업 도입 시
  - `tool_use/customer_service_agent.ipynb` — 위저드를 멀티턴으로 확장할 때

---

## 3. 한국어 문서 파싱 (Phase 2)

### 3-1. neolord0/hwpxlib
- URL: https://github.com/neolord0/hwpxlib
- 신호: 175 stars, Apache-2.0, Java
- **도입 트리거**: Phase 2 자격증·시험 통합 모듈 + 사용자 HWPX 업로드 본격화 시점 (5~9개월 차)
- **차용 범위**: HWPX → JSON/텍스트 변환만. 쓰기 기능은 X
- **운영 방식**: Vercel Functions 안에서 직접 X. 별도 워커(Vercel Sandbox / Modal / 작은 컨테이너)에서 Java 실행 후 Node로 결과 받기
- **버릴 것**: 레이아웃·스타일 보존. 우리는 텍스트 + 표 구조만 필요

### 3-2. Indosaram/hwpers
- URL: https://github.com/Indosaram/hwpers
- 신호: 192 stars, Rust
- **도입 트리거**: 사용자 인터뷰에서 "HWP 바이너리 업로드 못 함" 불만이 30% 이상일 때
- **참고**: CLAUDE.md §1·PRODUCT.md §6-1 "HWP 변환 안내" 정책을 바꿀 때만. 현재 정책상 HWPX만 지원
- **차용 방법**: WASM 빌드 또는 작은 Rust 바이너리로 워커에서 실행

### 3-3. PaddlePaddle/PaddleOCR
- URL: https://github.com/PaddlePaddle/PaddleOCR
- 신호: 76.9k stars, 한국어 OCR 최강, v3.5.0 (2026-04)
- **도입 트리거**: 디지털 PDF 추출 실패율이 사용자 업로드의 10% 넘을 때 (스캔본·이미지 PDF)
- **운영 방식**: Vercel 함수 X (모델 무거움). Modal·Replicate·전용 컨테이너에 워커로 배포 후 큐 기반 호출
- **차용 범위**: PP-StructureV3 (구조 인식 + OCR)
- **비용 통제**: 파일 SHA-256 해시를 키로 OCR 결과 캐싱 (R2/Blob에 영구 저장). 동일 파일 재OCR 절대 금지
- **버릴 것**: 학습 코드. 추론만

---

## 4. 코드베이스 검색 도구

### 4-1. zilliztech/claude-context
- URL: https://github.com/zilliztech/claude-context
- 신호: 10.5k stars, MCP, ~40% 토큰 절감 주장
- **도입 트리거**: 코드베이스 5,000줄 초과 + Claude Code에서 grep만으로 코드 못 찾는 일이 일주일에 3회 이상 발생
- **현재 판단**: 1~3주차엔 grep + Read가 더 싸고 정확. **재검토는 4~6주차.**
- **차용 방법**: MCP 서버 설치 후 `/Users/hong-yuntaeg/.claude/mcp.json` 등록

---

## 5. Claude Code 슬래시 스킬·서브에이전트 (이미 1개 도입)

### 5-1. ✅ VoltAgent/awesome-claude-code-subagents — code-reviewer 도입 완료
- 위치: `.claude/agents/code-reviewer.md`
- 사용법: `Agent` 툴에 `subagent_type: "code-reviewer"`로 호출
- arch-campus 컨텍스트(CLAUDE.md·PRODUCT.md) 자동 참조하도록 커스터마이즈됨
- 모델: sonnet (opus는 비용 큼)

### 5-2. 추가 후보 (필요할 때만)
- `api-designer` — REST/GraphQL 라우트 설계 시
- `database-engineer` — Supabase 스키마·RLS 설계 시
- 다 깔지 X. 필요할 때 1개씩 추가.

### 5-3. 슬래시 커맨드 후보 (mattpocock/skills)
- URL: https://github.com/mattpocock/skills
- `/grill-me` — 코딩 전 요구사항 명확화. 큰 작업 시작 전 시도해볼 만함
- 설치: `npx skills@latest add mattpocock/skills/grill-me` 정도로 1개씩

---

## 6. 명시적 스킵 — 도입하지 않을 것

| 항목 | 이유 |
|---|---|
| drona23/claude-token-efficient | 저자 본인이 인터랙티브 세션엔 비추라고 명시 |
| lsdefine/GenericAgent | 자율 에이전트 프레임워크, 우리 스택과 표면적 0 |
| 일반 SaaS 보일러플레이트 (Razikus, ixartz 등) | AI 배관 없음, 절반 뜯어내야 함 |
| "Caveman" 토큰 킬러 스킬 | 한국어 프롬프트는 명확성이 중요 — 손해 |
| claude-code-saas-starter | 저효율 포크 |

---

## 7. 검증 필요 가설 (외부 자료 보강 시점)

PRODUCT.md 부록의 "확인 필요 항목" 10개 중 외부 자료로 검증되는 것들:

1. **FSRS vs SM-2 효율** — open-spaced-repetition/fsrs4anki 벤치마크 데이터 인용 (도입 시점: 학습 루프 §4-7 구현 시)
2. **에브리타임 광고 단가** — 외부 광고 대행사 연락 (도입 시점: Phase 0 마케팅 채널 검증)
3. **위저드 UX 전환율** — Linear·Notion·Granola의 온보딩 사례 분석 (도입 시점: 9~10주차 위저드 구현 직전)

---

**문서버전**: 2026-05-01
**다음 갱신**: 새 외부 자료 검토할 때마다 추가
