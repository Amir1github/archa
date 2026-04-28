# Пойтахт — Корпоративная система управления

## Overview

Мобильное приложение "Пойтахт" — корпоративная система управления для компании из Душанбе, Таджикистан. Содержит Python FastAPI бекенд и Expo мобильное приложение.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Mobile**: Expo (React Native) with Expo Router
- **Backend**: Python FastAPI v0.111.0 + SQLite
- **AI**: Gemini 2.5 Flash via Replit AI Integrations (env: AI_INTEGRATIONS_GEMINI_BASE_URL, AI_INTEGRATIONS_GEMINI_API_KEY)
- **State management**: React Query (@tanstack/react-query)

## Artifacts

- `artifacts/mobile` — Expo мобильное приложение (preview: `/`)
- `artifacts/api-server` — Express Node.js API server (не используется активно, proxy routing)
- `artifacts/backend-py` — Python FastAPI бекенд (Пойтахт API)

## Backend (Python FastAPI)

Файлы:
- `artifacts/backend-py/server.py` — основной сервер с SQLite БД
- `artifacts/backend-py/requirements.txt` — зависимости

Порт: **8001** (управляется внутри api-server, Express на порту 8000 проксирует `/api`)

Запуск: api-server запускает Python автоматически (port 8001). Workflow: `artifacts/api-server: API Server`

API эндпоинты:
- `GET /api/employees` — список сотрудников
- `GET/POST /api/tasks` — задачи
- `GET /api/attendance` — посещаемость
- `GET /api/debtors` — дебиторы
- `GET /api/warehouse` — склад
- `GET /api/stats` — сводная статистика

## Mobile App (Expo)

Экраны (8 вкладок в нижнем меню):
- **Директор** (`/(tabs)/index`) — Director Dashboard: hero-карта, алерты, KPI-сетка (4 карточки), активные задачи, просроченные, топ-должники, быстрый доступ
- **Задачи** (`/(tabs)/tasks`) — список с фильтрами + **Kanban-вид** (переключатель Список/Kanban в хедере), создание задач, FlatList для производительности
- **HR** (`/(tabs)/attendance`) — посещаемость по дням/неделям/отчётам
- **График** (`/(tabs)/workplan`) — **Work Plan**: день/неделя, фильтр по сотруднику, переход на день по клику
- **Дебиторы** (`/(tabs)/debtors`) — управление дебиторской задолженностью
- **Продажи** (`/(tabs)/sales`) — аналитика/планы/история + **Прогноз** (4-я вкладка): сценарии, факторы, месячный прогноз
- **Склад** (`/(tabs)/warehouse`) — складские остатки с тревогами
- **AI Агент** (`/(tabs)/ai-chat`) — Gemini 2.5 Flash чат
- **Детали задачи** (`/task/[id]`) — изменение статуса, комментарии

Производительность: staleTime на всех React Query запросах (2–15 мин), FlatList в Tasks/WorkPlan, React.memo для карточек.

Цвета: зелёный #1a7a3c (primary), золотой #d4a017 (accent)

## Key Commands

- `pnpm run typecheck` — full typecheck
- `pnpm run build` — build all packages

## Python Dependencies

Установлены через uv в `.pythonlibs/`:
- fastapi==0.111.0
- uvicorn[standard]==0.29.0
- aiohttp==3.9.5
- aiofiles==23.2.1
- python-multipart==0.0.9
