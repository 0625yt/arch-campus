

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materials',
  'materials',
  false,
  26214400, -- 25MB (parsers/types.ts MAX_PARSE_BYTES와 일치)
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/x-hwp',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 경로 규칙: <user_id>/<material_id>.<ext>
-- 첫 path segment가 본인 user_id일 때만 read/write 가능

create policy "materials_storage_read_own" on storage.objects
  for select using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "materials_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "materials_storage_update_own" on storage.objects
  for update using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "materials_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
