import {
  boolean,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const employeesTable = pgTable("employees", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").default(""),
  color: text("color").default("#1a7a3c"),
  bg: text("bg").default("#1a7a3c20"),
  isHr: boolean("is_hr").default(false),
  isAdmin: boolean("is_admin").default(false),
  salary: integer("salary").default(0),
  tgId: integer("tg_id"),
  phone: text("phone").default(""),
  bio: text("bio").default(""),
  avatar: text("avatar").default(""),
  pin: text("pin"),
  source: text("source").default("manual"),
  authUserId: uuid("auth_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default(""),
  empId: integer("emp_id").default(1),
  priority: text("priority").default("Средний"),
  category: text("category").default("Прочее"),
  dueDate: text("due_date"),
  dueTime: text("due_time").default(""),
  status: text("status").default("Новая"),
  progress: integer("progress").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
