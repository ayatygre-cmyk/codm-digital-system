-- CODM V5: إعداد الإعلانات العامة وطلبات الانضمام
-- نفّذي هذا الملف مرة واحدة من Supabase > SQL Editor > New query > Run

-- يسمح للزوار بقراءة الإعلانات المنشورة فقط (لا توجد بيانات شخصية في هذا الجدول).
grant select on public.announcements to anon;
drop policy if exists "CODM public read announcements" on public.announcements;
create policy "CODM public read announcements"
on public.announcements for select to anon
using (true);

-- جدول مستقل لطلبات الانضمام؛ لا تُضاف الطلبات مباشرة إلى جدول athletes.
create table if not exists public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  birth_date date not null,
  gender text,
  category text,
  phone text,
  guardian text,
  guardian_phone text,
  notes text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id)
);

alter table public.membership_requests enable row level security;
grant insert on public.membership_requests to anon, authenticated;
grant select, update on public.membership_requests to authenticated;

drop policy if exists "CODM public submit membership request" on public.membership_requests;
create policy "CODM public submit membership request"
on public.membership_requests for insert to anon, authenticated
with check (status = 'pending' and reviewed_at is null and reviewed_by is null);

drop policy if exists "CODM staff read membership requests" on public.membership_requests;
create policy "CODM staff read membership requests"
on public.membership_requests for select to authenticated
using (public.is_club_staff());

drop policy if exists "CODM staff update membership requests" on public.membership_requests;
create policy "CODM staff update membership requests"
on public.membership_requests for update to authenticated
using (public.is_club_staff())
with check (public.is_club_staff());

-- لا توجد سياسة حذف للزوار. الإدارة تراجع الطلبات من لوحة Supabase حالياً.
