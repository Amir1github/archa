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
- **State management**: React Query (@tanstack/react-query)

## Artifacts

- `artifacts/mobile` — Expo мобильное приложение (preview: `/`)
- `artifacts/api-server` — Express Node.js API server (не используется активно, proxy routing)
- `artifacts/backend-py` — Python FastAPI бекенд (Пойтахт API)

## Backend (Python FastAPI)

Файлы:
- `artifacts/backend-py/server.py` — основной сервер с SQLite БД
- `artifacts/backend-py/requirements.txt` — зависимости

Порт: **8000** (маршрутизируется через proxy как `/api`)

Запуск: Workflow `Poytakht Backend`

API эндпоинты:
- `GET /api/employees` — список сотрудников
- `GET/POST /api/tasks` — задачи
- `GET /api/attendance` — посещаемость
- `GET /api/debtors` — дебиторы
- `GET /api/warehouse` — склад
- `GET /api/stats` — сводная статистика

## Mobile App (Expo)

Экраны:
- **Главная** (`/(tabs)/index`) — дашборд со статистикой
- **Задачи** (`/(tabs)/tasks`) — список с фильтрами, создание задач
- **Табель** (`/(tabs)/attendance`) — посещаемость сотрудников
- **Дебиторы** (`/(tabs)/debtors`) — управление дебиторской задолженностью
- **Склад** (`/(tabs)/warehouse`) — складские остатки с тревогами
- **Команда** (`/(tabs)/employees`) — список сотрудников
- **Детали задачи** (`/task/[id]`) — изменение статуса, комментарии

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
