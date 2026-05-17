# Split-view + 자동 PDF 변환 — Production 검증 메모

**날짜**: 2026-05-17
**Spec/Plan**: [spec](../superpowers/specs/2026-05-16-material-split-view-design.md) · [plan](../superpowers/plans/2026-05-16-material-split-view.md)
**Deployment**: `arch-campus-pohhi7lha-0625yts-projects.vercel.app` (production)

---

## 자동 검증 (assistant 수행) — 통과

| 항목 | 방법 | 결과 |
|---|---|---|
| `npx tsc --noEmit` | 로컬 | 0 errors |
| `npm run build` | 로컬 | 통과 (`/dashboard/study/[course]/[material]` 등록 확인) |
| Production 배포 | `vercel ls --prod` | `pohhi7lha` Ready (1m duration) |
| `/login` 200 | curl | OK |
| `/api/materials/:id/original-url` GET 401 | curl | 라우트 존재 + auth gate 정상 |
| `/api/materials/:id/original-url` POST 405 | curl | GET-only로 등록됨 (의도대로) |
| `/api/materials/finalize` 401 | curl | auth gate 정상 |
| `/dashboard/study/[course]/[material]` 307 | curl | login redirect 정상 |
| 마이그레이션 0011 | Supabase Dashboard | 사용자 적용 확인 |
| `CLOUDCONVERT_API_KEY` (Vercel Production + Preview) | `vercel env ls` | OK |

## 사용자 실측 — 미수행 (이 자리에 결과 채우기)

> Plan Task 11 Step 5. 로그인 후 자료 업로드 필요 — assistant 자동화 불가.

### 1. PDF 업로드 → split-view

- [ ] 데스크톱: 좌측 sticky iframe + 우측 요약 표시
- [ ] 요약 블록 옆 `p.N` 칩 클릭 → 좌측 iframe이 해당 페이지로 점프
- [ ] 모바일: 단일 컬럼 요약만, `p.N` 칩 클릭 → 새 탭으로 PDF 열림

### 2. PPTX 업로드 → 변환 polling

- [ ] 상세 진입 직후: 좌측 spinner + "원본을 PDF로 바꾸는 중이에요" 카드
- [ ] 우측 요약은 정상 표시 (요약이 변환보다 먼저 끝날 수 있음)
- [ ] 10~30초 후 자동 refresh → 좌측이 iframe으로 교체됨
- [ ] 교체 후 페이지 칩 점프 동작

### 3. DOCX 업로드 → 같은 흐름

- [ ] PPTX와 동일하게 동작

### 4. (선택) 변환 실패 fallback

- [ ] `CLOUDCONVERT_API_KEY`를 잘못된 값으로 잠깐 바꿔서 업로드 → 좌측에 "원본을 PDF로 바꾸지 못했어요" + 다운로드 버튼
- [ ] 다운로드 버튼 클릭 → 원본 파일 새 탭에서 열림
- [ ] 검증 후 키 원복

## 발견된 문제 + 후속 fix (사용자 1차 실측 피드백)

### 회귀 1 — `.hwp` 업로드 불가

study 업로드 zone의 `accept` 필터에 `.hwpx` 만 있고 `.hwp` 누락. 파일 선택창에서 한글 파일이 회색 처리돼 선택 자체 불가. → commit `6165e59` 한 글자 추가.

### 회귀 2 — 업로드 끝나면 자동으로 자료 상세로 이동

기존 `c723e97` 도입 시점부터 `await … router.push(detail)` 패턴. "올리는 중 + 끝나면 강제 이동" 이라 사용자가 "올리고 다른 거 하기"가 어려웠음. → commit `ece108d` 자동 이동 제거 + done 카드(자료 보기 / 다른 자료 더 올리기) 도입.

### 회귀 3 — 페이지 이동 후 돌아오면 자료가 사라짐 + JobsDock 텅 빔

근본 원인: 기존 finalize는 응답 *전에* Storage download + parseDocument(5~15초) + materials INSERT + jobs enqueue 다 끝냈음. 사용자가 그 사이 페이지 이동하면 브라우저가 fetch abort → 함수가 응답 못 보내고 종료 → INSERT 자체가 안 됨. → commit `d873fce` finalize 재구조화:

- INSERT materials (placeholder full_text/page_count) + enqueueJob × 2~3을 응답 *전*에
- Storage download / parse / 잡 실행 / materials.full_text 보정 UPDATE는 모두 `after()` 안으로
- 응답 ~200ms → JobsDock이 pending 잡 즉시 잡음
- download/parse 실패 시 잡 모두 markJobError → dock에 에러 상태로 보임

## 후속 사용자 실측 (재배포 후)

- [ ] 자료 업로드 → 1초 안에 done 카드
- [ ] 우하단 JobsDock에 "진행 중 N건" 즉시 등장
- [ ] 다른 페이지 이동했다 돌아와도 자료 list에 박혀있음
- [ ] dock 클릭 → 해당 자료 페이지로 이동, 잡 끝나면 dock에서 사라지고 요약·문제 표시
- [ ] HWP/PDF/PPTX/DOCX 4종 다 같은 동작

