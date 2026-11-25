-- CODM: إعداد تخزين صور الإعلانات في Supabase
-- نفّذي هذا الملف مرة واحدة من Supabase > SQL Editor > New query > Run

-- إضافة رابط الصورة إلى جدول الإعلانات (إن لم يكن موجوداً)
alter table public.announcements
add column if not exists image_url text;

-- إنشاء حاوية عامة لعرض صور الإعلانات
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('codm-announcements', 'codm-announcements', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- السماح بعرض صور الإعلانات للجميع
 drop policy if exists "CODM announcement images public read" on storage.objects;
create policy "CODM announcement images public read"
on storage.objects for select
using (bucket_id = 'codm-announcements');

-- السماح للرئيس والمدرب المسجلين برفع الصور
 drop policy if exists "CODM staff upload announcement images" on storage.objects;
create policy "CODM staff upload announcement images"
on storage.objects for insert to authenticated
with check (bucket_id = 'codm-announcements' and public.is_club_staff());

-- السماح للرئيس والمدرب بتحديث الصور أو حذفها
 drop policy if exists "CODM staff update announcement images" on storage.objects;
create policy "CODM staff update announcement images"
on storage.objects for update to authenticated
using (bucket_id = 'codm-announcements' and public.is_club_staff())
with check (bucket_id = 'codm-announcements' and public.is_club_staff());

 drop policy if exists "CODM staff delete announcement images" on storage.objects;
create policy "CODM staff delete announcement images"
on storage.objects for delete to authenticated
using (bucket_id = 'codm-announcements' and public.is_club_staff());
