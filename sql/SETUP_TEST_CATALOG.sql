-- CODM: قائمة اختبارات قابلة للتعديل حسب الفئة الرياضية
-- شغّلي هذا الملف مرة واحدة في Supabase > SQL Editor > Run.

create table if not exists public.test_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit text,
  category text,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.test_definitions enable row level security;
grant select, insert, update, delete on public.test_definitions to authenticated;

drop policy if exists "CODM staff read test definitions" on public.test_definitions;
create policy "CODM staff read test definitions"
on public.test_definitions for select to authenticated
using (public.is_club_staff());

drop policy if exists "CODM staff insert test definitions" on public.test_definitions;
create policy "CODM staff insert test definitions"
on public.test_definitions for insert to authenticated
with check (public.is_club_staff());

drop policy if exists "CODM staff update test definitions" on public.test_definitions;
create policy "CODM staff update test definitions"
on public.test_definitions for update to authenticated
using (public.is_club_staff()) with check (public.is_club_staff());

drop policy if exists "CODM staff delete test definitions" on public.test_definitions;
create policy "CODM staff delete test definitions"
on public.test_definitions for delete to authenticated
using (public.is_club_staff());

-- إضافة الجري 1000م كوحدة ثوانٍ كاختبار عام أولي.
-- يمكن للرئيس أو المدرب لاحقاً تخصيصه لفئة واحدة أو إيقافه أو حذفه من لوحة الإدارة.
insert into public.test_definitions (name, unit, category, is_active)
select 'الجري 1000م', 'ثانية', null, true
where not exists (
  select 1 from public.test_definitions
  where name = 'الجري 1000م' and category is null
);
