-- CODM: مساحة خاصة لصور طلبات الانضمام.
-- الصور ليست عامة؛ لا يستطيع عرضها إلا الرئيس والمدرب بعد تسجيل الدخول.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('codm-membership-photos', 'codm-membership-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "CODM membership photos applicant upload" on storage.objects;
create policy "CODM membership photos applicant upload"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'codm-membership-photos'
  and (storage.foldername(name))[1] = 'requests'
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
);

drop policy if exists "CODM membership photos staff read" on storage.objects;
create policy "CODM membership photos staff read"
on storage.objects for select to authenticated
using (bucket_id = 'codm-membership-photos' and public.is_club_staff());

drop policy if exists "CODM membership photos staff delete" on storage.objects;
create policy "CODM membership photos staff delete"
on storage.objects for delete to authenticated
using (bucket_id = 'codm-membership-photos' and public.is_club_staff());
