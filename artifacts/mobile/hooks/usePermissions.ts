import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { Employee } from "@/types";

export type Permission =
  | "admin"
  | "tasks.view_all"
  | "tasks.create"
  | "tasks.edit"
  | "hr.manage"
  | "warehouse.manage"
  | "sales.manage"
  | "debtors.manage";

const FULL: Permission[] = [
  "admin", "tasks.view_all", "tasks.create", "tasks.edit",
  "hr.manage", "warehouse.manage", "sales.manage", "debtors.manage",
];

function computePermissions(user: Employee | null): Set<Permission> {
  const p = new Set<Permission>();
  if (!user) return p;

  if (user.is_admin) {
    FULL.forEach((x) => p.add(x));
    return p;
  }

  const role = (user.role || "").toLowerCase();

  if (role.includes("муовин")) {
    FULL.forEach((x) => p.add(x));
    return p;
  }

  if (user.is_hr || role === "hr") {
    p.add("tasks.view_all");
    p.add("tasks.create");
    p.add("tasks.edit");
    p.add("hr.manage");
    return p;
  }

  if (role.includes("главный бухгалт")) {
    (["tasks.view_all", "tasks.create", "tasks.edit",
      "hr.manage", "sales.manage", "debtors.manage"] as Permission[])
      .forEach((x) => p.add(x));
    return p;
  }

  if (role.includes("директор производства")) {
    (["tasks.view_all", "tasks.create", "tasks.edit"] as Permission[])
      .forEach((x) => p.add(x));
    return p;
  }

  if (role.includes("материальный")) {
    p.add("tasks.view_all");
    p.add("tasks.create");
    p.add("sales.manage");
    return p;
  }

  if (role.includes("кассир") || role.includes("бухгалтер")) {
    p.add("tasks.view_all");
    return p;
  }

  if (role.includes("маркетолог")) {
    p.add("tasks.view_all");
    p.add("tasks.create");
    return p;
  }

  if (role.includes("зав склад") || role.includes("логист")) {
    p.add("tasks.create");
    p.add("warehouse.manage");
    return p;
  }

  if (role.includes("зав шоурума") || role.includes("зав тц")) {
    p.add("tasks.create");
    p.add("sales.manage");
    return p;
  }

  if (role.includes("менеджер по продажам")) {
    p.add("tasks.create");
    p.add("sales.manage");
    return p;
  }

  if (
    role.includes("ст. менеджер") ||
    role.includes("старший менеджер") ||
    role.includes("менеджер") ||
    role.includes("оператор") ||
    role.includes("конструктор") ||
    role.includes("зав ")
  ) {
    p.add("tasks.create");
    return p;
  }

  return p;
}

export function usePermissions() {
  const { user } = useAuth();
  const perms = useMemo(() => computePermissions(user), [user]);
  const can = (perm: Permission): boolean => perms.has(perm);
  return { can, perms };
}
