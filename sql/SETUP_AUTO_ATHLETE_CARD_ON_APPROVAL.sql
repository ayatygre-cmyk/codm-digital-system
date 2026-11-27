-- CODM: إنشاء البطاقة التقنية تلقائياً عند قبول طلب الانضمام
-- نفّذي هذا الملف مرة واحدة من Supabase > SQL Editor > New query > Run.
-- لا ينشئ هذا الملف حساب دخول؛ ينشئ سجل الملاكم الذي تظهر منه البطاقة التقنية.

alter table public.membership_requests
  add column if not exists athlete_id uuid references public.athletes(id) on delete set null;

create unique index if not exists athletes_membership_request_unique
  on public.membership_requests(athlete_id)
  where athlete_id is not null;

create or replace function public.codm_create_athlete_card_after_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_athlete_id uuid;
begin
  -- نفّذ فقط عند الانتقال لأول مرة من قيد الانتظار إلى مقبول.
  if new.status = 'approved'
     and (tg_op = 'INSERT' or old.status is distinct from 'approved')
     and new.athlete_id is null then

    insert into public.athletes (
      id,
      full_name,
      birth_date,
      gender,
      category,
      phone,
      guardian,
      guardian_phone,
      notes,
      registration_date,
      active
    )
    values (
      gen_random_uuid(),
      new.full_name,
      new.birth_date,
      new.gender,
      new.category,
      new.phone,
      new.guardian,
      new.guardian_phone,
      new.notes,
      coalesce(new.created_at::date, current_date),
      true
    )
    returning id into new_athlete_id;

    new.athlete_id := new_athlete_id;
  end if;

  return new;
end;
$$;

drop trigger if exists codm_auto_create_athlete_card on public.membership_requests;

create trigger codm_auto_create_athlete_card
before insert or update of status on public.membership_requests
for each row
execute function public.codm_create_athlete_card_after_approval();

-- يمنع تكرار البطاقة للطلب نفسه، حتى لو أعيد إرسال عملية القبول.
