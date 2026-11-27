-- CODM: ربط حساب كل ملاكم بملفه التقني وتأمين العرض الذاتي
-- نفّذي هذا الملف مرة واحدة في Supabase > SQL Editor.

alter table public.profiles
  add column if not exists athlete_id uuid references public.athletes(id) on delete set null;

create unique index if not exists profiles_athlete_id_unique
  on public.profiles(athlete_id) where athlete_id is not null;

grant select on public.athletes to authenticated;
grant select on public.progress to authenticated;

-- كل ملاكم يقرأ ملفه الرياضي المرتبط بحسابه فقط.
drop policy if exists "CODM athlete read own athlete card" on public.athletes;
create policy "CODM athlete read own athlete card"
on public.athletes for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'athlete'
      and p.athlete_id = athletes.id
  )
);

-- كل ملاكم يقرأ تقييماته هو فقط.
drop policy if exists "CODM athlete read own progress" on public.progress;
create policy "CODM athlete read own progress"
on public.progress for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'athlete'
      and p.athlete_id = progress.athlete_id
  )
);

-- دالة آمنة لربط الحساب بالملف: الرئيس والمدرب فقط.
create or replace function public.codm_link_athlete_account(
  p_user_id uuid,
  p_athlete_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_club_staff() then
    raise exception 'غير مخوّل: هذه العملية للطاقم الفني والإداري فقط';
  end if;
  if not exists (select 1 from public.athletes a where a.id = p_athlete_id) then
    raise exception 'ملف الملاكم غير موجود';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_user_id and p.role = 'athlete') then
    raise exception 'الحساب غير موجود أو ليس حساب ملاكم';
  end if;
  update public.profiles set athlete_id = p_athlete_id where user_id = p_user_id;
  if not found then
    raise exception 'تعذر العثور على ملف الحساب';
  end if;
end;
$$;

revoke all on function public.codm_link_athlete_account(uuid,uuid) from public;
grant execute on function public.codm_link_athlete_account(uuid,uuid) to authenticated;
