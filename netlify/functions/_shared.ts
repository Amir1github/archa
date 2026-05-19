import { createClient } from "@supabase/supabase-js";

export function getServiceSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY обязательны");
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function parseBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function employeeAuthEmail(empId: number): string {
  return `employee.${empId}@poytakht.app`;
}

export function employeeAuthPassword(empId: number, pin: string): string {
  const p = pin || "0000";
  return `Pt_${p}_${empId}!`;
}

export function stripEmployeePin<T extends { pin?: string | null; auth_user_id?: string | null }>(
  emp: T,
): Omit<T, "pin" | "auth_user_id"> & { pin?: string | null } {
  const result = { ...emp };
  if (result.pin) {
    (result as { pin?: string | null }).pin = "*";
  } else {
    delete (result as { pin?: string | null }).pin;
  }
  delete (result as { auth_user_id?: string | null }).auth_user_id;
  return result;
}
