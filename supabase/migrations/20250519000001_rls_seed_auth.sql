-- RLS, хелперы авторизации и начальные данные

-- ── Вспомогательные функции ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.employee_auth_email(p_emp_id INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'employee.' || p_emp_id::text || '@poytakht.app';
$$;

CREATE OR REPLACE FUNCTION public.strip_employee_pin(emp employees)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result JSONB;
BEGIN
  result := to_jsonb(emp);
  IF (emp).pin IS NOT NULL THEN
    result := result || '{"pin": "*"}'::jsonb;
  ELSE
    result := result - 'pin';
  END IF;
  result := result - 'auth_user_id';
  RETURN result;
END;
$$;

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtors ENABLE ROW LEVEL SECURITY;
ALTER TABLE debtor_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE rko ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Аутентифицированные сотрудники компании имеют доступ к данным
CREATE POLICY "authenticated_read_write" ON employees
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON task_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON attendance FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON debtors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON debtor_comments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON warehouse FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON sales_facts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON sales_plans FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON sales_history FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON offices FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON employee_locations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON rko FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON clients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON routes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON route_stops FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON orders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_sync" ON sync_log FOR SELECT TO authenticated USING (true);

-- Публичное чтение списка сотрудников для экрана входа (без PIN)
CREATE POLICY "anon_employees_login_list" ON employees
  FOR SELECT TO anon
  USING (true);

-- ── Начальные данные: сотрудники ──────────────────────────────────────
INSERT INTO employees (id, name, role, color, bg, is_hr, is_admin, salary) VALUES
  (1,  'Абдугафоров Бахром Давронович',   'Директор',                                  '#1a7a3c','#1a7a3c20',false,true,0),
  (2,  'Умаров Усмончон Саидчонович',      'Главный бухгалтер',                         '#1a5fb4','#1a5fb420',false,false,0),
  (3,  'Юсупова Шахноза Давроновна',       'Материальный бухгалтер',                    '#9b72ff','#9b72ff20',false,false,0),
  (4,  'Кодиров Фируз Хайбуллоевич',       'Кассир',                                    '#d68910','#d6891020',false,false,0),
  (5,  'Абдугафоров Хасан Давронович',     'Бухгалтер',                                 '#117a8b','#117a8b20',false,false,0),
  (6,  'Олимова Мадина Садриддиновна',     'HR',                                        '#c0392b','#c0392b20',true,false,0),
  (7,  'Абдугафоров Мумин',                'Маркетолог',                                '#e67e22','#e67e2220',false,false,0),
  (8,  'Абдугафоров Мубин',                'Ст. менеджер отдел ИФ',                     '#2980b9','#2980b920',false,false,0),
  (9,  'Абдугафоров Хусейнчон',            'Ст. менеджер отдел Сандали',                '#8e44ad','#8e44ad20',false,false,0),
  (10, 'Бозоров Хикматулло',               'Менеджер КФ',                               '#16a085','#16a08520',false,false,0),
  (11, 'Ерибеки Собирджон',                'Ст. менеджер отдела по работе с проектами', '#27ae60','#27ae6020',false,false,0),
  (12, 'Юсупов Саидчон Бахтиерович',       'Зав шоурума Шестопалова',                   '#f39c12','#f39c1220',false,false,0),
  (13, 'Тиллоев Насруллох Фатхуллоевич',   'Зав ТЦ Галерея',                            '#d35400','#d3540020',false,false,0),
  (14, 'Тиллозода Косим',                  'Менеджер',                                  '#2c3e50','#2c3e5020',false,false,0),
  (15, 'Элмуродов Хабибулло',              'Менеджер в ТЦ Кушониен',                    '#6d4c41','#6d4c4120',false,false,0),
  (16, 'Элмуродов Мухаммадрофе',           'Менеджер в ТЦ Вахдат',                      '#00695c','#00695c20',false,false,0),
  (17, 'Каримова Курбонгул',               'Уборщица Вахдат',                           '#7f8c8d','#7f8c8d20',false,false,0),
  (18, 'Давлятов Идрис',                   'Водитель автопарка',                        '#1a7a3c','#1a7a3c20',false,false,0),
  (19, 'Рахимов Лоик',                     'Водитель автопарка',                        '#9b72ff','#9b72ff20',false,false,0),
  (20, 'Азизкулов Далер',                  'Менеджер по продажам ТЦ Рахмон Набиев',     '#d68910','#d6891020',false,false,0),
  (21, 'Одинаев Зафар',                    'Зав склад',                                 '#1a5fb4','#1a5fb420',false,false,0),
  (22, 'Дилнозаи Абдучалил',               'Менеджер по продажам Сандали',              '#117a8b','#117a8b20',false,false,0),
  (23, 'Очилов Мухаммадхон',               'Ст. менеджер отдела Сп',                    '#c0392b','#c0392b20',false,false,0),
  (24, 'Холов Хуршед',                     'Менеджер в Шестопалова',                    '#e67e22','#e67e2220',false,false,0),
  (25, 'Тиллоев Кароматулло',              'Менеджер в Шестопалова',                    '#2980b9','#2980b920',false,false,0),
  (26, 'Тошева Махина',                    'Логист',                                    '#8e44ad','#8e44ad20',false,false,0),
  (27, 'Ашуров Наврузшох Хотамович',       'Директор производства',                     '#1a7a3c','#1a7a3c20',false,false,0),
  (28, 'Джабборов Шахром',                 'Оператор',                                  '#6d4c41','#6d4c4120',false,false,0),
  (29, 'Ашуров Комрон',                    'Конструктор',                               '#16a085','#16a08520',false,false,0),
  (30, 'Халимов Сандактам',                'Муовини директор',                          '#2c3e50','#2c3e5020',false,false,0),
  (31, 'Шодиев Масъуд',                    'Установщик',                                '#7f8c8d','#7f8c8d20',false,false,0),
  (32, 'Файзов Мухаммадюсуф',              'Установщик',                                '#6c3483','#6c348320',false,false,0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO offices (name, lat, lng, radius)
SELECT 'Главный офис', 38.5598, 68.7738, 200
WHERE NOT EXISTS (SELECT 1 FROM offices LIMIT 1);

INSERT INTO settings (key, value) VALUES
  ('work_start', '09:00'),
  ('work_end', '18:00')
ON CONFLICT (key) DO NOTHING;

-- Демо-клиенты
INSERT INTO clients (name, phone, address, contact, category, manager_id) VALUES
  ('ООО «Интерьер-Плюс»',     '+992 37 221 0011', 'Душанбе, ул. Рудаки 45',     'Алишер',    'Опт',    8),
  ('ТЦ Галерея',              '+992 37 227 1234', 'Душанбе, пр. Исмоила Сомони','Камол',     'VIP',    13),
  ('Отель «Душанбе»',         '+992 37 233 5555', 'Душанбе, ул. Шотемур 22',    'Нилуфар',   'VIP',    11),
  ('Магазин «Уют»',           '+992 93 500 1122', 'Душанбе, ц. рынок Корвон',   'Файзулло',  'Розница',9),
  ('ООО «Строй-Сервис»',      '+992 98 700 3344', 'Вахдат, ул. Ленина 8',       'Рустам',    'Опт',    8),
  ('Жилой комплекс «Новый»',  '+992 92 800 6677', 'Душанбе, мкр. Зарафшон',     'Дилноза',   'VIP',    11),
  ('ЧП Рахимов',              '+992 93 111 2233', 'Душанбе, ул. Айни 33',       'Рахим',     'Розница',9),
  ('Офис-Центр «Бизнес»',     '+992 37 224 9900', 'Душанбе, ул. Бохтар 12',     'Санам',     'Опт',    22),
  ('Санаторий «Варзоб»',      '+992 37 235 7788', 'Варзоб, ул. Центральная 1',  'Муродали',  'Розница',14),
  ('ООО «ДушМебель»',         '+992 98 600 5566', 'Душанбе, ТЦ Вахдат',         'Хуршед',    'Опт',    24)
;
