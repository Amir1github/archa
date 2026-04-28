import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { apiGet, apiPost } from "@/constants/api";
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
        const saved = await AsyncStorage.getItem("current_user");
        if (saved) setUser(JSON.parse(saved));
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (empId: number, pin: string) => {
    try {
      const result = await apiPost<{ success: boolean; employee: Employee }>(
        "/api/auth/login",
        { emp_id: empId, pin }
      );
      if (result.employee) {
        setUser(result.employee);
        await AsyncStorage.setItem(
          "current_user",
          JSON.stringify(result.employee)
        );
        return { success: true };
      }
      return { success: false, error: "Ошибка входа" };
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (msg.includes("401")) return { success: false, error: "Неверный PIN-код" };
      if (msg.includes("404")) return { success: false, error: "Сотрудник не найден" };
      return { success: false, error: "Ошибка подключения к серверу" };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    AsyncStorage.removeItem("current_user");
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
    } catch {}
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
