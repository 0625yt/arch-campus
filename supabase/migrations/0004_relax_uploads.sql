-- 자료 업로드 한계 완화 — 사용자가 올리면 무조건 결과 나오게.
-- 60MB로 키우고 mime 화이트리스트 제거(어떤 형식이든 받음).

update storage.buckets
set
  file_size_limit = 62914560, -- 60MB (parsers/types.ts MAX_PARSE_BYTES와 일치)
  allowed_mime_types = null    -- 모든 형식 허용. 파서 라우터가 알아서 분기·폴백.
where id = 'materials';
