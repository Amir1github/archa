import {
  employeeAuthEmail,
  employeeAuthPassword,
  getServiceSupabase,
  jsonResponse,
  parseBody,
  stripEmployeePin,
} from "./lib/shared.js";

interface LoginBody {
  emp_id: number;
  pin: string;
}

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const { emp_id, pin } = await parseBody<LoginBody>(req);
  if (!emp_id) {
    return jsonResponse({ detail: "Сотрудник не найден" }, 404);
  }

  const admin = getServiceSupabase();
  const { data: emp, error: empErr } = await admin
    .from("employees")
    .select("*")
    .eq("id", emp_id)
    .single();

  if (empErr || !emp) {
    return jsonResponse({ detail: "Сотрудник не найден" }, 404);
  }

  if (emp.pin && emp.pin !== pin) {
    return jsonResponse({ detail: "Неверный PIN-код" }, 401);
  }

  const email = employeeAuthEmail(emp_id);
  const password = employeeAuthPassword(emp_id, pin || "0000");

  let session = null;

  const signIn = await admin.auth.signInWithPassword({ email, password });
  if (signIn.error) {
    const create = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { employee_id: emp_id },
    });
    if (create.error && !create.error.message.includes("already")) {
      return jsonResponse({ detail: create.error.message }, 500);
    }
    const retry = await admin.auth.signInWithPassword({ email, password });
    if (retry.error) {
      return jsonResponse({ detail: retry.error.message }, 500);
    }
    session = retry.data.session;
    if (create.data.user) {
      await admin
        .from("employees")
        .update({ auth_user_id: create.data.user.id })
        .eq("id", emp_id);
    }
  } else {
    session = signIn.data.session;
    if (signIn.data.user) {
      await admin
        .from("employees")
        .update({ auth_user_id: signIn.data.user.id })
        .eq("id", emp_id);
    }
  }

  return jsonResponse({
    success: true,
    employee: stripEmployeePin(emp),
    session,
  });
};
