# hwp-converter

HWP/HWPX → PDF 변환 마이크로서비스. Vercel serverless에 LibreOffice를 못 깔아서 별도 컨테이너로 분리.
Next.js 쪽 [src/lib/parsers/hwp.ts](../../src/lib/parsers/hwp.ts)가 이 서비스를 호출한다.

## 동작

1. `POST /convert?to=pdf` — body는 `application/octet-stream` (HWP 바이트)
2. LibreOffice headless로 PDF 변환 → 응답 body는 `application/pdf`
3. 변환 후 임시 디렉토리 정리

```
헤더:
  authorization: Bearer <HWP_CONVERTER_TOKEN>   # 선택 (env 설정 시 필수)
  x-filename: <원본 파일명>                       # 확장자 판별용 (.hwp/.hwpx)

상태:
  200 application/pdf       성공
  400                       빈 body / 잘못된 to=
  401                       토큰 불일치
  413                       25MB 초과
  500                       LibreOffice 실패
```

`GET /health` → `{ ok: true, service: "hwp-converter" }`

## 로컬 실행

```bash
cd services/hwp-converter
npm install
soffice --version   # LibreOffice 깔려있어야 함 (mac: brew install libreoffice)
npm run dev
```

```bash
curl -X POST http://localhost:3001/convert?to=pdf \
     -H "content-type: application/octet-stream" \
     -H "x-filename: test.hwp" \
     --data-binary @sample.hwp \
     -o out.pdf
```

## Render 배포 (무료 티어)

1. https://render.com 에서 GitHub 리포 연결
2. "New +" → "Blueprint" → 이 폴더의 [render.yaml](render.yaml)을 자동 인식
3. 환경변수 `HWP_CONVERTER_TOKEN`만 직접 입력 (보안용 무작위 문자열)
4. 첫 빌드 5~10분 (LibreOffice 설치 때문)
5. 배포 후 URL: `https://arch-campus-hwp-converter.onrender.com`

> 무료 티어는 15분 idle이면 sleep → 첫 요청 cold start 30~60초.
> 학생들이 자주 안 올리는 포맷이라 sleep 자체는 문제 없음. 깨우는 게 느릴 뿐.
> 정 거슬리면 cron-job.org 무료 계정으로 10분마다 `/health` 핑 (월 100회 한도).

## Next.js 쪽 연결

Vercel 환경변수에 추가:

```
HWP_CONVERTER_URL=https://arch-campus-hwp-converter.onrender.com
HWP_CONVERTER_TOKEN=<위에서 만든 토큰>
```

`HWP_CONVERTER_URL`이 없으면 HWP 업로드는 자동 거부 + "PDF로 내보내서 다시 올려주세요" 안내. 변환 서비스가 죽거나 시간 초과되면 동일 안내로 fallback.

## 왜 LibreOffice인가

- `hwp.js` (npm) → 2020년 stale, 신규 HWP 속성 누락
- 자바 hwplib → JVM이 컨테이너 안에 또 있어야 함
- LibreOffice는 한컴이 한/글 호환성 합의 → 무료·꽤 정확

## 비용·한계

- Render 무료: 750 시간/월 (한 서비스 항상 켜둘 수 있음)
- 빌드는 무료 한도 내, 도커 이미지 크기 ~700MB
- 변환 1건당 메모리 200~400MB · 시간 5~30초 (HWP 복잡도 따라)
