import { getServiceSupabase } from "./lib/shared.js";

const ALLOWED = new Set([
  "attendance",
  "tasks",
  "debtors",
  "warehouse",
  "sales_facts",
]);

export default async (req: Request) => {
  const url = new URL(req.url);
  const table = url.searchParams.get("table") ?? "attendance";
  if (!ALLOWED.has(table)) {
    return new Response(
      JSON.stringify({
        error: `Таблица должна быть одной из: ${[...ALLOWED].join(", ")}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const admin = getServiceSupabase();
  const { data: rows, error } = await admin.from(table).select("*");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!rows?.length) {
    return new Response(JSON.stringify({ error: "Нет данных" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => String((row as Record<string, unknown>)[h] ?? "")).join(","),
    ),
  ];
  const content = "\ufeff" + lines.join("\r\n");
  const today = new Date().toISOString().slice(0, 10);

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=${table}_${today}.csv`,
    },
  });
};
