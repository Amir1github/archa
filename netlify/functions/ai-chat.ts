import { getServiceSupabase, jsonResponse, parseBody } from "./lib/shared.js";

interface ChatMessage {
  role: string;
  content: string;
}

export default async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ?? "";
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "";
  if (!baseUrl || !apiKey) {
    return jsonResponse({ detail: "AI интеграция не настроена" }, 503);
  }

  const { messages } = await parseBody<{ messages: ChatMessage[] }>(req);
  const admin = getServiceSupabase();

  const [{ count: empCount }, { count: taskCount }, { data: debtors }] =
    await Promise.all([
      admin.from("employees").select("*", { count: "exact", head: true }),
      admin.from("tasks").select("*", { count: "exact", head: true }),
      admin.from("debtors").select("name, debt, overdue_days").limit(20),
    ]);

  const systemPrompt = `Ты AI-ассистент компании «Пойтахт» (Душанбе, мебель/интерьер).
Сотрудников: ${empCount ?? 0}, задач: ${taskCount ?? 0}.
Топ дебиторов: ${JSON.stringify(debtors ?? [])}
Отвечай кратко на русском.`;

  const contents = (messages ?? []).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const geminiUrl = `${baseUrl.replace(/\/$/, "")}/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return jsonResponse({ detail: `Ошибка AI: ${errText.slice(0, 200)}` }, 500);
  }

  const data = await res.json();
  const answer =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Не удалось получить ответ.";

  return jsonResponse({ response: answer, model: "gemini-2.5-flash" });
};
