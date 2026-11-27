-- CODM: سجل السلوك والانضباط والإجراءات التأديبية
-- يتطلب وجود الدالة public.is_club_staff() المستخدمة في إعدادات النادي.
create table if not exists public.discipline_reports (
 id uuid primary key default gen_random_uuid(),
 athlete_id uuid not null references public.athletes(id) on delete cascade,
 incident_date date not null,
 incident_type text not null,
 action text not null,
 start_date date,
 end_date date,
 decision_status text not null default 'مسجل',
 recorded_by_name text,
 reason text not null,
 notes text,
 recorded_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint discipline_action_valid check (action in ('ملاحظة','تنبيه شفهي','إنذار كتابي','حرمان من حصة أو نشاط','إيقاف مؤقت','طرد نهائي','لا إجراء')),
 constraint discipline_dates_valid check (start_date is null or end_date is null or end_date >= start_date)
);
create index if not exists discipline_reports_athlete_date_idx on public.discipline_reports(athlete_id, incident_date desc);
alter table public.discipline_reports enable row level security;
grant select, insert, update, delete on public.discipline_reports to authenticated;
drop policy if exists "CODM staff read discipline reports" on public.discipline_reports;
create policy "CODM staff read discipline reports" on public.discipline_reports for select to authenticated using (public.is_club_staff());
drop policy if exists "CODM staff insert discipline reports" on public.discipline_reports;
create policy "CODM staff insert discipline reports" on public.discipline_reports for insert to authenticated with check (public.is_club_staff());
drop policy if exists "CODM staff update discipline reports" on public.discipline_reports;
create policy "CODM staff update discipline reports" on public.discipline_reports for update to authenticated using (public.is_club_staff()) with check (public.is_club_staff());
drop policy if exists "CODM staff delete discipline reports" on public.discipline_reports;
create policy "CODM staff delete discipline reports" on public.discipline_reports for delete to authenticated using (public.is_club_staff());
