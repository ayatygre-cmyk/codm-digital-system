// CODM: create/link boxer login and email credentials after membership approval.
// Required Edge Function secrets: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY. Supabase Auth sends invitation/recovery emails.
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
    if (!supabaseUrl || !anonKey || !serviceKey) throw new Error("إعدادات Supabase السرية غير مكتملة.");

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

    const siteUrl = Deno.env.get("SITE_URL") || "https://ayatygre-cmyk.github.io/codm-digital-system/";
    let authUserId: string;
    let profileId: string;

    if (existingProfile?.user_id && existingProfile?.id) {
      authUserId = existingProfile.user_id;
      const { data: currentAuth, error: currentAuthError } = await admin.auth.admin.getUserById(authUserId);
      if (currentAuthError) throw currentAuthError;
      if ((currentAuth.user.email || "").toLowerCase() !== email) {
        const { error: emailUpdateError } = await admin.auth.admin.updateUserById(authUserId, {
          email,
          email_confirm: false,
        });
        if (emailUpdateError) throw emailUpdateError;
      }
      profileId = existingProfile.id;
      const { error: profileUpdateError } = await admin.from("profiles")
        .update({ role: "athlete", full_name: athleteName, username: athleteCode })
        .eq("user_id", authUserId);
      if (profileUpdateError) throw profileUpdateError;

      const { error: recoveryError } = await userClient.auth.resetPasswordForEmail(email, {
        redirectTo: siteUrl,
      });
      if (recoveryError) throw recoveryError;
    } else {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: siteUrl,
        data: { full_name: athleteName, role: "athlete", athlete_code: athleteCode },
      });
      if (inviteError) throw inviteError;
      if (!invited.user) throw new Error("لم يُرجع Supabase حسابًا بعد إرسال دعوة التفعيل.");
      authUserId = invited.user.id;

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

    return json({
      success: true,
      athlete_name: athleteName,
      athlete_code: athleteCode,
      email,
      message: "تم إرسال رابط التفعيل أو استعادة كلمة المرور إلى البريد الإلكتروني المسجل.",
    });
  } catch (error) {
    console.error("create-athlete-account:", error);
    return json({ error: error instanceof Error ? error.message : "حدث خطأ غير متوقع." }, 400);
  }
});
