import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  question_id: z.string().uuid(),
  attempt_id: z.string().uuid(),
});

export const explainAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => schema.parse(data))
  .handler(async ({ data, context }) => {
    // AI explanations are a paid feature: require an active subscription (or admin),
    // exactly like start_attempt does. Never trust the disabled state of the UI button.
    // The role/subscription helpers are not callable by signed-in users through the API,
    // so they are evaluated here with the trusted service-role client for the verified caller.
    const { supabaseAdmin: authzAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: isAdmin }, { data: hasSub }] = await Promise.all([
      authzAdmin.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      authzAdmin.rpc("has_active_subscription", { _user_id: context.userId }),
    ]);
    if (!isAdmin && !hasSub) {
      throw new Error("اشتراک شما فعال نیست. برای استفاده از توضیح هوش مصنوعی اشتراک تهیه کنید");
    }

    // The caller must own a finished attempt that actually contains this question.
    // RLS on exam_attempts/attempt_answers scopes these reads to the current user.
    const { data: attempt, error: attemptError } = await context.supabase
      .from("exam_attempts")
      .select("id, exam_id, status")
      .eq("id", data.attempt_id)
      .maybeSingle();
    if (attemptError) throw new Error("خطا در بررسی دسترسی");
    if (!attempt) throw new Error("دسترسی مجاز نیست");
    if (attempt.status === "in_progress") throw new Error("این آزمون هنوز به پایان نرسیده است");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: examQuestion } = await supabaseAdmin
      .from("exam_questions")
      .select("question_id")
      .eq("exam_id", attempt.exam_id)
      .eq("question_id", data.question_id)
      .maybeSingle();
    if (!examQuestion) throw new Error("سوال متعلق به این آزمون نیست");

    // Question text, options and the correct answer come from the database,
    // never from client-supplied values.
    const { data: question } = await supabaseAdmin
      .from("questions")
      .select("id, question_text")
      .eq("id", data.question_id)
      .maybeSingle();
    if (!question) throw new Error("سوال یافت نشد");

    const { data: options } = await supabaseAdmin
      .from("question_options")
      .select("id, option_text, is_correct, display_order")
      .eq("question_id", data.question_id)
      .order("display_order");

    const allOptions = options ?? [];
    const correctOption = allOptions.find((o) => o.is_correct);

    const { data: answer } = await supabaseAdmin
      .from("attempt_answers")
      .select("selected_option_id")
      .eq("attempt_id", attempt.id)
      .eq("question_id", data.question_id)
      .maybeSingle();
    const selectedOption = allOptions.find((o) => o.id === answer?.selected_option_id);

    // AI settings managed from the admin panel (provider / model / API key).
    const { data: settings } = await supabaseAdmin
      .from("ai_settings")
      .select("provider, model, api_key, cache_enabled")
      .maybeSingle();

    const cacheEnabled = settings?.cache_enabled ?? true;
    const questionId = data.question_id;

    // 1) Serve a previously generated explanation without calling the AI again.
    if (cacheEnabled) {
      const { data: cached } = await supabaseAdmin
        .from("ai_explanations")
        .select("explanation")
        .eq("question_id", questionId)
        .maybeSingle();
      if (cached?.explanation) {
        return { explanation: cached.explanation, cached: true };
      }
    }

    const useCustomKey = settings?.provider === "custom" && !!settings.api_key;
    const apiKey = useCustomKey ? settings!.api_key! : process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("سرویس هوش مصنوعی پیکربندی نشده است");
    const model = settings?.model || "google/gemini-3.5-flash";

    const prompt = [
      `سوال: ${question.question_text}`,
      `گزینه‌ها: ${allOptions.map((o, i) => `${i + 1}) ${o.option_text}`).join(" | ")}`,
      `پاسخ صحیح: ${correctOption?.option_text ?? ""}`,
      selectedOption
        ? `پاسخ داوطلب: ${selectedOption.option_text}`
        : "داوطلب به این سوال پاسخ نداده است.",
      "در حداکثر ۴ جمله و به زبان فارسی توضیح بده چرا پاسخ صحیح درست است و اشتباه رایج چیست.",
    ].join("\n");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: "تو یک مدرس آموزشی فارسی‌زبان و دقیق هستی." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`AI gateway error (${res.status}): ${body.slice(0, 500)}`);
      if (res.status === 429) throw new Error("تعداد درخواست‌ها زیاد است، کمی بعد تلاش کنید");
      if (res.status === 402) throw new Error("اعتبار سرویس هوش مصنوعی کافی نیست");
      throw new Error("خطا در ارتباط با سرویس هوش مصنوعی");
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const explanation = json.choices?.[0]?.message?.content ?? "";

    // 2) Store it so the next candidate gets it instantly, for free.
    if (cacheEnabled && explanation) {
      const { error: cacheError } = await supabaseAdmin
        .from("ai_explanations")
        .upsert({ question_id: questionId, explanation, model }, { onConflict: "question_id" });
      if (cacheError) console.error("ai_explanations upsert failed:", cacheError.message);
    }

    return { explanation, cached: false };
  });
