import { getServiceSupabase, jsonResponse, parseBody } from "./_shared.js";

async function getSettings(admin: ReturnType<typeof getServiceSupabase>) {
  const { data } = await admin
    .from("settings")
    .select("key, value")
    .in("key", ["last_1c_sync", "onec_url", "onec_user", "onec_pass", "sync_interval"]);
  const cfg: Record<string, string> = {};
  for (const row of data ?? []) {
    cfg[row.key] = row.value ?? "";
  }
  return cfg;
}

async function upsertSetting(
  admin: ReturnType<typeof getServiceSupabase>,
  key: string,
  value: string,
) {
  await admin.from("settings").upsert({ key, value, updated: new Date().toISOString() });
}

async function syncFrom1c(admin: ReturnType<typeof getServiceSupabase>, triggered: string) {
  const cfg = await getSettings(admin);
  const url = (cfg.onec_url || process.env.ONEC_URL || "").replace(/\/$/, "");
  const user = cfg.onec_user || process.env.ONEC_USER || "Администратор";
  const pass = cfg.onec_pass || process.env.ONEC_PASS || "";
  if (!url) return { ok: false, message: "1С не настроена" };

  const { data: logRow } = await admin
    .from("sync_log")
    .insert({ triggered, status: "running" })
    .select("id")
    .single();

  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}` };
  const synced: string[] = [];
  const errors: string[] = [];
  let total = 0;

  async function fetchJson(path: string) {
    const res = await fetch(`${url}${path}`, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  try {
    try {
      const debtors = await fetchJson("/debtors/list");
      if (Array.isArray(debtors)) {
        for (const d of debtors) {
          await admin.from("debtors").upsert({
            id: d.id ?? "",
            name: d.name ?? "",
            inn: d.inn ?? "",
            manager_id: d.managerId ?? 1,
            debt: d.debt ?? 0,
            overdue_days: d.overdueDays ?? 0,
            due_date: d.dueDate ?? "",
            invoice_date: d.invoiceDate ?? "",
            last_payment: d.lastPayment ?? "",
            source: "1c",
            updated_at: new Date().toISOString(),
          });
        }
        synced.push(`Дебиторы (${debtors.length})`);
        total += debtors.length;
      }
    } catch (e) {
      errors.push(`Дебиторы: ${String(e).slice(0, 80)}`);
    }

    try {
      const wh = await fetchJson("/warehouse/remains");
      if (Array.isArray(wh)) {
        for (const item of wh) {
          await admin.from("warehouse").upsert({
            id: item.id ?? "",
            name: item.name ?? "",
            sku: item.sku ?? "",
            category: item.category ?? "Прочее",
            qty: item.qty ?? 0,
            unit: item.unit ?? "шт",
            min_qty: item.minQty ?? 0,
            price: item.price ?? 0,
            warehouse_name: item.warehouse ?? "Склад №1",
            supplier: item.supplier ?? "",
            source: "1c",
            updated_at: new Date().toISOString(),
          });
        }
        synced.push(`Склад (${wh.length})`);
        total += wh.length;
      }
    } catch (e) {
      errors.push(`Склад: ${String(e).slice(0, 80)}`);
    }

    await upsertSetting(admin, "last_1c_sync", new Date().toISOString());
    if (logRow?.id) {
      await admin
        .from("sync_log")
        .update({
          status: errors.length ? "partial" : "ok",
          finished_at: new Date().toISOString(),
          modules: synced.join(", "),
          errors: errors.join("; "),
          records: total,
        })
        .eq("id", logRow.id);
    }
    return { ok: true, synced, errors, records: total };
  } catch (e) {
    if (logRow?.id) {
      await admin
        .from("sync_log")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          errors: String(e),
        })
        .eq("id", logRow.id);
    }
    throw e;
  }
}

export default async (req: Request) => {
  const url = new URL(req.url);
  let sub = url.pathname.split("/sync-1c/")[1] ?? "";
  if (!sub && url.pathname.includes("/sync/")) {
    sub = url.pathname.split("/sync/")[1] ?? "status";
  }
  sub = sub.replace(/^\//, "");

  try {
    const admin = getServiceSupabase();

    if (req.method === "GET" && (sub === "status" || sub === "")) {
      const cfg = await getSettings(admin);
      const { data: logs } = await admin
        .from("sync_log")
        .select("id, started_at, finished_at, status, modules, errors, records, triggered")
        .order("id", { ascending: false })
        .limit(20);
      const { data: running } = await admin
        .from("sync_log")
        .select("id")
        .eq("status", "running")
        .maybeSingle();
      const onecUrl = cfg.onec_url || process.env.ONEC_URL || "";
      return jsonResponse({
        last_sync: cfg.last_1c_sync,
        onec_configured: Boolean(onecUrl),
        onec_url: onecUrl,
        onec_url_display: onecUrl.length > 40 ? onecUrl.slice(0, 40) + "..." : onecUrl,
        onec_user: cfg.onec_user || process.env.ONEC_USER,
        sync_interval: parseInt(cfg.sync_interval || "600", 10),
        is_running: Boolean(running),
        logs: logs ?? [],
      });
    }

    if (req.method === "POST" && sub === "1c") {
      const result = await syncFrom1c(admin, "manual");
      return jsonResponse({ ok: true, message: "Синхронизация завершена", ...result });
    }

    if (req.method === "POST" && sub === "1c/test") {
      const cfg = await parseBody<{ url: string; user: string; password: string }>(req);
      if (!cfg.url) return jsonResponse({ ok: false, message: "URL не указан" }, 400);
      const base = cfg.url.replace(/\/$/, "");
      const auth = Buffer.from(`${cfg.user}:${cfg.password}`).toString("base64");
      const candidates = [base, `${base}/ping`];
      let lastStatus: number | null = null;
      for (const u of candidates) {
        try {
          const res = await fetch(u, {
            headers: { Authorization: `Basic ${auth}` },
            signal: AbortSignal.timeout(10000),
          });
          lastStatus = res.status;
          if ([200, 201, 204].includes(res.status)) {
            return jsonResponse({ ok: true, message: `Подключение успешно (HTTP ${res.status})` });
          }
          if ([401, 403].includes(res.status)) {
            return jsonResponse({
              ok: false,
              message: `Неверный логин или пароль (HTTP ${res.status})`,
            });
          }
          if (res.status !== 404) {
            return jsonResponse({ ok: true, message: `Сервер отвечает (HTTP ${res.status})` });
          }
        } catch {
          continue;
        }
      }
      if (lastStatus === 404) {
        return jsonResponse({ ok: false, message: "HTTP 404 — URL не найден" });
      }
      return jsonResponse({ ok: false, message: "Не удалось подключиться к серверу 1С" });
    }

    if (req.method === "PUT" && sub === "1c/config") {
      const cfg = await parseBody<{
        url: string;
        user: string;
        password: string;
        interval: number;
      }>(req);
      await upsertSetting(admin, "onec_url", cfg.url.replace(/\/$/, ""));
      await upsertSetting(admin, "onec_user", cfg.user);
      await upsertSetting(admin, "onec_pass", cfg.password);
      await upsertSetting(admin, "sync_interval", String(cfg.interval ?? 600));
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: "Not found" }, 404);
  } catch (e) {
    return jsonResponse({ error: String(e) }, 500);
  }
};
