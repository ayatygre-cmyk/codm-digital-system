-- CODM: تأمين سجل الاشتراكات والمبالغ المالية
-- يشغّل مرة واحدة من Supabase > SQL Editor.
-- لا يحذف أو يعدّل أي سجل مالي؛ يقيّد الوصول إلى الرئيس والمدربين فقط.

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- إزالة أي سياسة قديمة واسعة (مثل السماح للجميع بالقراءة أو الكتابة)
-- حتى لا تتجاوز السياسات permissive سياسة الطاقم أدناه.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'memberships'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.memberships', policy_row.policyname);
  END LOOP;
END
$$;

REVOKE ALL ON TABLE public.memberships FROM anon;
REVOKE ALL ON TABLE public.memberships FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.memberships TO authenticated;

CREATE POLICY "CODM staff manage memberships"
ON public.memberships
FOR ALL
TO authenticated
USING (public.is_club_staff())
WITH CHECK (public.is_club_staff());

-- ملاحظة: حساب الملاكم لا يحتاج قراءة جدول الاشتراكات مباشرة.
-- كشف المبالغ يبقى متاحاً للطاقم فقط إلى أن يضاف عرض ذاتي آمن ومحدود.
