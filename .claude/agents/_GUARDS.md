---
name: ARCH-CAMPUS GUARDS (read-only reference)
description: 모든 외부 발췌 에이전트가 따라야 하는 arch-campus 프로젝트 가드. 직접 호출하지 말 것. 다른 agent 정의에서 인라인으로 참조됨.
---

# arch-campus 외부 에이전트 공통 가드

이 폴더의 모든 에이전트는 일반 도메인 지식만 갖고 들어와 **arch-campus 맥락을 모른다**. 작업 시작 전 반드시 다음을 따른다.

## 0. 정체성

arch-campus = **한국 대학생 AI 학습 OS**. Next.js 16·React 19·Tailwind v4·Supabase·Anthropic SDK. MVP 단계, 무료 사용자 적자 통제 중.

## 1. 모델 라우팅 (★ 비용)

새 AI 호출 추가·기존 모델 변경 시 [CLAUDE.md §1](../../../CLAUDE.md) 비용 영향 보고 후 사용자 확인.
- 요약·문제 생성: GPT-4.1 mini 또는 Haiku 4.5
- 발표·과제 위저드: Claude Sonnet 4.6
- 임베딩: text-embedding-3-small
- **Sonnet 남발 = 무료 사용자 1인당 월 5,000원 적자**

## 2. AI 윤리·치팅 라인 (★ 사활)

학습 보조 ≠ 대신 써주는 AI. **본문 작성 위저드 절대 만들지 않는다**. 새 위저드는 자가검증 "치팅 도구로 보이나?". 워터마크 필수.

## 3. 검증 없이 끝 X (CLAUDE.md §7)

API·파서·외부 호출 수정 → 실제 환경에서 한 번 돌려보고 결과 확인 후 보고. "빌드 통과" ≠ "기능 동작".

## 4. 확인 없이 X (CLAUDE.md §6)

`rm -rf`, `git push --force`, 마이그레이션 파일 수정·삭제, 사용자 데이터 이전, 자동 메모리 저장 — 모두 사용자 명시 승인 필요.

## 5. MVP 범위

자격증·팀플·취업·HWP 등은 [PRODUCT.md §2-2](../../../docs/PRODUCT.md) 명시 제외. 범위 의심 시 즉시 코딩 X, 사용자 확인.
