-- CODM: بريد حساب الدخول لطلبات الانضمام
-- نفّذي هذا الملف مرة واحدة في Supabase > SQL Editor > New query > Run.
-- للقاصر يُسجّل بريد ولي الأمر، وللبالغ بريد الملاكم.
alter table public.membership_requests
  add column if not exists email text;

-- لا نفرض NOT NULL حتى تبقى الطلبات القديمة قابلة للقراءة والمراجعة.
create index if not exists membership_requests_email_idx
  on public.membership_requests (lower(email))
  where email is not null;
