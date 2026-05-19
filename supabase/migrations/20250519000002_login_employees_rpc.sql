-- Список сотрудников для экрана входа (работает для anon без данных в JWT)

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.employees TO anon, authenticated;

-- RPC: обходит RLS, не отдаёт реальный PIN
CREATE OR REPLACE FUNCTION public.get_employees_for_login()
RETURNS TABLE (
  id          INTEGER,
  name        TEXT,
  role        TEXT,
  color       TEXT,
  bg          TEXT,
  is_hr       BOOLEAN,
  is_admin    BOOLEAN,
  salary      INTEGER,
  tg_id       BIGINT,
  phone       TEXT,
  bio         TEXT,
  avatar      TEXT,
  pin         TEXT,
  source      TEXT,
  created_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.id, e.name, e.role, e.color, e.bg, e.is_hr, e.is_admin, e.salary,
    e.tg_id, e.phone, e.bio, e.avatar,
    CASE WHEN e.pin IS NOT NULL AND e.pin <> '' THEN '*' ELSE NULL END AS pin,
    e.source, e.created_at
  FROM employees e
  ORDER BY e.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_employees_for_login() TO anon, authenticated;

-- Seed сотрудников (безопасно повторять: ON CONFLICT DO NOTHING)
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
