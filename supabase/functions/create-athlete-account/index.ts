// CODM: create/link boxer login and email credentials after membership approval.
// Required Edge Function secrets: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY, CODM_MAILER_URL, CODM_MAILER_SECRET.
// Deploy as: supabase functions deploy create-athlete-account
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function makePassword() {
  const sets = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%*-_",
  ];
  const all = sets.join("");
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = sets.map((set, i) => set[bytes[i] % set.length]);
  for (let i = sets.length; i < bytes.length; i++) chars.push(all[bytes[i] % all.length]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint8Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]!));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const mailerUrl = Deno.env.get("CODM_MAILER_URL");
    const mailerSecret = Deno.env.get("CODM_MAILER_SECRET");
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("إعدادات Supabase السرية غير مكتملة.");
    if (!mailerUrl || !mailerSecret) throw new Error("خدمة Gmail غير مهيأة: يلزم ضبط CODM_MAILER_URL و CODM_MAILER_SECRET.");

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "يلزم تسجيل الدخول." }, 401);
    const token = authorization.slice(7);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "جلسة الدخول غير صالحة." }, 401);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: staff, error: staffError } = await admin
      .from("profiles").select("role").eq("user_id", authData.user.id).maybeSingle();
    if (staffError) throw staffError;
    if (!staff || !["president", "coach"].includes(staff.role)) {
      return json({ error: "غير مخوّل: هذه العملية للطاقم الإداري والفني فقط." }, 403);
    }

    const body = await req.json();
    let athleteId = String(body.athlete_id || "");
    let email = String(body.email || "").trim().toLowerCase();
    let suppliedPassword = typeof body.password === "string" ? body.password : "";
    let athleteName = "";
    let requestId = "";

    if (body.membership_request_id) {
      requestId = String(body.membership_request_id);
      const { data: request, error: requestError } = await admin
        .from("membership_requests")
        .select("id,status,email,athlete_id,full_name")
        .eq("id", requestId).single();
      if (requestError) throw requestError;
      if (request.status !== "approved") throw new Error("لا يمكن إنشاء الحساب قبل قبول طلب الانضمام.");
      if (!request.athlete_id) throw new Error("لم يتم إنشاء البطاقة التقنية لهذا الطلب بعد.");
      athleteId = request.athlete_id;
      email = String(request.email || "").trim().toLowerCase();
      athleteName = request.full_name || "";
    }

    if (!athleteId || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("رقم ملف الملاكم أو البريد الإلكتروني غير صالح.");
    }
    if (suppliedPassword && suppliedPassword.length < 12) {
      throw new Error("كلمة المرور يجب أن تتكون من 12 حرفًا على الأقل.");
    }

    const { data: athlete, error: athleteError } = await admin
      .from("athletes")
      .select("id,athlete_code,full_name,profile_id")
      .eq("id", athleteId).single();
    if (athleteError) throw athleteError;
    athleteName = athlete.full_name || athleteName || "ملاكم CODM";

    let athleteCode = athlete.athlete_code;
    if (!athleteCode) {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const bytes = crypto.getRandomValues(new Uint8Array(7));
      athleteCode = "CODM-" + Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
      const { error: codeError } = await admin.from("athletes")
        .update({ athlete_code: athleteCode }).eq("id", athleteId);
      if (codeError) throw codeError;
    }

    // If this athlete already has a linked account, rotate its password and resend.
    const { data: existingProfile, error: profileLookupError } = await admin
      .from("profiles").select("id,user_id").eq("athlete_id", athleteId).maybeSingle();
    if (profileLookupError) throw profileLookupError;

    const password = suppliedPassword || makePassword();
    let authUserId: string;
    let profileId: string;

    if (existingProfile?.user_id && existingProfile?.id) {
      authUserId = existingProfile.user_id;
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(authUserId, {
        password,
        email,
        email_confirm: true,
        user_metadata: { full_name: athleteName, role: "athlete", athlete_code: athleteCode },
      });
      if (updateAuthError) throw updateAuthError;
      profileId = existingProfile.id;
      const { error: profileUpdateError } = await admin.from("profiles")
        .update({ role: "athlete", full_name: athleteName, username: athleteCode })
        .eq("user_id", authUserId);
      if (profileUpdateError) throw profileUpdateError;
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: athleteName, role: "athlete", athlete_code: athleteCode },
      });
      if (createError) throw createError;
      authUserId = created.user.id;

      let { data: profile, error: profileError } = await admin
        .from("profiles").select("id,user_id").eq("user_id", authUserId).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) {
        const inserted = await admin.from("profiles").insert({
          user_id: authUserId,
          full_name: athleteName,
          username: athleteCode,
          role: "athlete",
          athlete_id: athleteId,
        }).select("id,user_id").single();
        if (inserted.error) throw inserted.error;
        profile = inserted.data;
      } else {
        const { error: profileUpdateError } = await admin.from("profiles")
          .update({ full_name: athleteName, username: athleteCode, role: "athlete", athlete_id: athleteId })
          .eq("user_id", authUserId);
        if (profileUpdateError) throw profileUpdateError;
      }
      profileId = profile.id;
    }

    const { error: linkError } = await admin.from("athletes")
      .update({ profile_id: profileId }).eq("id", athleteId);
    if (linkError) throw linkError;
    const { error: profileLinkError } = await admin.from("profiles")
      .update({ athlete_id: athleteId }).eq("user_id", authUserId);
    if (profileLinkError) throw profileLinkError;

    const siteUrl = Deno.env.get("SITE_URL") || "https://ayatygre-cmyk.github.io/codm-digital-system/";
    const safeName = escapeHtml(athleteName);
    const safeCode = escapeHtml(athleteCode);
    const safeEmail = escapeHtml(email);
    const safePassword = escapeHtml(password);
    const emailText = `مرحبًا ${athleteName}\nتم قبول انضمامك إلى شباب أولمبيك ديدوش مراد للملاكمة.\nرقم CODM: ${athleteCode}\nالبريد الإلكتروني: ${email}\nكلمة المرور: ${password}\nرابط الموقع: ${siteUrl}\nيمكنك الاحتفاظ بكلمة المرور أو تغييرها من حسابك بعد الدخول.\nيرجى عدم مشاركة بيانات الدخول مع أي شخص.`;
    const emailHtml = `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.9;color:#171b22;max-width:620px;margin:auto"><div style="background:#101319;color:white;padding:22px;border-bottom:4px solid #c8a45d"><h2 style="margin:0">شباب أولمبيك ديدوش مراد للملاكمة</h2><p style="margin:5px 0 0">CODM DIGITAL SYSTEM</p></div><div style="padding:22px;border:1px solid #ddd"><h3>مرحبًا ${safeName}</h3><p>تم قبول طلب انضمامك إلى النادي. هذه بيانات الدخول الخاصة بك:</p><p><b>رقم CODM (اسم الدخول):</b> <span dir="ltr">${safeCode}</span><br><b>البريد الإلكتروني:</b> <span dir="ltr">${safeEmail}</span><br><b>كلمة المرور:</b> <span dir="ltr" style="font-size:18px;font-weight:bold">${safePassword}</span></p><p>يمكنك الاحتفاظ بكلمة المرور كما هي أو تغييرها من حسابك بعد تسجيل الدخول.</p><p><a href="${siteUrl}" style="display:inline-block;background:#c51f2b;color:white;padding:12px 20px;text-decoration:none;border-radius:7px">الدخول إلى الموقع</a></p><p style="color:#666;font-size:12px">يرجى الحفاظ على سرية بيانات الدخول وعدم مشاركتها.</p></div></div>`;
    const emailResponse = await fetch(mailerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: mailerSecret,
        to: email,
        subject: "بيانات الدخول إلى نظام CODM DIGITAL SYSTEM",
        text: emailText,
        html: emailHtml,
      }),
    });
    const emailResult = await emailResponse.json().catch(() => ({}));
    if (!emailResponse.ok || !emailResult.success) {
      throw new Error("تم إنشاء الحساب وربطه، لكن فشل إرسال البريد عبر Gmail: " + (emailResult.error || emailResponse.statusText));
    }

    return json({
      success: true,
      athlete_name: athleteName,
      athlete_code: athleteCode,
      email,
      message: "تم إنشاء الحساب وإرسال بيانات الدخول بالبريد الإلكتروني.",
    });
  } catch (error) {
    console.error("create-athlete-account:", error);
    return json({ error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." }, 400);
  }
});
