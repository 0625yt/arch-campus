# hwp-converter — 5분 안에 배포하기

HWP/HWPX → PDF 변환 마이크로서비스. Vercel은 LibreOffice를 못 깔아서 별도 컨테이너로 띄움.
Next.js 쪽 [src/lib/parsers/hwp.ts](../../src/lib/parsers/hwp.ts)가 이 서비스를 호출한다.

## 한눈에

| | |
|---|---|
| 호스팅 | Render (무료 티어 — 750h/월) |
| 빌드 | LibreOffice + Node 20, 도커 이미지 ~700MB, 첫 빌드 5~10분 |
| 변환 1건 | 5~30초, 메모리 200~400MB |
| 무료 티어 한계 | 15분 idle → sleep → 첫 요청 cold start 30~60초 |

---

## 사용자가 클릭해야 할 4단계

### 1) Render 가입 + GitHub 연결 (1분)
- https://dashboard.render.com 가서 GitHub 계정으로 로그인.
- 처음이면 GitHub OAuth 승인 한 번 하라고 뜸 → `0625yt/arch-campus` 리포 접근 허용.

### 2) Blueprint로 한 번에 띄우기 (3분 + 빌드 5~10분)
- 우측 상단 **New +** → **Blueprint**.
- Repository에서 `0625yt/arch-campus` 선택.
- Render는 **리포 루트의** [`render.yaml`](../../render.yaml)을 자동 인식한다.
  (이 README가 있는 폴더의 render.yaml은 무시되므로 루트 한 곳에만 둠.)
- Blueprint 이름은 `arch-campus-hwp-converter`로 떠야 정상.
- 한 번 묻습니다 — 환경변수 `HWP_CONVERTER_TOKEN` 입력. 무작위 32바이트 문자열을 넣으세요. (만들기는 아래 한 줄)
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  ```
- **Apply** 누르면 빌드 시작. 첫 빌드는 LibreOffice 까는 시간 때문에 5~10분.

### 3) 배포 완료 — URL 받기 (즉시)
- Dashboard에서 서비스 클릭 → 상단에 `https://arch-campus-hwp-converter.onrender.com` 형태의 URL이 뜸.
- 동작 확인:
  ```bash
  curl https://arch-campus-hwp-converter.onrender.com/health
  # → {"ok":true,"service":"hwp-converter"}
  ```

### 4) Vercel에 환경변수 2개 (1분)
Vercel Dashboard → arch-campus 프로젝트 → Settings → Environment Variables → 다음 둘을 **Production · Preview · Development 모두** 체크해서 추가:

```
HWP_CONVERTER_URL    https://arch-campus-hwp-converter.onrender.com
HWP_CONVERTER_TOKEN  <2)에서 만든 그 토큰>
```

추가 후 Vercel은 재배포가 필요 — 다음 push 때 자동 반영. 지금 바로 반영하려면 Vercel 대시보드에서 **Redeploy** 한 번.

---

## 동작 컨트랙트 (디버깅용)

```
POST /convert?to=pdf
  body:    HWP/HWPX 바이트 (application/octet-stream)
  headers:
    authorization: Bearer <HWP_CONVERTER_TOKEN>      # env 설정 시 필수
    x-filename:    <원본 파일명>                       # .hwp/.hwpx 확장자 판별용
  response:
    200 application/pdf      성공 (PDF 바이트)
    400                      empty body / 잘못된 to=
    401                      토큰 불일치
    413                      25MB 초과
    500                      LibreOffice 변환 실패

GET /health → {"ok":true,"service":"hwp-converter"}
```

수동 테스트:
```bash
curl -X POST "https://arch-campus-hwp-converter.onrender.com/convert?to=pdf" \
     -H "content-type: application/octet-stream" \
     -H "authorization: Bearer $HWP_CONVERTER_TOKEN" \
     -H "x-filename: test.hwp" \
     --data-binary @test.hwp \
     -o out.pdf
```

---

## Cold start이 거슬리면

무료 티어는 15분 idle이면 sleep → 첫 요청 30~60초 걸림. 학생들이 HWP를 자주 안 올리면 거의 매번 cold start.

옵션:
- **그냥 둠** (가장 쌈) — 첫 요청만 느림, 사용자에겐 "변환 중…" 30초 메시지로 충분.
- **무료 cron 핑** — https://cron-job.org 에서 10분마다 `/health` 호출 (월 100회 무료 한도 안에서 가능). 거의 sleep 안 함.
- **유료 Starter $7/월** — 항상 깨어있음, 메모리 512MB, 빌드 빠름.

---

## 로컬에서 돌려보기

LibreOffice 설치 (mac):
```bash
brew install --cask libreoffice
```

서버 띄우기:
```bash
cd services/hwp-converter
npm install
npm run dev
# → hwp-converter listening on :3001
```

다른 터미널에서:
```bash
curl http://localhost:3001/health
```

테스트 HWP 파일 변환:
```bash
curl -X POST "http://localhost:3001/convert?to=pdf" \
     -H "content-type: application/octet-stream" \
     -H "x-filename: test.hwp" \
     --data-binary @any.hwp \
     -o out.pdf
open out.pdf
```

---

## 왜 LibreOffice인가

- `hwp.js` (npm) → 2020년 stale, 최신 HWP 속성 누락
- 자바 hwplib → JVM이 컨테이너 안에 또 있어야 함
- LibreOffice는 한컴이 한/글 호환성 합의 → 무료·꽤 정확. HWPX는 LibreOffice 7.3+ 기본 지원.

---

## 비용·한계

- Render Free: 서비스 1개 항상 가능 (750h/월). 도커 이미지 빌드 무료.
- 변환 1건당 메모리 200~400MB → Free 티어 512MB로 충분.
- 30MB 이상 HWP는 거부 (변환에 메모리 폭주 가능).
- 동시 변환은 1건만 안전 (Free 티어 단일 인스턴스). 학생용 도구라 충분.

---

## 환경변수가 없으면

`HWP_CONVERTER_URL`이 비어있으면 [src/lib/parsers/hwp.ts](../../src/lib/parsers/hwp.ts)가 자동으로 안내 텍스트만 반환:
> "한글 파일 — 본문 자동 추출이 아직 안 돼요. PDF로 변환해서 다시 올리면 정확한 요약을 만들어줄 수 있어요."

배포 안 돼도 앱이 깨지진 않음. 다만 한컴 자료는 처리 못 함.
