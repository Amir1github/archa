"""
╔══════════════════════════════════════════════════════════════════╗
║         ПОЙТАХТ — Корпоративная система управления              ║
║         FastAPI Backend v7.0                                    ║
║                                                                  ║
║  Запуск локально:                                               ║
║    pip install -r requirements.txt                              ║
║    uvicorn server:app --host 0.0.0.0 --port 8000 --reload       ║
║                                                                  ║
║  Railway (Procfile):                                            ║
║    web: uvicorn server:app --host 0.0.0.0 --port $PORT          ║
╚══════════════════════════════════════════════════════════════════╝
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import json, os, asyncio, aiohttp, sqlite3, logging, hashlib, hmac
from google import genai as google_genai
from google.genai import types as genai_types
from datetime import datetime, date, timedelta
from contextlib import asynccontextmanager

# ── Логирование ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("poytakht")

# ── Конфигурация из переменных окружения ───────────────────────────────
ONEC_URL    = os.getenv("ONEC_URL",  "")
ONEC_USER   = os.getenv("ONEC_USER", "Администратор")
ONEC_PASS   = os.getenv("ONEC_PASS", "")
DB_PATH     = os.getenv("DB_PATH",   "poytakht.db")
SECRET_KEY  = os.getenv("SECRET_KEY", "poytakht-secret-2025")
SYNC_INTERVAL = int(os.getenv("SYNC_INTERVAL", "600"))  # секунд (10 мин)

# ══════════════════════════════════════════════════════════════════════
# WebSocket менеджер — рассылка событий всем подключённым клиентам
# ══════════════════════════════════════════════════════════════════════
class ConnectionManager:
    def __init__(self):
        self.active: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.append(ws)
        log.info(f"WS подключён. Всего: {len(self.active)}")

    def disconnect(self, ws: WebSocket):
        if ws in self.active:
            self.active.remove(ws)

    async def broadcast(self, event: str, data: Any):
        if not self.active:
            return
        msg = json.dumps({"event": event, "data": data, "ts": datetime.now().isoformat(timespec="seconds")}, ensure_ascii=False)
        dead = []
        for ws in self.active:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)

    async def send_to(self, emp_id: int, event: str, data: Any):
        """Отправить конкретному сотруднику (если несколько устройств — всем его)"""
        await self.broadcast(event, {**data, "_target_emp": emp_id})

ws_manager = ConnectionManager()

# ══════════════════════════════════════════════════════════════════════
# База данных SQLite
# ══════════════════════════════════════════════════════════════════════
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def row_to_dict(row) -> Optional[dict]:
    return dict(row) if row else None

def rows_to_list(rows) -> List[dict]:
    return [dict(r) for r in rows]

def strip_pin(emp: Optional[dict]) -> Optional[dict]:
    """Маскировать PIN: вернуть '*' если установлен, иначе None."""
    if emp is None:
        return None
    result = dict(emp)
    result["pin"] = "*" if result.get("pin") else None
    return result

def strip_pins(emps: List[dict]) -> List[dict]:
    return [strip_pin(e) for e in emps]  # type: ignore

def init_db():
    db = get_db()
    db.executescript("""
    -- ── Сотрудники ──────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS employees (
        id          INTEGER PRIMARY KEY,
        name        TEXT    NOT NULL,
        role        TEXT    DEFAULT '',
        color       TEXT    DEFAULT '#1a7a3c',
        bg          TEXT    DEFAULT '#1a7a3c20',
        is_hr       INTEGER DEFAULT 0,
        is_admin    INTEGER DEFAULT 0,
        salary      INTEGER DEFAULT 0,
        tg_id       INTEGER,
        created_at  TEXT    DEFAULT (datetime('now'))
    );

    -- ── Задачи ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS tasks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        description TEXT    DEFAULT '',
        emp_id      INTEGER DEFAULT 1,
        priority    TEXT    DEFAULT 'Средний',
        category    TEXT    DEFAULT 'Прочее',
        due_date    TEXT,
        status      TEXT    DEFAULT 'Новая',
        progress    INTEGER DEFAULT 0,
        created_at  TEXT    DEFAULT (datetime('now')),
        updated_at  TEXT    DEFAULT (datetime('now')),
        FOREIGN KEY(emp_id) REFERENCES employees(id)
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_emp      ON tasks(emp_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_due      ON tasks(due_date);

    CREATE TABLE IF NOT EXISTS task_comments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id     INTEGER NOT NULL,
        emp_id      INTEGER NOT NULL,
        text        TEXT    NOT NULL,
        created_at  TEXT    DEFAULT (datetime('now')),
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(emp_id)  REFERENCES employees(id)
    );

    -- ── Посещаемость ────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS attendance (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        emp_id      INTEGER NOT NULL,
        date        TEXT    NOT NULL,
        time_in     TEXT,
        time_out    TEXT,
        lat         REAL,
        lng         REAL,
        in_addr     TEXT    DEFAULT '',
        out_lat     REAL,
        out_lng     REAL,
        status      TEXT    DEFAULT 'absent',
        auto_in     INTEGER DEFAULT 0,
        auto_out    INTEGER DEFAULT 0,
        late_min    INTEGER DEFAULT 0,
        early_min   INTEGER DEFAULT 0,
        created_at  TEXT    DEFAULT (datetime('now')),
        UNIQUE(emp_id, date),
        FOREIGN KEY(emp_id) REFERENCES employees(id)
    );
    CREATE INDEX IF NOT EXISTS idx_att_date   ON attendance(date);
    CREATE INDEX IF NOT EXISTS idx_att_emp    ON attendance(emp_id);

    -- ── Дебиторы ────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS debtors (
        id              TEXT    PRIMARY KEY,
        name            TEXT    NOT NULL,
        inn             TEXT    DEFAULT '',
        manager_id      INTEGER DEFAULT 1,
        debt            REAL    DEFAULT 0,
        overdue_days    INTEGER DEFAULT 0,
        due_date        TEXT    DEFAULT '',
        invoice_date    TEXT    DEFAULT '',
        last_payment    TEXT    DEFAULT '',
        status          TEXT    DEFAULT 'negotiating',
        source          TEXT    DEFAULT 'manual',
        updated_at      TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_debt_manager  ON debtors(manager_id);
    CREATE INDEX IF NOT EXISTS idx_debt_overdue  ON debtors(overdue_days);

    CREATE TABLE IF NOT EXISTS debtor_comments (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        debtor_id   TEXT    NOT NULL,
        emp_id      INTEGER NOT NULL,
        text        TEXT    NOT NULL,
        due_promise TEXT,
        created_at  TEXT    DEFAULT (datetime('now')),
        FOREIGN KEY(debtor_id) REFERENCES debtors(id) ON DELETE CASCADE
    );

    -- ── Склад ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS warehouse (
        id              TEXT    PRIMARY KEY,
        name            TEXT    NOT NULL,
        sku             TEXT    DEFAULT '',
        category        TEXT    DEFAULT 'Прочее',
        qty             REAL    DEFAULT 0,
        unit            TEXT    DEFAULT 'шт',
        min_qty         REAL    DEFAULT 0,
        price           REAL    DEFAULT 0,
        warehouse_name  TEXT    DEFAULT 'Склад №1',
        supplier        TEXT    DEFAULT '',
        last_in         TEXT    DEFAULT '',
        source          TEXT    DEFAULT 'manual',
        updated_at      TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_wh_cat  ON warehouse(category);
    CREATE INDEX IF NOT EXISTS idx_wh_qty  ON warehouse(qty);

    -- ── Продажи ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS sales_facts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        manager_id  INTEGER NOT NULL,
        period      TEXT    NOT NULL,
        amount      REAL    DEFAULT 0,
        updated_at  TEXT    DEFAULT (datetime('now')),
        UNIQUE(manager_id, period)
    );

    CREATE TABLE IF NOT EXISTS sales_plans (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        manager_id  INTEGER NOT NULL,
        period      TEXT    NOT NULL,
        amount      REAL    DEFAULT 0,
        updated_at  TEXT    DEFAULT (datetime('now')),
        UNIQUE(manager_id, period)
    );

    -- ── История продаж (для прогноза) ────────────────────────────────
    CREATE TABLE IF NOT EXISTS sales_history (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        year            INTEGER NOT NULL,
        month           INTEGER,           -- NULL = годовой агрегат
        category        TEXT    DEFAULT '', -- группа номенклатуры
        nomenclature_id TEXT    DEFAULT '',
        nomenclature    TEXT    DEFAULT '',
        supplier        TEXT    DEFAULT '',
        manager_id      INTEGER DEFAULT 0,
        amount          REAL    DEFAULT 0,
        qty             REAL    DEFAULT 0,
        purchase_amount REAL    DEFAULT 0,
        source          TEXT    DEFAULT '1c',
        UNIQUE(year, month, nomenclature_id, manager_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sh_year  ON sales_history(year);
    CREATE INDEX IF NOT EXISTS idx_sh_cat   ON sales_history(category);

    -- ── Офисы и геозоны ─────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS offices (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL,
        lat         REAL    NOT NULL,
        lng         REAL    NOT NULL,
        radius      INTEGER DEFAULT 200,
        active      INTEGER DEFAULT 1
    );

    -- ── Настройки ───────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS settings (
        key     TEXT PRIMARY KEY,
        value   TEXT,
        updated TEXT DEFAULT (datetime('now'))
    );

    -- ── Уведомления ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS notifications (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        emp_id      INTEGER,
        type        TEXT    DEFAULT 'info',
        title       TEXT    NOT NULL,
        body        TEXT    DEFAULT '',
        read        INTEGER DEFAULT 0,
        created_at  TEXT    DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_notif_emp  ON notifications(emp_id, read);
    """)
    db.commit()
    # ── Миграции (добавляем колонки если их нет) ───────────────────────
    for col, definition in [
        ("phone",    "TEXT DEFAULT ''"),
        ("bio",      "TEXT DEFAULT ''"),
        ("avatar",   "TEXT DEFAULT ''"),
        ("pin",      "TEXT DEFAULT NULL"),
    ]:
        try:
            db.execute(f"ALTER TABLE employees ADD COLUMN {col} {definition}")
            db.commit()
        except Exception:
            pass
    for col, definition in [
        ("due_time", "TEXT DEFAULT ''"),
    ]:
        try:
            db.execute(f"ALTER TABLE tasks ADD COLUMN {col} {definition}")
            db.commit()
        except Exception:
            pass
    _seed_demo(db)
    db.close()
    log.info(f"БД инициализирована: {DB_PATH}")

_REAL_EMP_1_NAME = "Абдугафоров Бахром Давронович"
_OLD_DEMO_NAMES  = {
    "Зарина М.", "Усмон Н.", "Нилуфар С.", "Камол Р.", "Фаррух Т.",
    "Бехруз А.", "Малика Р.", "Санам Т.", "Зарина Маматова",
}

def _seed_demo(db):
    # ── Принудительная замена старых демо-данных на реальных сотрудников ──
    first = db.execute("SELECT name FROM employees WHERE id=1").fetchone()
    if first and first[0] in _OLD_DEMO_NAMES:
        log.info("Обнаружены старые демо-данные — выполняется замена на реальных сотрудников")
        for tbl in ["task_comments", "tasks", "attendance",
                    "debtor_comments", "debtors",
                    "sales_facts", "sales_plans", "sales_history",
                    "notifications", "employees"]:
            try:
                db.execute(f"DELETE FROM {tbl}")
            except Exception:
                pass
        db.commit()

    # ── Сотрудники ─────────────────────────────────────────────────────────
    if not db.execute("SELECT 1 FROM employees LIMIT 1").fetchone():
        # (id, name, role, color, bg, is_hr, is_admin, salary)
        employees = [
            (1,  "Абдугафоров Бахром Давронович",   "Директор",                                  "#1a7a3c","#1a7a3c20",0,1,0),
            (2,  "Умаров Усмончон Саидчонович",      "Главный бухгалтер",                         "#1a5fb4","#1a5fb420",0,0,0),
            (3,  "Юсупова Шахноза Давроновна",       "Материальный бухгалтер",                    "#9b72ff","#9b72ff20",0,0,0),
            (4,  "Кодиров Фируз Хайбуллоевич",       "Кассир",                                    "#d68910","#d6891020",0,0,0),
            (5,  "Абдугафоров Хасан Давронович",     "Бухгалтер",                                 "#117a8b","#117a8b20",0,0,0),
            (6,  "Олимова Мадина Садриддиновна",     "HR",                                        "#c0392b","#c0392b20",1,0,0),
            (7,  "Абдугафоров Мумин",                "Маркетолог",                                "#e67e22","#e67e2220",0,0,0),
            (8,  "Абдугафоров Мубин",                "Ст. менеджер отдел ИФ",                     "#2980b9","#2980b920",0,0,0),
            (9,  "Абдугафоров Хусейнчон",            "Ст. менеджер отдел Сандали",                "#8e44ad","#8e44ad20",0,0,0),
            (10, "Бозоров Хикматулло",               "Менеджер КФ",                               "#16a085","#16a08520",0,0,0),
            (11, "Ерибеки Собирджон",                "Ст. менеджер отдела по работе с проектами", "#27ae60","#27ae6020",0,0,0),
            (12, "Юсупов Саидчон Бахтиерович",       "Зав шоурума Шестопалова",                   "#f39c12","#f39c1220",0,0,0),
            (13, "Тиллоев Насруллох Фатхуллоевич",   "Зав ТЦ Галерея",                            "#d35400","#d3540020",0,0,0),
            (14, "Тиллозода Косим",                  "Менеджер",                                  "#2c3e50","#2c3e5020",0,0,0),
            (15, "Элмуродов Хабибулло",              "Менеджер в ТЦ Кушониен",                    "#6d4c41","#6d4c4120",0,0,0),
            (16, "Элмуродов Мухаммадрофе",           "Менеджер в ТЦ Вахдат",                      "#00695c","#00695c20",0,0,0),
            (17, "Каримова Курбонгул",               "Уборщица Вахдат",                           "#7f8c8d","#7f8c8d20",0,0,0),
            (18, "Давлятов Идрис",                   "Водитель автопарка",                        "#1a7a3c","#1a7a3c20",0,0,0),
            (19, "Рахимов Лоик",                     "Водитель автопарка",                        "#9b72ff","#9b72ff20",0,0,0),
            (20, "Азизкулов Далер",                  "Менеджер по продажам ТЦ Рахмон Набиев",     "#d68910","#d6891020",0,0,0),
            (21, "Одинаев Зафар",                    "Зав склад",                                 "#1a5fb4","#1a5fb420",0,0,0),
            (22, "Дилнозаи Абдучалил",               "Менеджер по продажам Сандали",              "#117a8b","#117a8b20",0,0,0),
            (23, "Очилов Мухаммадхон",               "Ст. менеджер отдела Сп",                    "#c0392b","#c0392b20",0,0,0),
            (24, "Холов Хуршед",                     "Менеджер в Шестопалова",                    "#e67e22","#e67e2220",0,0,0),
            (25, "Тиллоев Кароматулло",              "Менеджер в Шестопалова",                    "#2980b9","#2980b920",0,0,0),
            (26, "Тошева Махина",                    "Логист",                                    "#8e44ad","#8e44ad20",0,0,0),
            (27, "Ашуров Наврузшох Хотамович",       "Директор производства",                     "#1a7a3c","#1a7a3c20",0,0,0),
            (28, "Джабборов Шахром",                 "Оператор",                                  "#6d4c41","#6d4c4120",0,0,0),
            (29, "Ашуров Комрон",                    "Конструктор",                               "#16a085","#16a08520",0,0,0),
            (30, "Халимов Сандактам",                "Муовини директор",                          "#2c3e50","#2c3e5020",0,0,0),
            (31, "Шодиев Масъуд",                    "Установщик",                                "#7f8c8d","#7f8c8d20",0,0,0),
            (32, "Файзов Мухаммадюсуф",              "Установщик",                                "#6c3483","#6c348320",0,0,0),
        ]
        db.executemany(
            "INSERT OR IGNORE INTO employees(id,name,role,color,bg,is_hr,is_admin,salary) VALUES(?,?,?,?,?,?,?,?)",
            employees,
        )

    # ── Офис ──────────────────────────────────────────────────────────────
    if not db.execute("SELECT 1 FROM offices LIMIT 1").fetchone():
        db.execute("INSERT INTO offices(name,lat,lng,radius) VALUES('Главный офис',38.5598,68.7738,200)")

    db.commit()
    log.info("Данные сотрудников загружены (%d чел.)",
             db.execute("SELECT COUNT(*) FROM employees").fetchone()[0])

# ══════════════════════════════════════════════════════════════════════
# Lifespan — старт/стоп
# ══════════════════════════════════════════════════════════════════════
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    asyncio.create_task(sync_1c_loop())
    asyncio.create_task(daily_scheduler())
    log.info("🟢 Пойтахт сервер v7.0 запущен")
    yield
    log.info("🔴 Сервер остановлен")

# ══════════════════════════════════════════════════════════════════════
# FastAPI приложение
# ══════════════════════════════════════════════════════════════════════
app = FastAPI(
    title="Пойтахт API",
    version="7.0",
    description="Корпоративная система управления — Душанбе, Таджикистан",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ══════════════════════════════════════════════════════════════════════
# Pydantic модели
# ══════════════════════════════════════════════════════════════════════
class TaskCreate(BaseModel):
    name: str
    description: str = ""
    emp_id: int = 1
    priority: str = "Средний"
    category: str = "Прочее"
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    status: str = "Новая"
    progress: int = Field(0, ge=0, le=100)

class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    emp_id: Optional[int] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    due_date: Optional[str] = None
    due_time: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[int] = None

class CommentCreate(BaseModel):
    emp_id: int
    text: str

class AttendanceUpsert(BaseModel):
    emp_id: int
    date: str
    time_in: Optional[str] = None
    time_out: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    out_lat: Optional[float] = None
    out_lng: Optional[float] = None
    in_addr: Optional[str] = ""
    status: str = "present"
    auto_in: bool = False
    auto_out: bool = False
    late_min: int = 0
    early_min: int = 0

class DebtorCommentCreate(BaseModel):
    emp_id: int
    text: str
    due_promise: Optional[str] = None

class DebtorStatusUpdate(BaseModel):
    status: str

class SalesPlanUpdate(BaseModel):
    manager_id: int
    period: str
    amount: float

class EmployeeCreate(BaseModel):
    id: int
    name: str
    role: str = ""
    color: str = "#1a7a3c"
    bg: str = "#1a7a3c20"
    is_hr: bool = False
    is_admin: bool = False
    salary: int = 0
    tg_id: Optional[int] = None

class OfficeCreate(BaseModel):
    name: str
    lat: float
    lng: float
    radius: int = 200

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    tg_id: Optional[int] = None
    color: Optional[str] = None
    avatar: Optional[str] = None

class PinRequest(BaseModel):
    new_pin: str
    old_pin: Optional[str] = None

class LoginRequest(BaseModel):
    emp_id: int
    pin: str

class SettingUpdate(BaseModel):
    key: str
    value: str

# ══════════════════════════════════════════════════════════════════════
# WebSocket
# ══════════════════════════════════════════════════════════════════════
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        while True:
            msg = await ws.receive_text()
            # Ping-pong для keep-alive
            if msg == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception:
        ws_manager.disconnect(ws)

# ══════════════════════════════════════════════════════════════════════
# СОТРУДНИКИ
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/employees", tags=["employees"])
def get_employees():
    db = get_db()
    rows = rows_to_list(db.execute("SELECT * FROM employees ORDER BY id").fetchall())
    db.close()
    return strip_pins(rows)

@app.post("/api/employees", status_code=201, tags=["employees"])
async def create_employee(emp: EmployeeCreate):
    db = get_db()
    db.execute("INSERT OR REPLACE INTO employees(id,name,role,color,bg,is_hr,is_admin,salary,tg_id) VALUES(?,?,?,?,?,?,?,?,?)",
        (emp.id, emp.name, emp.role, emp.color, emp.bg, int(emp.is_hr), int(emp.is_admin), emp.salary, emp.tg_id))
    db.commit()
    rec = row_to_dict(db.execute("SELECT * FROM employees WHERE id=?", (emp.id,)).fetchone())
    db.close()
    await ws_manager.broadcast("employee_updated", rec)
    return rec

# ══════════════════════════════════════════════════════════════════════
# ПРОФИЛЬ / АВТОРИЗАЦИЯ
# ══════════════════════════════════════════════════════════════════════
@app.post("/api/auth/login", tags=["auth"])
async def auth_login(req: LoginRequest):
    db = get_db()
    emp = row_to_dict(db.execute("SELECT * FROM employees WHERE id=?", (req.emp_id,)).fetchone())
    db.close()
    if not emp:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    saved_pin = emp.get("pin")
    if saved_pin:
        if req.pin != saved_pin:
            raise HTTPException(status_code=401, detail="Неверный PIN-код")
    return {"success": True, "employee": strip_pin(emp)}

@app.put("/api/employees/{emp_id}/profile", tags=["employees"])
async def update_profile(emp_id: int, p: ProfileUpdate):
    db = get_db()
    emp = row_to_dict(db.execute("SELECT * FROM employees WHERE id=?", (emp_id,)).fetchone())
    if not emp:
        db.close()
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    fields, vals = [], []
    if p.name    is not None: fields.append("name=?");   vals.append(p.name)
    if p.role    is not None: fields.append("role=?");   vals.append(p.role)
    if p.phone   is not None: fields.append("phone=?");  vals.append(p.phone)
    if p.bio     is not None: fields.append("bio=?");    vals.append(p.bio)
    if p.tg_id   is not None: fields.append("tg_id=?");  vals.append(p.tg_id)
    if p.color   is not None: fields.append("color=?");  vals.append(p.color)
    if p.avatar  is not None: fields.append("avatar=?"); vals.append(p.avatar)
    if fields:
        db.execute(f"UPDATE employees SET {', '.join(fields)} WHERE id=?", vals + [emp_id])
        db.commit()
    rec = row_to_dict(db.execute("SELECT * FROM employees WHERE id=?", (emp_id,)).fetchone())
    db.close()
    await ws_manager.broadcast("employee_updated", strip_pin(rec))
    return strip_pin(rec)

@app.put("/api/employees/{emp_id}/pin", tags=["employees"])
async def update_pin(emp_id: int, req: PinRequest):
    db = get_db()
    emp = row_to_dict(db.execute("SELECT * FROM employees WHERE id=?", (emp_id,)).fetchone())
    if not emp:
        db.close()
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    if emp.get("pin") and req.old_pin != emp["pin"]:
        db.close()
        raise HTTPException(status_code=401, detail="Неверный текущий PIN")
    if not req.new_pin or len(req.new_pin) != 4 or not req.new_pin.isdigit():
        raise HTTPException(status_code=400, detail="PIN должен быть 4-значным числом")
    db.execute("UPDATE employees SET pin=? WHERE id=?", (req.new_pin, emp_id))
    db.commit()
    db.close()
    return {"success": True}

# ══════════════════════════════════════════════════════════════════════
# ЗАДАЧИ
# ══════════════════════════════════════════════════════════════════════
def _build_task(row: dict) -> dict:
    """Добавить комментарии к задаче"""
    return row  # комментарии подгружаются в get_tasks через JOIN

@app.get("/api/tasks", tags=["tasks"])
def get_tasks(
    status:   Optional[str] = Query(None),
    emp_id:   Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    limit:    int = Query(200, le=500),
):
    db = get_db()
    q = """SELECT t.*,
        GROUP_CONCAT(c.id||'|'||c.emp_id||'|'||c.text||'|'||c.created_at, ';;') AS comms
        FROM tasks t
        LEFT JOIN task_comments c ON c.task_id = t.id"""
    params, wheres = [], []
    if status:   wheres.append("t.status=?");   params.append(status)
    if emp_id:   wheres.append("t.emp_id=?");   params.append(emp_id)
    if category: wheres.append("t.category=?"); params.append(category)
    if wheres: q += " WHERE " + " AND ".join(wheres)
    q += f" GROUP BY t.id ORDER BY t.id DESC LIMIT {limit}"
    result = []
    for row in db.execute(q, params).fetchall():
        d = dict(row)
        raw = d.pop("comms") or ""
        d["comments"] = []
        if raw:
            for c in raw.split(";;"):
                parts = c.split("|", 3)
                if len(parts) == 4:
                    d["comments"].append({"id": int(parts[0]), "emp_id": int(parts[1]), "text": parts[2], "created_at": parts[3]})
        result.append(d)
    db.close()
    return result

@app.post("/api/tasks", status_code=201, tags=["tasks"])
async def create_task(task: TaskCreate):
    db = get_db()
    cur = db.execute(
        "INSERT INTO tasks(name,description,emp_id,priority,category,due_date,due_time,status,progress) VALUES(?,?,?,?,?,?,?,?,?)",
        (task.name, task.description, task.emp_id, task.priority, task.category,
         task.due_date, task.due_time or "", task.status, task.progress)
    )
    db.commit()
    new = row_to_dict(db.execute("SELECT * FROM tasks WHERE id=?", (cur.lastrowid,)).fetchone())
    new["comments"] = []
    # Уведомление исполнителю
    if task.emp_id and task.emp_id > 0:
        parts = []
        if task.due_date: parts.append(f"срок: {task.due_date}")
        if task.due_time: parts.append(f"время: {task.due_time}")
        due_str = f" ({', '.join(parts)})" if parts else ""
        db.execute(
            "INSERT INTO notifications(emp_id, type, title, body) VALUES(?,?,?,?)",
            (task.emp_id, "task", "Новая задача",
             f"Вам назначена задача: «{task.name}»{due_str}")
        )
        db.commit()
    db.close()
    await ws_manager.broadcast("task_created", new)
    return new

@app.get("/api/tasks/{task_id}", tags=["tasks"])
def get_task(task_id: int):
    db = get_db()
    task = row_to_dict(db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone())
    if not task:
        db.close()
        raise HTTPException(404, "Задача не найдена")
    task["comments"] = rows_to_list(db.execute(
        "SELECT * FROM task_comments WHERE task_id=? ORDER BY created_at", (task_id,)).fetchall())
    db.close()
    return task

@app.put("/api/tasks/{task_id}", tags=["tasks"])
async def update_task(task_id: int, update: TaskUpdate):
    db = get_db()
    fields = {k: v for k, v in update.dict(exclude_none=True).items()}
    if not fields:
        raise HTTPException(400, "Нет полей для обновления")
    fields["updated_at"] = datetime.now().isoformat(timespec="seconds")
    set_clause = ", ".join(f"{k}=?" for k in fields)
    db.execute(f"UPDATE tasks SET {set_clause} WHERE id=?", list(fields.values()) + [task_id])
    db.commit()
    task = row_to_dict(db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone())
    db.close()
    if not task:
        raise HTTPException(404)
    await ws_manager.broadcast("task_updated", task)
    return task

@app.delete("/api/tasks/{task_id}", tags=["tasks"])
async def delete_task(task_id: int):
    db = get_db()
    db.execute("DELETE FROM task_comments WHERE task_id=?", (task_id,))
    db.execute("DELETE FROM tasks WHERE id=?", (task_id,))
    db.commit()
    db.close()
    await ws_manager.broadcast("task_deleted", {"id": task_id})
    return {"ok": True}

@app.post("/api/tasks/{task_id}/comments", tags=["tasks"])
async def add_task_comment(task_id: int, c: CommentCreate):
    db = get_db()
    cur = db.execute(
        "INSERT INTO task_comments(task_id,emp_id,text) VALUES(?,?,?)",
        (task_id, c.emp_id, c.text)
    )
    db.commit()
    new_c = row_to_dict(db.execute("SELECT * FROM task_comments WHERE id=?", (cur.lastrowid,)).fetchone())
    db.execute("UPDATE tasks SET updated_at=datetime('now') WHERE id=?", (task_id,))
    db.commit()
    db.close()
    await ws_manager.broadcast("task_comment_added", {"task_id": task_id, "comment": new_c})
    return new_c

# ══════════════════════════════════════════════════════════════════════
# УВЕДОМЛЕНИЯ
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/notifications", tags=["notifications"])
def get_notifications(emp_id: int = Query(...)):
    db = get_db()
    rows = rows_to_list(db.execute(
        "SELECT * FROM notifications WHERE emp_id=? ORDER BY created_at DESC LIMIT 50",
        (emp_id,)
    ).fetchall())
    db.close()
    return rows

@app.put("/api/notifications/{notif_id}/read", tags=["notifications"])
def mark_read(notif_id: int):
    db = get_db()
    db.execute("UPDATE notifications SET read=1 WHERE id=?", (notif_id,))
    db.commit()
    db.close()
    return {"ok": True}

@app.put("/api/notifications/read-all", tags=["notifications"])
def mark_all_read(emp_id: int = Query(...)):
    db = get_db()
    db.execute("UPDATE notifications SET read=1 WHERE emp_id=?", (emp_id,))
    db.commit()
    db.close()
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════
# ПОСЕЩАЕМОСТЬ / HR
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/attendance", tags=["hr"])
def get_attendance(
    date:   Optional[str] = Query(None),
    emp_id: Optional[int] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date:   Optional[str] = Query(None),
):
    db = get_db()
    q = "SELECT * FROM attendance"
    params, wheres = [], []
    if date:      wheres.append("date=?");          params.append(date)
    if emp_id:    wheres.append("emp_id=?");         params.append(emp_id)
    if from_date: wheres.append("date>=?");          params.append(from_date)
    if to_date:   wheres.append("date<=?");          params.append(to_date)
    if wheres: q += " WHERE " + " AND ".join(wheres)
    q += " ORDER BY date DESC, emp_id"
    rows = rows_to_list(db.execute(q, params).fetchall())
    db.close()
    return rows

@app.post("/api/attendance", tags=["hr"])
async def upsert_attendance(a: AttendanceUpsert):
    db = get_db()
    db.execute("""
        INSERT INTO attendance(emp_id,date,time_in,time_out,lat,lng,out_lat,out_lng,in_addr,status,auto_in,auto_out,late_min,early_min)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(emp_id,date) DO UPDATE SET
            time_in  = COALESCE(excluded.time_in,  time_in),
            time_out = COALESCE(excluded.time_out, time_out),
            lat      = COALESCE(excluded.lat,  lat),
            lng      = COALESCE(excluded.lng,  lng),
            out_lat  = COALESCE(excluded.out_lat, out_lat),
            out_lng  = COALESCE(excluded.out_lng, out_lng),
            in_addr  = COALESCE(excluded.in_addr, in_addr),
            status   = excluded.status,
            auto_in  = excluded.auto_in,
            auto_out = excluded.auto_out,
            late_min = excluded.late_min,
            early_min= excluded.early_min
    """, (a.emp_id, a.date, a.time_in, a.time_out, a.lat, a.lng, a.out_lat, a.out_lng,
          a.in_addr, a.status, int(a.auto_in), int(a.auto_out), a.late_min, a.early_min))
    db.commit()
    rec = row_to_dict(db.execute("SELECT * FROM attendance WHERE emp_id=? AND date=?", (a.emp_id, a.date)).fetchone())
    db.close()
    await ws_manager.broadcast("attendance_updated", rec)
    return rec

@app.get("/api/attendance/report", tags=["hr"])
def attendance_report(
    emp_id: Optional[int] = Query(None),
    year:   int = Query(date.today().year),
    month:  int = Query(date.today().month),
):
    db = get_db()
    q = """
        SELECT emp_id,
            COUNT(*) AS total_days,
            SUM(CASE WHEN status='present'   THEN 1 ELSE 0 END) AS present,
            SUM(CASE WHEN status='late'      THEN 1 ELSE 0 END) AS late,
            SUM(CASE WHEN status='absent'    THEN 1 ELSE 0 END) AS absent,
            SUM(CASE WHEN status='early_out' THEN 1 ELSE 0 END) AS early_out,
            SUM(late_min)  AS total_late_min,
            SUM(early_min) AS total_early_min
        FROM attendance
        WHERE strftime('%Y',date)=? AND strftime('%m',date)=?
    """
    params = [str(year), str(month).zfill(2)]
    if emp_id:
        q += " AND emp_id=?"
        params.append(emp_id)
    q += " GROUP BY emp_id"
    rows = rows_to_list(db.execute(q, params).fetchall())
    db.close()
    return rows

@app.get("/api/offices", tags=["hr"])
def get_offices():
    db = get_db()
    rows = rows_to_list(db.execute("SELECT * FROM offices WHERE active=1").fetchall())
    db.close()
    return rows

@app.post("/api/offices", status_code=201, tags=["hr"])
async def create_office(office: OfficeCreate):
    db = get_db()
    cur = db.execute("INSERT INTO offices(name,lat,lng,radius) VALUES(?,?,?,?)",
        (office.name, office.lat, office.lng, office.radius))
    db.commit()
    rec = row_to_dict(db.execute("SELECT * FROM offices WHERE id=?", (cur.lastrowid,)).fetchone())
    db.close()
    await ws_manager.broadcast("office_created", rec)
    return rec

@app.delete("/api/offices/{office_id}", tags=["hr"])
async def delete_office(office_id: int):
    db = get_db()
    db.execute("UPDATE offices SET active=0 WHERE id=?", (office_id,))
    db.commit()
    db.close()
    await ws_manager.broadcast("office_deleted", {"id": office_id})
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════
# ДЕБИТОРЫ
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/debtors", tags=["debtors"])
def get_debtors(
    manager_id: Optional[int] = Query(None),
    status:     Optional[str] = Query(None),
):
    db = get_db()
    q = """
        SELECT d.*,
            GROUP_CONCAT(c.id||'|'||c.emp_id||'|'||c.text||'|'||COALESCE(c.due_promise,'')||'|'||c.created_at, ';;') AS comms
        FROM debtors d
        LEFT JOIN debtor_comments c ON c.debtor_id = d.id
    """
    params, wheres = [], []
    if manager_id: wheres.append("d.manager_id=?"); params.append(manager_id)
    if status:     wheres.append("d.status=?");     params.append(status)
    if wheres: q += " WHERE " + " AND ".join(wheres)
    q += " GROUP BY d.id ORDER BY d.debt DESC"
    result = []
    for row in db.execute(q, params).fetchall():
        d = dict(row)
        raw = d.pop("comms") or ""
        d["comments"] = []
        if raw:
            for c in raw.split(";;"):
                parts = c.split("|", 4)
                if len(parts) == 5:
                    d["comments"].append({
                        "id": int(parts[0]), "emp_id": int(parts[1]),
                        "text": parts[2], "due_promise": parts[3] or None,
                        "created_at": parts[4]
                    })
        result.append(d)
    db.close()
    return result

@app.post("/api/debtors/{debtor_id}/comments", tags=["debtors"])
async def add_debtor_comment(debtor_id: str, c: DebtorCommentCreate):
    db = get_db()
    db.execute("INSERT INTO debtor_comments(debtor_id,emp_id,text,due_promise) VALUES(?,?,?,?)",
        (debtor_id, c.emp_id, c.text, c.due_promise))
    db.commit()
    db.close()
    await ws_manager.broadcast("debtor_comment_added", {"debtor_id": debtor_id, "emp_id": c.emp_id})
    return {"ok": True}

@app.put("/api/debtors/{debtor_id}/status", tags=["debtors"])
async def update_debtor_status(debtor_id: str, u: DebtorStatusUpdate):
    db = get_db()
    db.execute("UPDATE debtors SET status=?, updated_at=datetime('now') WHERE id=?", (u.status, debtor_id))
    db.commit()
    db.close()
    await ws_manager.broadcast("debtor_updated", {"id": debtor_id, "status": u.status})
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════
# СКЛАД
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/warehouse", tags=["warehouse"])
def get_warehouse(
    category: Optional[str] = Query(None),
    supplier: Optional[str] = Query(None),
    q:        Optional[str] = Query(None),
    low_only: bool = Query(False),
):
    db = get_db()
    sql = "SELECT * FROM warehouse"
    params, wheres = [], []
    if category and category != "Все": wheres.append("category=?"); params.append(category)
    if supplier and supplier != "Все поставщики": wheres.append("supplier=?"); params.append(supplier)
    if q: wheres.append("(name LIKE ? OR sku LIKE ?)"); params += [f"%{q}%", f"%{q}%"]
    if low_only: wheres.append("qty <= min_qty")
    if wheres: sql += " WHERE " + " AND ".join(wheres)
    sql += " ORDER BY CASE WHEN qty=0 THEN 0 WHEN qty<min_qty THEN 1 ELSE 2 END, name"
    rows = rows_to_list(db.execute(sql, params).fetchall())
    db.close()
    return rows

class WarehouseCreateBody(BaseModel):
    name: str
    sku: str = ""
    category: str = "Прочее"
    qty: float = 0
    unit: str = "шт"
    min_qty: float = 0
    price: float = 0
    warehouse_name: str = "Склад №1"
    supplier: str = ""

@app.post("/api/warehouse", tags=["warehouse"], status_code=201)
def create_warehouse_item(body: WarehouseCreateBody):
    """Добавить новый товар на склад"""
    db = get_db()
    import uuid
    item_id = "W" + str(uuid.uuid4())[:7].upper()
    db.execute(
        """INSERT INTO warehouse (id, name, sku, category, qty, unit, min_qty, price, warehouse_name, supplier, last_in, source, photo)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), 'manual', '')""",
        (item_id, body.name.strip(), body.sku.strip(), body.category.strip(),
         body.qty, body.unit.strip(), body.min_qty, body.price,
         body.warehouse_name.strip(), body.supplier.strip())
    )
    db.commit()
    row = rows_to_list(db.execute("SELECT * FROM warehouse WHERE id=?", (item_id,)).fetchall())
    db.close()
    return row[0]

class WarehousePhotoBody(BaseModel):
    photo: str  # base64 data URL (e.g. "data:image/jpeg;base64,...")

@app.put("/api/warehouse/{item_id}/photo", tags=["warehouse"])
def update_warehouse_photo(item_id: str, body: WarehousePhotoBody):
    """Загрузить или обновить фото товара (base64 data URL)"""
    db = get_db()
    row = db.execute("SELECT id FROM warehouse WHERE id=?", (item_id,)).fetchone()
    if not row:
        db.close()
        raise HTTPException(404, "Товар не найден")
    db.execute(
        "UPDATE warehouse SET photo=?, updated_at=datetime('now') WHERE id=?",
        (body.photo, item_id)
    )
    db.commit()
    db.close()
    return {"ok": True}

@app.delete("/api/warehouse/{item_id}/photo", tags=["warehouse"])
def delete_warehouse_photo(item_id: str):
    """Удалить фото товара"""
    db = get_db()
    db.execute("UPDATE warehouse SET photo='', updated_at=datetime('now') WHERE id=?", (item_id,))
    db.commit()
    db.close()
    return {"ok": True}

@app.get("/api/warehouse/suppliers", tags=["warehouse"])
def get_suppliers():
    db = get_db()
    rows = db.execute("SELECT DISTINCT supplier FROM warehouse WHERE supplier!='' ORDER BY supplier").fetchall()
    db.close()
    return [r[0] for r in rows]

@app.get("/api/warehouse/categories", tags=["warehouse"])
def get_categories():
    db = get_db()
    rows = db.execute("SELECT DISTINCT category FROM warehouse ORDER BY category").fetchall()
    db.close()
    return [r[0] for r in rows]

# ══════════════════════════════════════════════════════════════════════
# ПРОДАЖИ
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/sales/facts", tags=["sales"])
def get_sales_facts(manager_id: Optional[int] = Query(None)):
    db = get_db()
    q = "SELECT * FROM sales_facts"
    params = []
    if manager_id: q += " WHERE manager_id=?"; params.append(manager_id)
    rows = rows_to_list(db.execute(q, params).fetchall())
    db.close()
    return rows

@app.get("/api/sales/plans", tags=["sales"])
def get_sales_plans(manager_id: Optional[int] = Query(None)):
    db = get_db()
    q = "SELECT * FROM sales_plans"
    params = []
    if manager_id: q += " WHERE manager_id=?"; params.append(manager_id)
    rows = rows_to_list(db.execute(q, params).fetchall())
    db.close()
    return rows

@app.put("/api/sales/plans", tags=["sales"])
async def update_sales_plan(p: SalesPlanUpdate):
    db = get_db()
    db.execute("""INSERT INTO sales_plans(manager_id,period,amount,updated_at) VALUES(?,?,?,datetime('now'))
        ON CONFLICT(manager_id,period) DO UPDATE SET amount=excluded.amount,updated_at=datetime('now')""",
        (p.manager_id, p.period, p.amount))
    db.commit()
    db.close()
    await ws_manager.broadcast("sales_plan_updated", p.dict())
    return {"ok": True}

@app.get("/api/sales/history", tags=["sales"])
def get_sales_history(
    year:     Optional[int] = Query(None),
    category: Optional[str] = Query(None),
    supplier: Optional[str] = Query(None),
):
    db = get_db()
    q = "SELECT * FROM sales_history"
    params, wheres = [], []
    if year:     wheres.append("year=?");     params.append(year)
    if category: wheres.append("category=?"); params.append(category)
    if supplier: wheres.append("supplier=?"); params.append(supplier)
    if wheres: q += " WHERE " + " AND ".join(wheres)
    q += " ORDER BY year DESC, month"
    rows = rows_to_list(db.execute(q, params).fetchall())
    db.close()
    return rows

# ══════════════════════════════════════════════════════════════════════
# KPI И СТАТИСТИКА
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/stats", tags=["stats"])
def get_stats():
    db = get_db()
    today = date.today().isoformat()
    month_start = date.today().replace(day=1).isoformat()

    # Задачи
    t_total   = db.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    t_done    = db.execute("SELECT COUNT(*) FROM tasks WHERE status='Выполнена'").fetchone()[0]
    t_wip     = db.execute("SELECT COUNT(*) FROM tasks WHERE status='В работе'").fetchone()[0]
    t_overdue = db.execute("SELECT COUNT(*) FROM tasks WHERE due_date<? AND status!='Выполнена'", (today,)).fetchone()[0]

    # Посещаемость сегодня
    a_present = db.execute("SELECT COUNT(*) FROM attendance WHERE date=? AND status IN ('present','late')", (today,)).fetchone()[0]
    a_late    = db.execute("SELECT COUNT(*) FROM attendance WHERE date=? AND status='late'", (today,)).fetchone()[0]
    a_total   = db.execute("SELECT COUNT(*) FROM employees").fetchone()[0]

    # Дебиторы
    d_total   = db.execute("SELECT COALESCE(SUM(debt),0) FROM debtors").fetchone()[0]
    d_crit    = db.execute("SELECT COUNT(*) FROM debtors WHERE overdue_days>90").fetchone()[0]
    d_no_comm = db.execute("""
        SELECT COUNT(*) FROM debtors d
        WHERE d.status != 'paid'
        AND NOT EXISTS (
            SELECT 1 FROM debtor_comments c
            WHERE c.debtor_id=d.id
            AND c.created_at >= datetime('now', '-7 days')
        )""").fetchone()[0]

    # Склад
    wh_out  = db.execute("SELECT COUNT(*) FROM warehouse WHERE qty=0").fetchone()[0]
    wh_low  = db.execute("SELECT COUNT(*) FROM warehouse WHERE qty>0 AND qty<min_qty").fetchone()[0]

    db.close()
    return {
        "tasks":      {"total": t_total, "done": t_done, "wip": t_wip, "overdue": t_overdue},
        "attendance": {"present": a_present, "late": a_late, "total": a_total, "date": today},
        "debtors":    {"total_debt": round(d_total, 2), "critical": d_crit, "no_comment": d_no_comm},
        "warehouse":  {"out_of_stock": wh_out, "low_stock": wh_low},
        "updated":    datetime.now().isoformat(timespec="minutes"),
    }

# ══════════════════════════════════════════════════════════════════════
# НАСТРОЙКИ
# ══════════════════════════════════════════════════════════════════════
@app.get("/api/settings", tags=["settings"])
def get_settings():
    db = get_db()
    rows = rows_to_list(db.execute("SELECT * FROM settings").fetchall())
    db.close()
    return {r["key"]: r["value"] for r in rows}

@app.put("/api/settings", tags=["settings"])
async def update_setting(s: SettingUpdate):
    db = get_db()
    db.execute("INSERT INTO settings(key,value,updated) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=datetime('now')",
        (s.key, s.value))
    db.commit()
    db.close()
    await ws_manager.broadcast("setting_updated", {"key": s.key})
    return {"ok": True}

# ══════════════════════════════════════════════════════════════════════
# СИНХРОНИЗАЦИЯ С 1С
# ══════════════════════════════════════════════════════════════════════
async def sync_from_1c():
    if not ONEC_URL:
        log.debug("1С не настроена — пропускаем синхронизацию")
        return False

    auth    = aiohttp.BasicAuth(ONEC_USER, ONEC_PASS)
    timeout = aiohttp.ClientTimeout(total=20)
    synced  = []

    async with aiohttp.ClientSession(auth=auth, timeout=timeout) as session:

        # ── Дебиторы ──────────────────────────────────────────────────
        try:
            async with session.get(f"{ONEC_URL}/debtors/list") as r:
                if r.status == 200:
                    data = await r.json(content_type=None)
                    db = get_db()
                    for d in data:
                        db.execute("""
                            INSERT INTO debtors(id,name,inn,manager_id,debt,overdue_days,due_date,invoice_date,last_payment,source,updated_at)
                            VALUES(?,?,?,?,?,?,?,?,?,'1c',datetime('now'))
                            ON CONFLICT(id) DO UPDATE SET
                                debt=excluded.debt, overdue_days=excluded.overdue_days,
                                last_payment=excluded.last_payment, updated_at=datetime('now')
                        """, (d.get("id",""), d.get("name",""), d.get("inn",""), d.get("managerId",1),
                              d.get("debt",0), d.get("overdueDays",0), d.get("dueDate",""),
                              d.get("invoiceDate",""), d.get("lastPayment","")))
                    db.commit()
                    db.close()
                    synced.append(f"дебиторы: {len(data)}")
        except Exception as e:
            log.warning(f"1С дебиторы: {e}")

        # ── Склад ─────────────────────────────────────────────────────
        try:
            async with session.get(f"{ONEC_URL}/warehouse/remains") as r:
                if r.status == 200:
                    data = await r.json(content_type=None)
                    db = get_db()
                    for item in data:
                        db.execute("""
                            INSERT INTO warehouse(id,name,sku,category,qty,unit,min_qty,price,warehouse_name,supplier,source,updated_at)
                            VALUES(?,?,?,?,?,?,?,?,?,?,'1c',datetime('now'))
                            ON CONFLICT(id) DO UPDATE SET
                                qty=excluded.qty, price=excluded.price, updated_at=datetime('now')
                        """, (item.get("id",""), item.get("name",""), item.get("sku",""),
                              item.get("category","Прочее"), item.get("qty",0), item.get("unit","шт"),
                              item.get("minQty",0), item.get("price",0), item.get("warehouse","Склад №1"),
                              item.get("supplier","")))
                    db.commit()
                    db.close()
                    synced.append(f"склад: {len(data)}")
        except Exception as e:
            log.warning(f"1С склад: {e}")

        # ── Продажи план/факт ──────────────────────────────────────────
        try:
            async with session.get(f"{ONEC_URL}/sales/planfact") as r:
                if r.status == 200:
                    data = await r.json(content_type=None)
                    db = get_db()
                    for period in ["day","week","month","quarter","year"]:
                        if period in data:
                            for mgr_id, amount in (data[period].items() if isinstance(data[period], dict) else []):
                                db.execute("""INSERT INTO sales_facts(manager_id,period,amount,updated_at) VALUES(?,?,?,datetime('now'))
                                    ON CONFLICT(manager_id,period) DO UPDATE SET amount=excluded.amount,updated_at=datetime('now')""",
                                    (int(mgr_id), period, amount))
                    db.commit()
                    db.close()
                    synced.append("продажи факт")
        except Exception as e:
            log.warning(f"1С продажи: {e}")

        # ── История продаж для прогноза ────────────────────────────────
        try:
            async with session.get(f"{ONEC_URL}/sales/history") as r:
                if r.status == 200:
                    data = await r.json(content_type=None)
                    db = get_db()
                    # data = {"yearly":[{year, category, amount},...], "nomenclature":[...]}
                    for row in data.get("yearly", []):
                        db.execute("""
                            INSERT OR REPLACE INTO sales_history(year,month,category,amount,source)
                            VALUES(?,NULL,?,?,'1c')
                        """, (row.get("year"), row.get("category",""), row.get("amount",0)))
                    for nom in data.get("nomenclature", []):
                        db.execute("""
                            INSERT OR REPLACE INTO sales_history
                            (year,month,nomenclature_id,nomenclature,category,supplier,amount,qty,source)
                            VALUES(?,?,?,?,?,?,?,?,'1c')
                        """, (nom.get("year"), nom.get("month"), nom.get("id",""), nom.get("name",""),
                              nom.get("cat",""), nom.get("supplier",""), nom.get("amount",0), nom.get("qty",0)))
                    db.commit()
                    db.close()
                    synced.append("история продаж")
        except Exception as e:
            log.warning(f"1С история: {e}")

    if synced:
        sync_time = datetime.now().strftime("%H:%M")
        db = get_db()
        db.execute("INSERT INTO settings(key,value,updated) VALUES('last_1c_sync',?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated=datetime('now')",
            (sync_time,))
        db.commit()
        db.close()
        await ws_manager.broadcast("sync_complete", {"source": "1c", "time": sync_time, "modules": synced})
        log.info(f"✓ 1С синхронизирован: {', '.join(synced)}")
        return True
    return False

async def sync_1c_loop():
    """Автоматическая синхронизация с 1С каждые N секунд"""
    await asyncio.sleep(30)  # Подождать старта сервера
    while True:
        await sync_from_1c()
        await asyncio.sleep(SYNC_INTERVAL)

async def daily_scheduler():
    """Ежедневные задачи — в 06:00 каждый день"""
    while True:
        now = datetime.now()
        next_run = now.replace(hour=6, minute=0, second=0, microsecond=0)
        if now >= next_run:
            next_run += timedelta(days=1)
        await asyncio.sleep((next_run - now).total_seconds())

        # Обновить просрочку дебиторов
        db = get_db()
        db.execute("""
            UPDATE debtors SET overdue_days = MAX(0, CAST(
                (julianday('now') - julianday(CASE WHEN due_date='' THEN 'now' ELSE due_date END))
                AS INTEGER))
            WHERE due_date != '' AND status != 'paid'
        """)
        db.commit()
        db.close()
        log.info("Дневное обновление: просрочка дебиторов пересчитана")
        await ws_manager.broadcast("daily_update", {"date": date.today().isoformat()})

@app.post("/api/sync/1c", tags=["sync"])
async def manual_sync():
    """Ручной запуск синхронизации с 1С"""
    asyncio.create_task(sync_from_1c())
    return {"ok": True, "message": "Синхронизация запущена"}

@app.get("/api/sync/status", tags=["sync"])
def sync_status():
    db = get_db()
    last = db.execute("SELECT value FROM settings WHERE key='last_1c_sync'").fetchone()
    db.close()
    return {
        "last_sync":       last["value"] if last else None,
        "onec_configured": bool(ONEC_URL),
        "onec_url":        ONEC_URL[:30] + "..." if len(ONEC_URL) > 30 else ONEC_URL,
        "sync_interval":   SYNC_INTERVAL,
    }

# ══════════════════════════════════════════════════════════════════════
# AI АГЕНТ — GEMINI 2.5 FLASH
# ══════════════════════════════════════════════════════════════════════

class AiMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str

class AiChatRequest(BaseModel):
    messages: List[AiMessage]

def _build_company_context(db) -> str:
    """Собирает актуальные данные компании для системного промпта AI."""
    today = date.today().isoformat()

    # Сотрудники
    employees = db.execute("SELECT id, name, role, salary FROM employees").fetchall()
    emp_lines = "\n".join(f"  - {e['name']} ({e['role']}, зарплата: {e['salary']} тыс. сум)" for e in employees)

    # Задачи
    tasks = db.execute("SELECT t.name, t.status, t.priority, t.due_date, e.name as assignee FROM tasks t LEFT JOIN employees e ON t.emp_id = e.id").fetchall()
    overdue_statuses = {"Просрочена", "overdue"}
    task_lines = "\n".join(f"  - [{t['status'].upper()}] {t['name']} → {t['assignee'] or 'не назначен'} (приоритет: {t['priority']}, срок: {t['due_date'] or 'нет'})" for t in tasks[:15])
    overdue_tasks = [t for t in tasks if t['status'] in overdue_statuses]

    # Дебиторы
    debtors = db.execute("SELECT d.name, d.debt, d.overdue_days, d.status, e.name as manager FROM debtors d LEFT JOIN employees e ON d.manager_id = e.id WHERE d.status NOT IN ('paid', 'closed')").fetchall()
    debt_total = sum(d['debt'] for d in debtors)
    critical_debtors = [d for d in debtors if d['overdue_days'] > 90]
    debtor_lines = "\n".join(f"  - {d['name']}: {d['debt']} млн сум, {d['overdue_days']} дн. просрочки, статус: {d['status']}, менеджер: {d['manager'] or '—'}" for d in sorted(debtors, key=lambda x: -x['debt'])[:10])

    # Склад
    warehouse = db.execute("SELECT name, qty, min_qty, category FROM warehouse").fetchall()
    out_of_stock = [w for w in warehouse if w['qty'] == 0]
    low_stock = [w for w in warehouse if 0 < w['qty'] <= w['min_qty']]
    wh_lines = "\n".join(f"  - {w['name']} ({w['category']}): {w['qty']} ед. (мин: {w['min_qty']})" for w in out_of_stock + low_stock)

    # Посещаемость сегодня
    att = db.execute("SELECT a.status, e.name FROM attendance a JOIN employees e ON a.emp_id = e.id WHERE a.date = ?", (today,)).fetchall()
    present = [a for a in att if a['status'] in ('present', 'late')]
    att_lines = f"  На работе сегодня ({today}): {len(present)}/{len(employees)}"

    # Продажи
    plans = db.execute("SELECT manager_id, period, amount FROM sales_plans WHERE period LIKE '2026-%' AND LENGTH(period) = 7").fetchall()
    facts = db.execute("SELECT manager_id, period, amount FROM sales_facts WHERE period LIKE '2026-%'").fetchall()
    total_plan = sum(p['amount'] for p in plans)
    total_fact = sum(f['amount'] for f in facts)
    sales_pct = round((total_fact / total_plan * 100) if total_plan > 0 else 0)

    return f"""Ты — AI-Агент корпоративной системы "Пойтахт" (Душанбе, Таджикистан).
У тебя есть полный доступ к актуальным данным компании. Отвечай на русском языке, кратко и по делу. Используй конкретные цифры из данных.

=== ДАННЫЕ КОМПАНИИ (обновлено: {today}) ===

📋 СОТРУДНИКИ ({len(employees)} чел.):
{emp_lines}

✅ ЗАДАЧИ ({len(tasks)} всего, {len(overdue_tasks)} просрочено):
{task_lines}

💰 ДЕБИТОРЫ ({len(debtors)} активных, общий долг: {debt_total:.1f} млн сум, критических: {len(critical_debtors)}):
{debtor_lines}

📦 СКЛАД (нет в наличии: {len(out_of_stock)}, заканчивается: {len(low_stock)}):
{wh_lines if wh_lines else '  Все позиции в норме'}

🕐 ПОСЕЩАЕМОСТЬ:
{att_lines}

📈 ПРОДАЖИ 2026 (план: {total_plan:.0f} млн, факт: {total_fact:.0f} млн, выполнение: {sales_pct}%):
  {"✅ Выполнение в норме" if sales_pct >= 80 else f"⚠️ Выполнение ниже нормы ({sales_pct}%)"}

=== КОНЕЦ ДАННЫХ ===

Отвечай чётко, с конкретными цифрами. Если нужно давай рекомендации на основе данных."""

def _get_gemini_client():
    base_url = os.environ.get("AI_INTEGRATIONS_GEMINI_BASE_URL", "")
    api_key = os.environ.get("AI_INTEGRATIONS_GEMINI_API_KEY", "")
    if not base_url or not api_key:
        raise HTTPException(503, "AI интеграция не настроена")
    client = google_genai.Client(
        api_key=api_key,
        http_options={"base_url": base_url, "api_version": ""}
    )
    return client

@app.post("/api/ai-chat", tags=["ai"])
async def ai_chat_endpoint(req: AiChatRequest):
    """AI-чат с Gemini 2.5 Flash, имеет доступ ко всем данным компании"""
    db = get_db()
    try:
        system_prompt = _build_company_context(db)
        client = _get_gemini_client()

        # Конвертируем историю сообщений
        contents = []
        for msg in req.messages:
            role = "model" if msg.role == "assistant" else "user"
            contents.append(genai_types.Content(
                role=role,
                parts=[genai_types.Part(text=msg.content)]
            ))

        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.5-flash",
            contents=contents,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=8192,
                temperature=0.7,
            )
        )

        answer = response.text or "Не удалось получить ответ."
        return {"response": answer, "model": "gemini-2.5-flash"}
    except HTTPException:
        raise
    except Exception as e:
        log.error(f"AI chat error: {e}")
        raise HTTPException(500, f"Ошибка AI: {str(e)}")
    finally:
        db.close()

# ══════════════════════════════════════════════════════════════════════
# СЛУЖЕБНЫЕ ЭНДПОИНТЫ
# ══════════════════════════════════════════════════════════════════════
@app.get("/health", tags=["system"])
def health_check():
    db = get_db()
    emp_count  = db.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
    task_count = db.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
    db.close()
    return {
        "status":      "ok",
        "version":     "7.0",
        "time":        datetime.now().isoformat(timespec="seconds"),
        "employees":   emp_count,
        "tasks":       task_count,
        "ws_clients":  len(ws_manager.active),
        "db":          DB_PATH,
    }

@app.get("/api/export/csv", tags=["system"])
def export_csv(table: str = Query("attendance")):
    """Экспорт таблицы в CSV"""
    allowed = {"attendance", "tasks", "debtors", "warehouse", "sales_facts"}
    if table not in allowed:
        raise HTTPException(400, f"Таблица должна быть одной из: {', '.join(allowed)}")
    db = get_db()
    rows = db.execute(f"SELECT * FROM {table}").fetchall()
    db.close()
    if not rows:
        return JSONResponse({"error": "Нет данных"})
    headers = list(rows[0].keys())
    lines = [",".join(headers)]
    for row in rows:
        lines.append(",".join(str(v or "") for v in dict(row).values()))
    content = "\ufeff" + "\r\n".join(lines)
    from fastapi.responses import Response
    return Response(content=content, media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename={table}_{date.today()}.csv"})

# ── Статика (PWA) ──────────────────────────────────────────────────────
if os.path.exists("static"):
    app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", include_in_schema=False)
def serve_index():
    if os.path.exists("static/index.html"):
        return FileResponse("static/index.html")
    return {"status": "Пойтахт API v7.0", "docs": "/docs", "health": "/health"}

@app.get("/sw.js", include_in_schema=False)
def serve_sw():
    for p in ["static/sw.js", "sw.js"]:
        if os.path.exists(p):
            return FileResponse(p, media_type="application/javascript")
    raise HTTPException(404)

@app.get("/manifest.json", include_in_schema=False)
def serve_manifest():
    for p in ["static/manifest.json", "manifest.json"]:
        if os.path.exists(p):
            return FileResponse(p)
    raise HTTPException(404)
