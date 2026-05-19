import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { apiGet, apiPost } from "@/constants/api";
import { getSupabase } from "@/lib/supabase-client";
import type { Employee } from "@/types";

interface AuthContextType {
  user: Employee | null;
  isLoading: boolean;
  login: (
    empId: number,
    pin: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  updateUser: (emp: Employee) => void;
  refreshUser: () => Promise<void>;
}

interface LoginResponse {
  success: boolean;
  employee: Employee;
  session?: {
    access_token: string;
    refresh_token: string;
  };
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: async () => ({ success: false }),
  logout: () => {},
  updateUser: () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sb = getSupabase();
        const { data: sessionData } = await sb.auth.getSession();
        if (sessionData.session) {
          const saved = await AsyncStorage.getItem("current_user");
          if (saved) {
            setUser(JSON.parse(saved));
            setIsLoading(false);
            return;
          }
        }
        const saved = await AsyncStorage.getItem("current_user");
        if (saved) setUser(JSON.parse(saved));
      } catch {
        /* ignore */
      }
      setIsLoading(false);
    })();

    const sb = getSupabase();
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUser(null);
        AsyncStorage.removeItem("current_user");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const login = useCallback(async (empId: number, pin: string) => {
    try {
      const result = await apiPost<LoginResponse>("/api/auth/login", {
        emp_id: empId,
        pin,
      });
      if (result.session) {
        await getSupabase().auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        });
      }
      if (result.employee) {
        setUser(result.employee);
        await AsyncStorage.setItem(
          "current_user",
          JSON.stringify(result.employee)
        );
        return { success: true };
      }
      return { success: false, error: "Ошибка входа" };
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? "");
      if (msg.includes("401")) return { success: false, error: "Неверный PIN-код" };
      if (msg.includes("404")) return { success: false, error: "Сотрудник не найден" };
      return { success: false, error: "Ошибка подключения к серверу" };
    }
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    await AsyncStorage.removeItem("current_user");
    await getSupabase().auth.signOut();
  }, []);

  const updateUser = useCallback((emp: Employee) => {
    setUser(emp);
    AsyncStorage.setItem("current_user", JSON.stringify(emp));
  }, []);

  const refreshUser = useCallback(async () => {
    if (!user) return;
    try {
      const employees = await apiGet<Employee[]>("/api/employees");
      const updated = employees.find((e) => e.id === user.id);
      if (updated) {
        setUser(updated);
        await AsyncStorage.setItem("current_user", JSON.stringify(updated));
      }
    } catch {
      /* ignore */
    }
  }, [user]);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, logout, updateUser, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
