-- Пойтахт: начальная схема PostgreSQL (миграция с SQLite)

-- ── Сотрудники ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employees (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    role        TEXT DEFAULT '',
    color       TEXT DEFAULT '#1a7a3c',
    bg          TEXT DEFAULT '#1a7a3c20',
    is_hr       BOOLEAN DEFAULT FALSE,
    is_admin    BOOLEAN DEFAULT FALSE,
    salary      INTEGER DEFAULT 0,
    tg_id       BIGINT,
    phone       TEXT DEFAULT '',
    bio         TEXT DEFAULT '',
    avatar      TEXT DEFAULT '',
    pin         TEXT,
    source      TEXT DEFAULT 'manual',
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Задачи ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT DEFAULT '',
    emp_id      INTEGER DEFAULT 1 REFERENCES employees(id),
    priority    TEXT DEFAULT 'Средний',
    category    TEXT DEFAULT 'Прочее',
    due_date    TEXT,
    due_time    TEXT DEFAULT '',
    status      TEXT DEFAULT 'Новая',
    progress    INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_emp ON tasks(emp_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

CREATE TABLE IF NOT EXISTS task_comments (
    id          SERIAL PRIMARY KEY,
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    emp_id      INTEGER NOT NULL REFERENCES employees(id),
    text        TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Посещаемость ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
    id          SERIAL PRIMARY KEY,
    emp_id      INTEGER NOT NULL REFERENCES employees(id),
    date        TEXT NOT NULL,
    time_in     TEXT,
    time_out    TEXT,
    lat         DOUBLE PRECISION,
    lng         DOUBLE PRECISION,
    in_addr     TEXT DEFAULT '',
    out_lat     DOUBLE PRECISION,
    out_lng     DOUBLE PRECISION,
    status      TEXT DEFAULT 'absent',
    auto_in     BOOLEAN DEFAULT FALSE,
    auto_out    BOOLEAN DEFAULT FALSE,
    late_min    INTEGER DEFAULT 0,
    early_min   INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(emp_id, date)
);
CREATE INDEX IF NOT EXISTS idx_att_date ON attendance(date);
CREATE INDEX IF NOT EXISTS idx_att_emp ON attendance(emp_id);

-- ── Дебиторы ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debtors (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    inn             TEXT DEFAULT '',
    manager_id      INTEGER DEFAULT 1 REFERENCES employees(id),
    debt            DOUBLE PRECISION DEFAULT 0,
    overdue_days    INTEGER DEFAULT 0,
    due_date        TEXT DEFAULT '',
    invoice_date    TEXT DEFAULT '',
    last_payment    TEXT DEFAULT '',
    status          TEXT DEFAULT 'negotiating',
    source          TEXT DEFAULT 'manual',
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_debt_manager ON debtors(manager_id);
CREATE INDEX IF NOT EXISTS idx_debt_overdue ON debtors(overdue_days);

CREATE TABLE IF NOT EXISTS debtor_comments (
    id          SERIAL PRIMARY KEY,
    debtor_id   TEXT NOT NULL REFERENCES debtors(id) ON DELETE CASCADE,
    emp_id      INTEGER NOT NULL REFERENCES employees(id),
    text        TEXT NOT NULL,
    due_promise TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Склад ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    sku             TEXT DEFAULT '',
    category        TEXT DEFAULT 'Прочее',
    qty             DOUBLE PRECISION DEFAULT 0,
    unit            TEXT DEFAULT 'шт',
    min_qty         DOUBLE PRECISION DEFAULT 0,
    price           DOUBLE PRECISION DEFAULT 0,
    warehouse_name  TEXT DEFAULT 'Склад №1',
    supplier        TEXT DEFAULT '',
    last_in         TEXT DEFAULT '',
    photo           TEXT DEFAULT '',
    source          TEXT DEFAULT 'manual',
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_cat ON warehouse(category);
CREATE INDEX IF NOT EXISTS idx_wh_qty ON warehouse(qty);

-- ── Продажи ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_facts (
    id          SERIAL PRIMARY KEY,
    manager_id  INTEGER NOT NULL REFERENCES employees(id),
    period      TEXT NOT NULL,
    amount      DOUBLE PRECISION DEFAULT 0,
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(manager_id, period)
);

CREATE TABLE IF NOT EXISTS sales_plans (
    id          SERIAL PRIMARY KEY,
    manager_id  INTEGER NOT NULL REFERENCES employees(id),
    period      TEXT NOT NULL,
    amount      DOUBLE PRECISION DEFAULT 0,
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(manager_id, period)
);

CREATE TABLE IF NOT EXISTS sales_history (
    id              SERIAL PRIMARY KEY,
    year            INTEGER NOT NULL,
    month           INTEGER,
    category        TEXT DEFAULT '',
    nomenclature_id TEXT DEFAULT '',
    nomenclature    TEXT DEFAULT '',
    supplier        TEXT DEFAULT '',
    manager_id      INTEGER DEFAULT 0,
    amount          DOUBLE PRECISION DEFAULT 0,
    qty             DOUBLE PRECISION DEFAULT 0,
    purchase_amount DOUBLE PRECISION DEFAULT 0,
    source          TEXT DEFAULT '1c',
    UNIQUE(year, month, nomenclature_id, manager_id)
);
CREATE INDEX IF NOT EXISTS idx_sh_year ON sales_history(year);
CREATE INDEX IF NOT EXISTS idx_sh_cat ON sales_history(category);

-- ── Офисы и геозоны ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offices (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    radius      INTEGER DEFAULT 200,
    active      BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS employee_locations (
    emp_id      INTEGER PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
    lat         DOUBLE PRECISION NOT NULL,
    lng         DOUBLE PRECISION NOT NULL,
    accuracy    DOUBLE PRECISION DEFAULT 0,
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Настройки ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    key     TEXT PRIMARY KEY,
    value   TEXT,
    updated TIMESTAMPTZ DEFAULT NOW()
);

-- ── Уведомления ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
    id          SERIAL PRIMARY KEY,
    emp_id      INTEGER REFERENCES employees(id),
    type        TEXT DEFAULT 'info',
    title       TEXT NOT NULL,
    body        TEXT DEFAULT '',
    read        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_emp ON notifications(emp_id, read);

-- ── РКО ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rko (
    id          SERIAL PRIMARY KEY,
    number      TEXT NOT NULL,
    date        TEXT NOT NULL,
    recipient   TEXT NOT NULL,
    emp_id      INTEGER REFERENCES employees(id),
    amount      DOUBLE PRECISION DEFAULT 0,
    currency    TEXT DEFAULT 'TJS',
    basis       TEXT DEFAULT '',
    category    TEXT DEFAULT 'Прочее',
    status      TEXT DEFAULT 'draft',
    created_by  INTEGER REFERENCES employees(id),
    approved_by INTEGER REFERENCES employees(id),
    note        TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rko_date ON rko(date);
CREATE INDEX IF NOT EXISTS idx_rko_status ON rko(status);

-- ── Клиенты ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    phone       TEXT DEFAULT '',
    address     TEXT DEFAULT '',
    contact     TEXT DEFAULT '',
    category    TEXT DEFAULT 'Розница',
    status      TEXT DEFAULT 'active',
    manager_id  INTEGER REFERENCES employees(id),
    inn         TEXT DEFAULT '',
    note        TEXT DEFAULT '',
    source      TEXT DEFAULT 'manual',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);

-- ── Маршруты ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
    id          SERIAL PRIMARY KEY,
    date        TEXT NOT NULL,
    manager_id  INTEGER REFERENCES employees(id),
    name        TEXT DEFAULT '',
    status      TEXT DEFAULT 'active',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS route_stops (
    id          SERIAL PRIMARY KEY,
    route_id    INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    client_id   INTEGER REFERENCES clients(id),
    client_name TEXT DEFAULT '',
    address     TEXT DEFAULT '',
    order_num   INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'pending',
    note        TEXT DEFAULT '',
    visit_time  TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_routes_date ON routes(date);

-- ── Заказы ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
    id          SERIAL PRIMARY KEY,
    number      TEXT NOT NULL,
    client_id   INTEGER REFERENCES clients(id),
    client_name TEXT DEFAULT '',
    manager_id  INTEGER REFERENCES employees(id),
    total       DOUBLE PRECISION DEFAULT 0,
    status      TEXT DEFAULT 'new',
    note        TEXT DEFAULT '',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id           SERIAL PRIMARY KEY,
    order_id     INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_name TEXT DEFAULT '',
    category     TEXT DEFAULT '',
    qty          INTEGER DEFAULT 1,
    price        DOUBLE PRECISION DEFAULT 0,
    total        DOUBLE PRECISION DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_mgr ON orders(manager_id);

-- ── Лог синхронизации с 1С ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_log (
    id          SERIAL PRIMARY KEY,
    started_at  TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    status      TEXT DEFAULT 'running',
    modules     TEXT DEFAULT '',
    errors      TEXT DEFAULT '',
    records     INTEGER DEFAULT 0,
    triggered   TEXT DEFAULT 'auto'
);
CREATE INDEX IF NOT EXISTS idx_sync_log_started ON sync_log(started_at);

-- ── Последовательности для tasks (совместимость с явными id) ─────────
SELECT setval(pg_get_serial_sequence('tasks', 'id'), COALESCE((SELECT MAX(id) FROM tasks), 1), false);
