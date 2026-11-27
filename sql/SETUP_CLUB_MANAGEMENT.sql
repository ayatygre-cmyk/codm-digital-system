-- صلاحيات إدارة اختبارات وتقييمات الملاكمين للرئيس والمدربين
-- يعتمد على الدالة الموجودة public.is_club_staff()
alter table public.progress enable row level security;
grant select, insert, update, delete on public.progress to authenticated;
drop policy if exists "CODM staff read progress" on public.progress;
create policy "CODM staff read progress" on public.progress for select to authenticated using (public.is_club_staff());
drop policy if exists "CODM staff insert progress" on public.progress;
create policy "CODM staff insert progress" on public.progress for insert to authenticated with check (public.is_club_staff());
drop policy if exists "CODM staff update progress" on public.progress;
create policy "CODM staff update progress" on public.progress for update to authenticated using (public.is_club_staff()) with check (public.is_club_staff());
drop policy if exists "CODM staff delete progress" on public.progress;
create policy "CODM staff delete progress" on public.progress for delete to authenticated using (public.is_club_staff());
-- سياسات طلبات الانضمام موجودة في SETUP_PUBLIC_REQUESTS.sql.
