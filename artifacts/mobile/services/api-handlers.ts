import { stripEmployeePin } from "@workspace/supabase";

import { getSupabase } from "@/lib/supabase-client";
import type { Employee } from "@/types";

/** Supabase возвращает boolean; UI ожидает 0/1 как в SQLite */
function normalizeEmployee(row: Record<string, unknown>): Employee {
  const e = stripEmployeePin(row) as Record<string, unknown>;
  return {
    ...(e as Employee),
    is_hr: e.is_hr ? 1 : 0,
    is_admin: e.is_admin ? 1 : 0,
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const dφ = ((lat2 - lat1) * Math.PI) / 180;
  const dλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parsePath(path: string): { base: string; params: Record<string, string> } {
  const [pathname, qs] = path.split("?");
  const params: Record<string, string> = {};
  if (qs) {
    new URLSearchParams(qs).forEach((v, k) => {
      params[k] = v;
    });
  }
  return { base: pathname, params };
}

async function attachTaskComments(tasks: Record<string, unknown>[]) {
  if (!tasks.length) return tasks;
  const ids = tasks.map((t) => t.id as number);
  const sb = getSupabase();
  const { data: comments } = await sb
    .from("task_comments")
    .select("*")
    .in("task_id", ids)
    .order("created_at");
  const byTask: Record<number, unknown[]> = {};
  for (const c of comments ?? []) {
    if (!byTask[c.task_id]) byTask[c.task_id] = [];
    byTask[c.task_id].push(c);
  }
  return tasks.map((t) => ({ ...t, comments: byTask[t.id as number] ?? [] }));
}

export async function handleApiGet<T>(path: string): Promise<T> {
  const { base, params } = parsePath(path);
  const sb = getSupabase();

  if (base === "/api/employees") {
    const { data, error } = await sb.from("employees").select("*").order("id");
    if (error) throw new Error(error.message);
    return (data ?? []).map((e) => normalizeEmployee(e as Record<string, unknown>)) as T;
  }

  if (base === "/api/stats") {
    const d = today();
    const [
      { count: tTotal },
      { count: tDone },
      { count: tWip },
      { data: overdueRows },
      { count: aPresent },
      { count: aLate },
      { count: aTotal },
      { data: debtSum },
      { count: dCrit },
      { count: whOut },
      { data: whRows },
    ] = await Promise.all([
      sb.from("tasks").select("*", { count: "exact", head: true }),
      sb.from("tasks").select("*", { count: "exact", head: true }).eq("status", "Выполнена"),
      sb.from("tasks").select("*", { count: "exact", head: true }).eq("status", "В работе"),
      sb.from("tasks").select("id").lt("due_date", d).neq("status", "Выполнена"),
      sb
        .from("attendance")
        .select("*", { count: "exact", head: true })
        .eq("date", d)
        .in("status", ["present", "late"]),
      sb.from("attendance").select("*", { count: "exact", head: true }).eq("date", d).eq("status", "late"),
      sb.from("employees").select("*", { count: "exact", head: true }),
      sb.from("debtors").select("debt"),
      sb.from("debtors").select("*", { count: "exact", head: true }).gt("overdue_days", 90),
      sb.from("warehouse").select("*", { count: "exact", head: true }).eq("qty", 0),
      sb.from("warehouse").select("id, qty, min_qty").gt("qty", 0),
    ]);
    const totalDebt = (debtSum ?? []).reduce((s, r) => s + (Number(r.debt) || 0), 0);
    const whLow = (whRows ?? []).filter(
      (r) => Number(r.qty) > 0 && Number(r.qty) < Number(r.min_qty),
    ).length;
    return {
      tasks: {
        total: tTotal ?? 0,
        done: tDone ?? 0,
        wip: tWip ?? 0,
        overdue: overdueRows?.length ?? 0,
      },
      attendance: {
        present: aPresent ?? 0,
        late: aLate ?? 0,
        total: aTotal ?? 0,
        date: d,
      },
      debtors: { total_debt: Math.round(totalDebt * 100) / 100, critical: dCrit ?? 0, no_comment: 0 },
      warehouse: { out_of_stock: whOut ?? 0, low_stock: whLow },
      updated: new Date().toISOString().slice(0, 16),
    } as T;
  }

  if (base === "/api/tasks") {
    const { data, error } = await sb.from("tasks").select("*").order("id", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return (await attachTaskComments(data ?? [])) as T;
  }

  const taskMatch = base.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch) {
    const id = parseInt(taskMatch[1], 10);
    const { data: task, error } = await sb.from("tasks").select("*").eq("id", id).single();
    if (error || !task) throw new Error("HTTP 404");
    const { data: comments } = await sb
      .from("task_comments")
      .select("*")
      .eq("task_id", id)
      .order("created_at");
    return { ...task, comments: comments ?? [] } as T;
  }

  if (base === "/api/debtors") {
    const { data, error } = await sb.from("debtors").select("*").order("overdue_days", { ascending: false });
    if (error) throw new Error(error.message);
    return data as T;
  }

  if (base === "/api/attendance") {
    let q = sb.from("attendance").select("*");
    if (params.date) q = q.eq("date", params.date);
    const { data, error } = await q.order("emp_id");
    if (error) throw new Error(error.message);
    return data as T;
  }

  if (base === "/api/attendance/report") {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `${y}-${m}`;
    const { data, error } = await sb.from("attendance").select("*").like("date", `${prefix}%`);
    if (error) throw new Error(error.message);
    const byEmp: Record<
      number,
      {
        emp_id: number;
        total_days: number;
        present: number;
        late: number;
        absent: number;
        early_out: number;
        total_late_min: number;
        total_early_min: number;
      }
    > = {};
    for (const row of data ?? []) {
      const e = row.emp_id as number;
      if (!byEmp[e]) {
        byEmp[e] = {
          emp_id: e,
          total_days: 0,
          present: 0,
          late: 0,
          absent: 0,
          early_out: 0,
          total_late_min: 0,
          total_early_min: 0,
        };
      }
      const r = byEmp[e];
      r.total_days++;
      if (row.status === "present") r.present++;
      else if (row.status === "late") r.late++;
      else if (row.status === "absent") r.absent++;
      else if (row.status === "early_out") r.early_out++;
      r.total_late_min += row.late_min ?? 0;
      r.total_early_min += row.early_min ?? 0;
    }
    return Object.values(byEmp) as T;
  }

  if (base === "/api/offices") {
    const { data, error } = await sb.from("offices").select("*");
    if (error) throw new Error(error.message);
    return data as T;
  }

  if (base === "/api/geo/all") {
    const { data: locs, error } = await sb
      .from("employee_locations")
      .select("*, employees(name, role, color, bg)")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: offices } = await sb.from("offices").select("*").eq("active", true);
    const now = Date.now();
    return (locs ?? []).map((loc) => {
      const emp = (loc as { employees?: Employee }).employees;
      let nearest = 999999;
      let inZone = false;
      for (const o of offices ?? []) {
        const dist = haversineM(loc.lat, loc.lng, o.lat, o.lng);
        if (dist < nearest) nearest = dist;
        if (dist <= o.radius) inZone = true;
      }
      const updated = new Date(loc.updated_at).getTime();
      return {
        emp_id: loc.emp_id,
        lat: loc.lat,
        lng: loc.lng,
        accuracy: loc.accuracy,
        updated_at: loc.updated_at,
        name: emp?.name,
        role: emp?.role,
        color: emp?.color,
        bg: emp?.bg,
        distance_m: Math.round(nearest),
        in_zone: inZone,
        stale: now - updated > 15 * 60 * 1000,
      };
    }) as T;
  }

  if (base === "/api/rko") {
    const { data, error } = await sb.from("rko").select("*").order("date", { ascending: false });
    if (error) throw new Error(error.message);
    return data as T;
  }

  if (base === "/api/sales/facts") {
    const { data, error } = await sb.from("sales_facts").select("*");
    if (error) throw new Error(error.message);
    return data as T;
  }

  if (base === "/api/sales/plans") {
    const { data, error } = await sb.from("sales_plans").select("*");
    if (error) throw new Error(error.message);
    return data as T;
  }

  if (base === "/api/sales/history") {
    const { data, error } = await sb.from("sales_history").select("*");
    if (error) throw new Error(error.message);
    return data as T;
  }

  if (base === "/api/warehouse") {
    const { data, error } = await sb.from("warehouse").select("*").order("name");
    if (error) throw new Error(error.message);
    return data as T;
  }

  if (base === "/api/warehouse/categories") {
    const { data, error } = await sb.from("warehouse").select("category");
    if (error) throw new Error(error.message);
    return [...new Set((data ?? []).map((r) => r.category))] as T;
  }

  if (base.startsWith("/api/clients")) {
    if (base === "/api/clients") {
      let q = sb.from("clients").select("*");
      if (params.manager_id) q = q.eq("manager_id", parseInt(params.manager_id, 10));
      if (params.q) q = q.ilike("name", `%${params.q}%`);
      const { data, error } = await q.order("name");
      if (error) throw new Error(error.message);
      return data as T;
    }
    const m = base.match(/^\/api\/clients\/(\d+)$/);
    if (m) {
      const { data, error } = await sb.from("clients").select("*").eq("id", parseInt(m[1], 10)).single();
      if (error) throw new Error("HTTP 404");
      return data as T;
    }
  }

  if (base === "/api/routes") {
    let q = sb.from("routes").select("*, route_stops(*)");
    if (params.date) q = q.eq("date", params.date);
    if (params.manager_id) q = q.eq("manager_id", parseInt(params.manager_id, 10));
    const { data, error } = await q.order("id", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      ...r,
      stops: (r as { route_stops?: unknown[] }).route_stops ?? [],
    })) as T;
  }

  if (base === "/api/orders") {
    let q = sb.from("orders").select("*, order_items(*)");
    if (params.manager_id) q = q.eq("manager_id", parseInt(params.manager_id, 10));
    const { data, error } = await q.order("id", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((o) => ({
      ...o,
      items: (o as { order_items?: unknown[] }).order_items ?? [],
    })) as T;
  }

  throw new Error(`HTTP 404: ${path}`);
}

