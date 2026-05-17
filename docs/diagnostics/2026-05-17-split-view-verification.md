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

## 발견된 문제

(있으면 여기에)

## 후속

(있으면 여기에)
