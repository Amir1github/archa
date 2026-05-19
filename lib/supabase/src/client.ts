import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "";
const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";

export function createSupabaseClient(
  url = supabaseUrl,
  anonKey = supabaseAnonKey,
): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error(
      "SUPABASE_URL и SUPABASE_ANON_KEY должны быть заданы в переменных окружения",
    );
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

/** Email для Supabase Auth (связан с employees.id) */
export function employeeAuthEmail(empId: number): string {
  return `employee.${empId}@poytakht.app`;
}

/** Пароль для Supabase Auth (мин. 6 символов; PIN — 4 цифры) */
export function employeeAuthPassword(empId: number, pin: string): string {
  const p = pin || "0000";
  return `Pt_${p}_${empId}!`;
}

/** Убрать PIN из объекта сотрудника для клиента */
export function stripEmployeePin<T extends { pin?: string | null }>(
  emp: T,
): Omit<T, "pin"> & { pin?: string | null } {
  const result = { ...emp };
  if (result.pin) {
    (result as { pin?: string | null }).pin = "*";
  } else {
    delete (result as { pin?: string | null }).pin;
  }
  delete (result as { auth_user_id?: string }).auth_user_id;
  return result;
}