export async function handleApiPost<T>(path: string, body: unknown): Promise<T> {
  const { base } = parsePath(path);
  const sb = getSupabase();
  const b = body as Record<string, unknown>;

  if (base === "/api/tasks") {
    const { data, error } = await sb
      .from("tasks")
      .insert({
        name: b.name,
        description: b.description ?? "",
        emp_id: b.emp_id ?? 1,
        priority: b.priority ?? "Средний",
        category: b.category ?? "Прочее",
        due_date: b.due_date,
        due_time: b.due_time ?? "",
        status: b.status ?? "Новая",
        progress: b.progress ?? 0,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (b.emp_id) {
      await sb.from("notifications").insert({
        emp_id: b.emp_id,
        type: "task",
        title: "Новая задача",
        body: `Вам назначена задача: «${b.name}»`,
      });
    }
    return { ...data, comments: [] } as T;
  }

  const commentMatch = base.match(/^\/api\/tasks\/(\d+)\/comments$/);
  if (commentMatch) {
    const taskId = parseInt(commentMatch[1], 10);
    const { data, error } = await sb
      .from("task_comments")
      .insert({ task_id: taskId, emp_id: b.emp_id, text: b.text })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await sb.from("tasks").update({ updated_at: new Date().toISOString() }).eq("id", taskId);
    return data as T;
  }

  if (base === "/api/attendance/checkin") {
    const d = today();
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const { data: offices } = await sb.from("offices").select("*").eq("active", true);
    let nearest = 999999;
    let inZone = false;
    for (const o of offices ?? []) {
      const dist = haversineM(b.lat as number, b.lng as number, o.lat, o.lng);
      if (dist < nearest) nearest = dist;
      if (dist <= o.radius) inZone = true;
    }
    const { data: ws } = await sb.from("settings").select("value").eq("key", "work_start").maybeSingle();
    const { data: we } = await sb.from("settings").select("value").eq("key", "work_end").maybeSingle();
    const workStart = ws?.value ?? "09:00";
    const workEnd = we?.value ?? "18:00";
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const wsMin =
      parseInt(workStart.split(":")[0], 10) * 60 + parseInt(workStart.split(":")[1], 10);
    const weMin =
      parseInt(workEnd.split(":")[0], 10) * 60 + parseInt(workEnd.split(":")[1], 10);

    const { data: existing } = await sb
      .from("attendance")
      .select("*")
      .eq("emp_id", b.emp_id)
      .eq("date", d)
      .maybeSingle();

    let action = "in";
    if (!existing?.time_in) {
      const lateMin = Math.max(0, nowMin - wsMin);
      const status = lateMin > 0 ? "late" : "present";
      await sb.from("attendance").upsert(
        {
          emp_id: b.emp_id,
          date: d,
          time_in: nowTime,
          lat: b.lat,
          lng: b.lng,
          status,
          late_min: lateMin,
        },
        { onConflict: "emp_id,date" },
      );
    } else {
      action = "out";
      const earlyMin = Math.max(0, weMin - nowMin);
      await sb
        .from("attendance")
        .update({
          time_out: nowTime,
          out_lat: b.lat,
          out_lng: b.lng,
          early_min: earlyMin,
          status: earlyMin > 0 ? "early_out" : "present",
        })
        .eq("emp_id", b.emp_id)
        .eq("date", d);
    }
    const { data: rec } = await sb
      .from("attendance")
      .select("*")
      .eq("emp_id", b.emp_id)
      .eq("date", d)
      .single();
    return { action, record: rec, distance_m: Math.round(nearest), in_zone: inZone } as T;
  }

  if (base === "/api/geo/update") {
    const nowStr = new Date().toISOString();
    await sb.from("employee_locations").upsert(
      {
        emp_id: b.emp_id,
        lat: b.lat,
        lng: b.lng,
        accuracy: b.accuracy ?? 0,
        updated_at: nowStr,
      },
      { onConflict: "emp_id" },
    );
    const { data: offices } = await sb.from("offices").select("*").eq("active", true);
    let nearest = 999999;
    let inZone = false;
    for (const o of offices ?? []) {
      const dist = haversineM(b.lat as number, b.lng as number, o.lat, o.lng);
      if (dist < nearest) nearest = dist;
      if (dist <= o.radius) inZone = true;
    }
    return {
      emp_id: b.emp_id,
      lat: b.lat,
      lng: b.lng,
      distance_m: Math.round(nearest),
      in_zone: inZone,
      updated_at: nowStr,
    } as T;
  }

  if (base === "/api/offices") {
    const { data, error } = await sb
      .from("offices")
      .insert({
        name: b.name,
        lat: b.lat,
        lng: b.lng,
        radius: b.radius ?? 200,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  if (base === "/api/rko") {
    const { data, error } = await sb
      .from("rko")
      .insert({
        number: b.number ?? `РКО-${Date.now()}`,
        date: b.date,
        recipient: b.recipient,
        emp_id: b.emp_id,
        amount: b.amount ?? 0,
        currency: b.currency ?? "TJS",
        basis: b.basis ?? "",
        category: b.category ?? "Прочее",
        status: b.status ?? "draft",
        created_by: b.created_by,
        note: b.note ?? "",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  if (base === "/api/warehouse") {
    const itemId =
      "W" +
      Math.random().toString(36).slice(2, 9).toUpperCase();
    const { data, error } = await sb
      .from("warehouse")
      .insert({
        id: itemId,
        name: (b.name as string).trim(),
        sku: (b.sku as string)?.trim() ?? "",
        category: (b.category as string)?.trim() ?? "Прочее",
        qty: b.qty ?? 0,
        unit: (b.unit as string)?.trim() ?? "шт",
        min_qty: b.min_qty ?? 0,
        price: b.price ?? 0,
        warehouse_name: (b.warehouse_name as string)?.trim() ?? "Склад №1",
        supplier: (b.supplier as string)?.trim() ?? "",
        last_in: today(),
        source: "manual",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  if (base === "/api/clients") {
    const { data, error } = await sb.from("clients").insert(b).select().single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  if (base === "/api/routes") {
    const stops = (b.stops as unknown[]) ?? [];
    const { data: route, error } = await sb
      .from("routes")
      .insert({
        date: b.date,
        manager_id: b.manager_id,
        name: b.name ?? "",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    for (const s of stops as Record<string, unknown>[]) {
      await sb.from("route_stops").insert({
        route_id: route.id,
        client_id: s.client_id,
        client_name: s.client_name ?? "",
        address: s.address ?? "",
        order_num: s.order_num ?? 0,
        note: s.note ?? "",
      });
    }
    return route as T;
  }

  if (base === "/api/orders") {
    const items = (b.items as Record<string, unknown>[]) ?? [];
    const total = items.reduce(
      (s, i) => s + (i.qty as number) * (i.price as number),
      0,
    );
    const { data: order, error } = await sb
      .from("orders")
      .insert({
        number: `ORD-${Date.now()}`,
        client_id: b.client_id,
        client_name: b.client_name ?? "",
        manager_id: b.manager_id,
        total,
        note: b.note ?? "",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    for (const i of items) {
      await sb.from("order_items").insert({
        order_id: order.id,
        product_name: i.product_name,
        category: i.category ?? "",
        qty: i.qty ?? 1,
        price: i.price ?? 0,
        total: (i.qty as number) * (i.price as number),
      });
    }
    return order as T;
  }

  throw new Error(`HTTP 404: ${path}`);
}

export async function handleApiPut<T>(path: string, body: unknown): Promise<T> {
  const { base } = parsePath(path);
  const sb = getSupabase();
  const b = body as Record<string, unknown>;

  const profileMatch = base.match(/^\/api\/employees\/(\d+)\/profile$/);
  if (profileMatch) {
    const id = parseInt(profileMatch[1], 10);
    const { data, error } = await sb
      .from("employees")
      .update({
        name: b.name,
        role: b.role,
        phone: b.phone,
        bio: b.bio,
        tg_id: b.tg_id,
        color: b.color,
        avatar: b.avatar,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return normalizeEmployee(data as Record<string, unknown>) as T;
  }

  const pinMatch = base.match(/^\/api\/employees\/(\d+)\/pin$/);
  if (pinMatch) {
    const id = parseInt(pinMatch[1], 10);
    const { data: emp } = await sb.from("employees").select("pin").eq("id", id).single();
    if (emp?.pin && emp.pin !== b.old_pin) throw new Error("HTTP 401");
    const newPin = b.new_pin as string;
    if (!newPin || newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      throw new Error("HTTP 400");
    }
    const { error } = await sb.from("employees").update({ pin: newPin }).eq("id", id);
    if (error) throw new Error(error.message);
    return { success: true } as T;
  }

  const taskMatch = base.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch) {
    const id = parseInt(taskMatch[1], 10);
    const { data, error } = await sb
      .from("tasks")
      .update({ ...b, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  const rkoMatch = base.match(/^\/api\/rko\/(\d+)$/);
  if (rkoMatch) {
    const id = parseInt(rkoMatch[1], 10);
    const { data, error } = await sb
      .from("rko")
      .update({ ...b, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as T;
  }

  const whPhotoMatch = base.match(/^\/api\/warehouse\/([^/]+)\/photo$/);
  if (whPhotoMatch) {
    const { error } = await sb
      .from("warehouse")
      .update({ photo: b.photo, updated_at: new Date().toISOString() })
      .eq("id", whPhotoMatch[1]);
    if (error) throw new Error(error.message);
    return { ok: true } as T;
  }

  if (base === "/api/settings") {
    await sb.from("settings").upsert({
      key: b.key,
      value: b.value,
      updated: new Date().toISOString(),
    });
    return { ok: true } as T;
  }

  if (base === "/api/sales/plans") {
    await sb.from("sales_plans").upsert(
      {
        manager_id: b.manager_id,
        period: b.period,
        amount: b.amount,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "manager_id,period" },
    );
    return { ok: true } as T;
  }

  const stopMatch = base.match(/^\/api\/routes\/stops\/(\d+)\/visit$/);
  if (stopMatch) {
    const { error } = await sb
      .from("route_stops")
      .update({
        status: b.status,
        note: b.note ?? "",
        visit_time: b.visit_time ?? new Date().toISOString(),
      })
      .eq("id", parseInt(stopMatch[1], 10));
    if (error) throw new Error(error.message);
    return { ok: true } as T;
  }

  const orderMatch = base.match(/^\/api\/orders\/(\d+)\/status$/);
  if (orderMatch) {
    const { error } = await sb
      .from("orders")
      .update({ status: b.status, updated_at: new Date().toISOString() })
      .eq("id", parseInt(orderMatch[1], 10));
    if (error) throw new Error(error.message);
    return { ok: true } as T;
  }

  throw new Error(`HTTP 404: ${path}`);
}

export async function handleApiDelete(path: string): Promise<void> {
  const { base } = parsePath(path);
  const sb = getSupabase();

  const taskMatch = base.match(/^\/api\/tasks\/(\d+)$/);
  if (taskMatch) {
    const id = parseInt(taskMatch[1], 10);
    await sb.from("task_comments").delete().eq("task_id", id);
    const { error } = await sb.from("tasks").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }

  const geoMatch = base.match(/^\/api\/geo\/(\d+)$/);
  if (geoMatch) {
    const { error } = await sb
      .from("employee_locations")
      .delete()
      .eq("emp_id", parseInt(geoMatch[1], 10));
    if (error) throw new Error(error.message);
    return;
  }

  const officeMatch = base.match(/^\/api\/offices\/(\d+)$/);
  if (officeMatch) {
    const { error } = await sb.from("offices").delete().eq("id", parseInt(officeMatch[1], 10));
    if (error) throw new Error(error.message);
    return;
  }

  const rkoMatch = base.match(/^\/api\/rko\/(\d+)$/);
  if (rkoMatch) {
    const { error } = await sb.from("rko").delete().eq("id", parseInt(rkoMatch[1], 10));
    if (error) throw new Error(error.message);
    return;
  }

  const whPhotoMatch = base.match(/^\/api\/warehouse\/([^/]+)\/photo$/);
  if (whPhotoMatch) {
    const { error } = await sb
      .from("warehouse")
      .update({ photo: "", updated_at: new Date().toISOString() })
      .eq("id", whPhotoMatch[1]);
    if (error) throw new Error(error.message);
    return;
  }

  const whMatch = base.match(/^\/api\/warehouse\/([^/]+)$/);
  if (whMatch && !base.endsWith("/photo")) {
    const { error } = await sb.from("warehouse").delete().eq("id", whMatch[1]);
    if (error) throw new Error(error.message);
    return;
  }

  const routeMatch = base.match(/^\/api\/routes\/(\d+)$/);
  if (routeMatch) {
    const id = parseInt(routeMatch[1], 10);
    await sb.from("route_stops").delete().eq("route_id", id);
    const { error } = await sb.from("routes").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }

  throw new Error(`HTTP 404: ${path}`);
}

/** Пути, обрабатываемые Netlify Functions (не Supabase напрямую) */
export const NETLIFY_API_PREFIXES = [
  "/api/auth/login",
  "/api/ai-chat",
  "/api/sync/",
  "/api/export/",
];

export function isNetlifyApiPath(path: string): boolean {
  return NETLIFY_API_PREFIXES.some((p) => path.startsWith(p));
}
