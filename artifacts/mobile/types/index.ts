export interface Employee {
  id: number;
  name: string;
  role: string;
  color: string;
  bg: string;
  is_hr: number;
  is_admin: number;
  salary: number;
  tg_id?: number;
  created_at: string;
}

export interface Task {
  id: number;
  name: string;
  description: string;
  emp_id: number;
  priority: "Высокий" | "Средний" | "Низкий";
  category: string;
  due_date?: string;
  status: "Новая" | "В работе" | "На проверке" | "Выполнена" | "Заблокирована";
  progress: number;
  created_at: string;
  updated_at: string;
}

export interface TaskComment {
  id: number;
  task_id: number;
  emp_id: number;
  text: string;
  created_at: string;
}

export interface Attendance {
  id: number;
  emp_id: number;
  date: string;
  time_in?: string;
  time_out?: string;
  lat?: number;
  lng?: number;
  status: "present" | "absent" | "late" | "early_out";
  auto_in: number;
  auto_out: number;
  late_min: number;
  early_min: number;
}

export interface Debtor {
  id: string;
  name: string;
  inn: string;
  manager_id: number;
  debt: number;
  overdue_days: number;
  due_date: string;
  invoice_date: string;
  last_payment: string;
  status: "negotiating" | "promised" | "legal" | "partial" | "dispute";
  source: string;
  updated_at: string;
}

export interface DebtorComment {
  id: number;
  debtor_id: string;
  emp_id: number;
  text: string;
  due_promise?: string;
  created_at: string;
}

export interface WarehouseItem {
  id: string;
  name: string;
  sku: string;
  category: string;
  qty: number;
  unit: string;
  min_qty: number;
  price: number;
  warehouse_name: string;
  supplier: string;
  last_in: string;
  source: string;
  updated_at: string;
}

export interface SalesFact {
  manager_id: number;
  period: string;
  amount: number;
}

export interface SalesPlan {
  manager_id: number;
  period: string;
  amount: number;
}

export interface Stats {
  tasks: {
    total: number;
    done: number;
    wip: number;
    overdue: number;
  };
  attendance: {
    present: number;
    late: number;
    total: number;
    date: string;
  };
  debtors: {
    total_debt: number;
    critical: number;
    no_comment: number;
  };
  warehouse: {
    out_of_stock: number;
    low_stock: number;
  };
  updated: string;
}
