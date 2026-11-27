// CODM: collect applicant/guardian email and safely complete approval onboarding.
(() => {
  'use strict';
  const form = document.getElementById('membershipRequestForm');
  if (!form || typeof sb === 'undefined') return;

  // Capture the email used to deliver the athlete's sign-in setup link.
  if (!form.querySelector('[name="email"]')) {
    const phone = form.querySelector('[name="phone"]');
    const field = document.createElement('div');
    field.innerHTML = '<label for="membershipAccountEmail">البريد الإلكتروني لاستلام حساب الدخول *</label><input id="membershipAccountEmail" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="name@example.com"><small class="muted">للبالغ: بريد الملاكم. للقاصر: بريد ولي الأمر، وسيُرسل إليه رابط تعيين كلمة المرور.</small>';
    if (phone && phone.parentElement) phone.parentElement.insertAdjacentElement('afterend', field);
    else form.querySelector('.grid')?.prepend(field);
  }

  // Add the email to the existing insert payload without rewriting index.html.
  if (!sb.__codmEmailInsertPatched) {
    const originalFrom = sb.from.bind(sb);
    sb.from = function (table, ...args) {
      const query = originalFrom(table, ...args);
      if (table === 'membership_requests' && typeof query.insert === 'function') {
        const originalInsert = query.insert.bind(query);
        query.insert = (values, options) => {
          const email = String(form.querySelector('[name="email"]')?.value || '').trim().toLowerCase();
          const attach = row => ({ ...row, email });
          return originalInsert(Array.isArray(values) ? values.map(attach) : attach(values), options);
        };
      }
      return query;
    };
    sb.__codmEmailInsertPatched = true;
  }

  async function refreshRequests() {
    if (typeof loadMembershipRequests === 'function') await loadMembershipRequests();
  }

  window.reviewMembershipRequest = async function (id, status) {
    if (!codmUser || !['approved', 'rejected'].includes(status)) return;
    if (!confirm(status === 'approved'
      ? 'هل تريدين قبول الطلب وإنشاء البطاقة التقنية وحساب الدخول تلقائياً؟'
      : 'هل تريدين رفض طلب الانضمام؟')) return;

    try {
      // Read first, then transition only pending requests. This avoids duplicate cards
      // when a user double-clicks or retries after a partial failure.
      let { data: request, error } = await sb.from('membership_requests')
        .select('id,full_name,email,athlete_id,status')
        .eq('id', id).single();
      if (error) throw error;

      if (status === 'rejected') {
        if (request.status !== 'pending') throw new Error('تمت معالجة هذا الطلب مسبقاً.');
        const result = await sb.from('membership_requests')
          .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: codmUser.id })
          .eq('id', id).eq('status', 'pending').select('id');
        if (result.error) throw result.error;
        if (!result.data?.length) throw new Error('تغيرت حالة الطلب قبل تنفيذ الرفض. حدّثي القائمة.');
        await refreshRequests();
        alert('تم رفض الطلب.');
        return;
      }

      if (request.status === 'pending') {
        const result = await sb.from('membership_requests')
          .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: codmUser.id })
          .eq('id', id).eq('status', 'pending').select('id');
        if (result.error) throw result.error;
        if (!result.data?.length) throw new Error('تغيرت حالة الطلب قبل تنفيذ القبول. حدّثي القائمة.');
        const refreshed = await sb.from('membership_requests')
          .select('id,full_name,email,athlete_id,status').eq('id', id).single();
        if (refreshed.error) throw refreshed.error;
        request = refreshed.data;
      }

      if (request.status !== 'approved') throw new Error('حالة الطلب ليست «مقبول».');
      if (!request.athlete_id) throw new Error('تم قبول الطلب لكن لم تُنشأ البطاقة التقنية. تأكدي من تنفيذ SETUP_AUTO_ATHLETE_CARD_ON_APPROVAL.sql في Supabase.');

      const email = String(request.email || '').trim().toLowerCase();
      if (!email) throw new Error('لا يوجد بريد إلكتروني في الطلب. أضيفي البريد من قسم حسابات الملاكمين قبل إنشاء الحساب.');

      // The Edge Function must create the Auth user and link profiles.athlete_id.
      const temporaryPassword = crypto.randomUUID() + 'Aa9!';
      const { error: accountError } = await sb.functions.invoke('create-athlete-account', {
        body: { athlete_id: request.athlete_id, email, password: temporaryPassword }
      });
      if (accountError) {
        let detail = accountError.message || String(accountError);
        try { const body = await accountError.context?.json?.(); if (body?.error) detail = body.error; } catch (_) {}
        throw new Error('تم قبول الطلب وإنشاء البطاقة، لكن تعذر إنشاء حساب الدخول: ' + detail + '. استخدمي قسم حسابات الملاكمين لاستكمال الربط.');
      }

      const redirectTo = new URL('reset-password.html', window.location.href).toString();
      const { error: emailError } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      await refreshRequests();

      if (emailError) {
        alert('تم إنشاء الحساب وربطه بالبطاقة، لكن تعذر إرسال رابط كلمة المرور: ' + emailError.message + '. يمكن إعادة الإرسال من «نسيت كلمة المرور؟».');
      } else {
        alert('تم قبول الطلب وإنشاء البطاقة التقنية وحساب الدخول. أُرسل رابط تعيين كلمة المرور إلى: ' + email);
      }
    } catch (error) {
      await refreshRequests();
      alert((error.message || 'حدث خطأ غير متوقع') + '\nإذا كان الطلب قد أصبح مقبولاً، لا تعيدي إنشاء بطاقة جديدة؛ تحققي من قسم حسابات الملاكمين ومن ربط الحساب.');
    }
  };
})();
