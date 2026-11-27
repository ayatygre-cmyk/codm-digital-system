// CODM: collect applicant/guardian email and automate account invitation after approval.
(() => {
  'use strict';
  const form = document.getElementById('membershipRequestForm');
  if (!form || typeof sb === 'undefined') return;

  // Add the required email field without editing the very large main HTML file.
  if (!form.querySelector('[name="email"]')) {
    const phone = form.querySelector('[name="phone"]');
    const field = document.createElement('div');
    field.innerHTML = '<label for="membershipAccountEmail">البريد الإلكتروني لاستلام حساب الدخول *</label><input id="membershipAccountEmail" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="name@example.com"><small class="muted">للبالغ: بريد الملاكم. للقاصر: بريد ولي الأمر، وسيُرسل إليه رابط تعيين كلمة المرور.</small>';
    if (phone && phone.parentElement) phone.parentElement.insertAdjacentElement('afterend', field);
    else form.querySelector('.grid')?.prepend(field);
  }

  // Attach the email to the existing membership_requests insert payload.
  if (!sb.__codmEmailInsertPatched) {
    const originalFrom = sb.from.bind(sb);
    sb.from = function (table, ...args) {
      const query = originalFrom(table, ...args);
      if (table === 'membership_requests' && typeof query.insert === 'function') {
        const originalInsert = query.insert.bind(query);
        query.insert = (values, options) => {
          const email = String(form.querySelector('[name="email"]')?.value || '').trim().toLowerCase();
          const attach = row => ({ ...row, email });
          const payload = Array.isArray(values) ? values.map(attach) : attach(values);
          return originalInsert(payload, options);
        };
      }
      return query;
    };
    sb.__codmEmailInsertPatched = true;
  }

  // Replace the old approval message with the full create-account + password-setup flow.
  window.reviewMembershipRequest = async function (id, status) {
    if (!codmUser || !['approved', 'rejected'].includes(status)) return;
    if (status === 'rejected') {
      const oldReview = window.__codmOriginalReviewMembershipRequest;
      if (typeof oldReview === 'function') return oldReview(id, status);
      const { error } = await sb.from('membership_requests')
        .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: codmUser.id }).eq('id', id);
      if (error) return alert('تعذر رفض الطلب: ' + error.message);
      await loadMembershipRequests();
      return alert('تم رفض الطلب.');
    }

    if (!confirm('هل تريدين قبول الطلب وإنشاء البطاقة التقنية وحساب الدخول تلقائياً؟')) return;
    try {
      const { error: updateError } = await sb.from('membership_requests')
        .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: codmUser.id })
        .eq('id', id);
      if (updateError) throw updateError;

      // The database trigger creates the athlete row and writes athlete_id on approval.
      const { data: request, error: requestError } = await sb.from('membership_requests')
        .select('id,full_name,email,athlete_id').eq('id', id).single();
      if (requestError) throw requestError;
      if (!request.athlete_id) throw new Error('لم تُنشأ البطاقة التقنية تلقائياً. تحققي من إعداد SQL الخاص بقبول الطلبات.');

      const email = String(request.email || '').trim().toLowerCase();
      if (!email) {
        await loadMembershipRequests();
        return alert('قُبل الطلب وأُنشئت البطاقة، لكن لا يوجد بريد إلكتروني. أنشئي الحساب من قسم حسابات الملاكمين.');
      }

      const temporaryPassword = crypto.randomUUID() + 'Aa9!';
      const { error: accountError } = await sb.functions.invoke('create-athlete-account', {
        body: { athlete_id: request.athlete_id, email, password: temporaryPassword }
      });
      if (accountError) {
        let detail = accountError.message || String(accountError);
        try { const body = await accountError.context?.json?.(); if (body?.error) detail = body.error; } catch (_) {}
        throw new Error('تم القبول وإنشاء البطاقة، لكن تعذر إنشاء حساب الدخول: ' + detail + '. راجعي قسم حسابات الملاكمين.');
      }

      const redirectTo = new URL('reset-password.html', window.location.href).toString();
      const { error: emailError } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
      await loadMembershipRequests();

      if (emailError) {
        return alert('تم إنشاء حساب الملاكم وربطه ببطاقته، لكن تعذر إرسال رابط كلمة المرور: ' + emailError.message + '. يمكن استخدام «نسيت كلمة المرور؟» من صفحة الدخول لإعادة إرسال الرابط.');
      }
      alert('تم قبول الطلب وإنشاء البطاقة التقنية وحساب الدخول. أُرسل رابط تعيين كلمة المرور إلى: ' + email);
    } catch (error) {
      await loadMembershipRequests();
      alert((error.message || 'حدث خطأ غير متوقع') + '\nملاحظة: إذا تم قبول الطلب بالفعل فقد تكون البطاقة التقنية قد أُنشئت. لا تعيدي إنشاء ملف الملاكم؛ راجعي قسم حسابات الملاكمين.');
    }
  };
})();
