# Bitrix24 Webhook Filter + Google Sheets Integration

Автоматическая система интеграции Google Sheets с Bitrix24 для обновления стадий смарт-процессов.

---

## 🎯 Что делает система

### 📊 Основной сценарий использования:

1. **В Google Таблице** вы ставите статус "Оплачен" в колонке H
2. **Скрипт автоматически** (без всплывающих окон):
   - Берёт ID CRM из колонки M
   - Отправляет webhook на сервер Railway
   - Добавляет элемент в очередь
3. **Каждый час** сервер обрабатывает очередь и переводит все элементы на стадию "Оплачено" в Bitrix24

### 🔄 Дополнительный функционал:

**Bitrix24 → Make.com**: Фильтрация вебхуков от Bitrix24 и пересылка только нужных событий (ENTITY_TYPE_ID=1064) в Make.com.

---

## ✅ Статус системы

| Компонент | Статус | Описание |
|-----------|--------|----------|
| Railway Server | 🟢 Работает | https://bitrix24-webhook-filter-production.up.railway.app |
| Google Apps Script | 🟢 Настроен | Триггер onEdit активен |
| Cron Job | 🟢 Активен | Запускается каждый час в :00 (тестовый режим: каждые 5 минут) |
| Bitrix24 API | 🟢 Подключен | Обновление стадий работает |
| Make.com | 🟢 Работает | Фильтрация вебхуков активна |

---

## 📋 Быстрый старт

### Шаг 1: Клонирование и установка

```bash
git clone https://github.com/DenisDenis567/bitrix-webhook-filter.git
cd bitrix-webhook-filter
npm install
```

### Шаг 2: Настройка переменных окружения

Создайте файл `.env` на основе `.env.example`:

```env
# Bitrix24 → Make.com (существующий функционал)
MAKE_WEBHOOK_URL=https://hook.eu2.make.com/ваш_webhook
ALLOWED_ENTITY_TYPE_ID=1064

# Google Sheets → Bitrix24 (новый функционал)
BITRIX_WEBHOOK_URL=https://ваш_портал.bitrix24.ru/rest/USER_ID/WEBHOOK_CODE/crm.item.update
BITRIX_PAID_STAGE_ID=DT1064_28:SUCCESS

# Опционально (по умолчанию 3000)
PORT=3000
```

### Шаг 3: Локальный запуск

```bash
npm start
```

Сервер запустится на http://localhost:3000

### Шаг 4: Настройка Google Apps Script

**Подробная инструкция:** [GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md)

**Краткая версия:**
1. Откройте вашу Google Таблицу → Расширения → Apps Script
2. Скопируйте код из [google-apps-script.js](google-apps-script.js)
3. Вставьте в редактор Code.gs
4. Сохраните (Ctrl+S)
5. Создайте триггер: ⏰ (Триггеры) → + Добавить триггер
   - Функция: `onEdit`
   - Источник события: "Из таблицы"
   - Тип события: "При редактировании"
6. Дайте разрешения при первом запуске

### Шаг 5: Деплой на Railway

**Подробная инструкция:** [DEPLOYMENT.md](DEPLOYMENT.md)

**Краткая версия:**
```bash
# Установка Railway CLI (один раз)
npm install -g @railway/cli

# Авторизация
railway login

# Создание проекта
railway init --name "Bitrix24-Webhook-Filter"

# Установка переменных окружения
railway variables set MAKE_WEBHOOK_URL="https://hook.eu2.make.com/ваш_webhook"
railway variables set ALLOWED_ENTITY_TYPE_ID="1064"
railway variables set BITRIX_WEBHOOK_URL="https://ваш_портал.bitrix24.ru/rest/USER_ID/WEBHOOK_CODE/crm.item.update"
railway variables set BITRIX_PAID_STAGE_ID="DT1064_28:SUCCESS"

# Деплой
railway up --detach
```

---

## 📡 API Endpoints

### GET /health

Проверка работоспособности сервера.

**Пример:**
```bash
curl https://bitrix24-webhook-filter-production.up.railway.app/health
```

**Ответ:**
```json
{
  "status": "ok",
  "uptime": 12345.67,
  "allowedEntityTypeId": "1064",
  "makeConfigured": true
}
```

---

### GET /queue-status

Проверка статуса очереди оплаченных элементов.

**Пример:**
```bash
curl https://bitrix24-webhook-filter-production.up.railway.app/queue-status
```

**Ответ:**
```json
{
  "queueSize": 2,
  "items": [
    {
      "crmId": "782",
      "timestamp": "2026-03-19T16:43:25.106Z",
      "addedAt": "2026-03-19T16:43:25.882Z",
      "sheetRow": 225
    }
  ],
  "cronSchedule": "Every hour at :00",
  "bitrixConfigured": true
}
```

---

### POST /sheets-webhook

Добавление элемента в очередь оплаченных (вызывается из Google Apps Script).

**Запрос:**
```bash
curl -X POST https://bitrix24-webhook-filter-production.up.railway.app/sheets-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "crmId": "816",
    "status": "paid",
    "timestamp": "2026-03-19T10:00:00.000Z",
    "sheetRow": 220
  }'
```

**Ответ:**
```json
{
  "success": true,
  "queueSize": 1,
  "message": "Added to queue. Will be processed on next hourly cron run."
}
```

---

### POST /webhook

Фильтрация вебхуков от Bitrix24 (существующий функционал).

**Запрос:**
```bash
curl -X POST https://bitrix24-webhook-filter-production.up.railway.app/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "ENTITY_TYPE_ID": "1064",
    "event": "ONCRMDYNAMICITEMUPDATE_1064",
    "data": {
      "FIELDS": {
        "ID": "123",
        "TITLE": "Test"
      }
    }
  }'
```

**Поведение:**
- Если `ENTITY_TYPE_ID` = 1064 → отправляет в Make.com
- Если `ENTITY_TYPE_ID` ≠ 1064 → фильтрует (не отправляет)

---

## 🔧 Переменные окружения

| Переменная | Обязательна | Значение по умолчанию | Описание |
|------------|-------------|----------------------|----------|
| `MAKE_WEBHOOK_URL` | ✅ Да | - | URL вебхука Make.com для пересылки событий Bitrix24 |
| `ALLOWED_ENTITY_TYPE_ID` | ✅ Да | - | ID типа сущности для фильтрации (например, 1064) |
| `BITRIX_WEBHOOK_URL` | ✅ Да | - | URL REST API Bitrix24 для обновления стадий элементов |
| `BITRIX_PAID_STAGE_ID` | Нет | `DT1064_28:SUCCESS` | ID стадии "Оплачено" в Bitrix24 |
| `PORT` | Нет | `3000` | Порт для запуска сервера |

### Как получить BITRIX_WEBHOOK_URL:

1. Откройте Bitrix24 → Настройки → Разработчикам → Входящие вебхуки
2. Создайте новый вебхук с правами `crm` (CRM)
3. Скопируйте URL и добавьте в конец `/crm.item.update`
4. Должно получиться: `https://ваш_портал.bitrix24.ru/rest/143/ххххххххх/crm.item.update`

### Как узнать BITRIX_PAID_STAGE_ID:

1. Откройте элемент смарт-процесса в Bitrix24
2. Переместите его на стадию "Оплачено" вручную
3. Откройте инструменты разработчика (F12) → Network
4. Найдите запрос `crm.item.update`
5. В параметрах найдите `stageId` (например, `DT1064_28:SUCCESS`)

---

## 🕐 Как работает Cron Job

### Расписание

- **Продакшн:** каждый час в :00 минут (`0 * * * *`)
- **Тестовый режим:** каждые 5 минут (`*/5 * * * *`)

### Процесс обработки очереди

1. **Каждый час в :00** (или каждые 5 минут в тестовом режиме) запускается функция `processPaidItemsQueue()`
2. **Для каждого элемента в очереди:**
   - Отправляется запрос в Bitrix24 API: `crm.item.update`
   - Элемент переводится на стадию `BITRIX_PAID_STAGE_ID`
   - Используется retry-логика с экспоненциальной задержкой (3 попытки)
3. **После успешной обработки:**
   - Элемент удаляется из очереди
   - Логируется успешное обновление
4. **При ошибке:**
   - Элемент остаётся в очереди
   - Логируется ошибка
   - Будет повторная попытка при следующем запуске cron

### Логи cron job

```
════════════════════════════════════════════════════════════════════════════════
[2026-03-19T16:00:00.119Z] 🕐 Запуск cron job: обработка очереди оплаченных элементов
════════════════════════════════════════════════════════════════════════════════
📦 В очереди 2 элементов
🎯 Целевая стадия: DT1064_28:SUCCESS
🔗 Bitrix24 URL: https://mygenetics.bitrix24.ru/rest/143/icymc...

[CRM ID 782] Обработка элемента...
✓ [CRM ID 782] Успешно обновлено на стадию DT1064_28:SUCCESS

[CRM ID 816] Обработка элемента...
✓ [CRM ID 816] Успешно обновлено на стадию DT1064_28:SUCCESS

📊 Итого: успешно=2, ошибок=0
📦 Осталось в очереди: 0 элементов
════════════════════════════════════════════════════════════════════════════════
```

---

## 🛠️ Архитектура

```
┌─────────────────────┐
│  Google Sheets      │
│  "Реестр платежей"  │
└──────────┬──────────┘
           │ onEdit (триггер)
           │ Колонка H = "Оплачен"
           ↓
┌─────────────────────┐
│ Google Apps Script  │
│  - Берёт ID CRM     │
│  - Отправляет       │
│    webhook          │
└──────────┬──────────┘
           │ POST /sheets-webhook
           ↓
┌─────────────────────┐
│  Railway Server     │
│  (Node.js/Express)  │
│  - In-memory queue  │
│  - Cron job (hourly)│
└──────────┬──────────┘
           │ Cron: каждый час
           │ POST crm.item.update
           ↓
┌─────────────────────┐
│    Bitrix24 CRM     │
│  Смарт-процесс 1064 │
│  Стадия → SUCCESS   │
└─────────────────────┘

      Параллельно:

┌─────────────────────┐
│    Bitrix24 CRM     │
│   (вебхук событий)  │
└──────────┬──────────┘
           │ ONCRMDYNAMICITEMUPDATE
           ↓
┌─────────────────────┐
│  Railway Server     │
│  Фильтр по          │
│  ENTITY_TYPE_ID     │
└──────────┬──────────┘
           │ Только ID=1064
           ↓
┌─────────────────────┐
│      Make.com       │
│   (автоматизация)   │
└─────────────────────┘
```

---

## 🧪 Тестирование

### 1. Проверка работоспособности сервера

```bash
curl https://bitrix24-webhook-filter-production.up.railway.app/health
```

Ожидаемый результат: `{"status":"ok",...}`

### 2. Проверка статуса очереди

```bash
curl https://bitrix24-webhook-filter-production.up.railway.app/queue-status
```

Ожидаемый результат: `{"queueSize":0,"items":[],...}`

### 3. Добавление тестового элемента в очередь

```bash
curl -X POST https://bitrix24-webhook-filter-production.up.railway.app/sheets-webhook \
  -H "Content-Type: application/json" \
  -d '{"crmId":"999","status":"paid","timestamp":"2026-03-19T10:00:00.000Z"}'
```

Ожидаемый результат: `{"success":true,"queueSize":1,...}`

### 4. Проверка, что элемент добавлен в очередь

```bash
curl https://bitrix24-webhook-filter-production.up.railway.app/queue-status
```

Ожидаемый результат: `{"queueSize":1,"items":[{"crmId":"999",...}],...}`

### 5. Проверка в Google Sheets (end-to-end тест)

1. Откройте таблицу "Реестр платежей"
2. Найдите строку с ID CRM в колонке M
3. Введите "Оплачен" в колонку H
4. **Не должно быть всплывающих окон!**
5. Проверьте очередь: элемент должен появиться через 1-2 секунды
6. Подождите до следующего часа (:00)
7. Проверьте Bitrix24: элемент должен переместиться на стадию "SUCCESS"

---

## 🐛 Устранение неполадок

### Проблема: "Указанных разрешений недостаточно для UrlFetchApp.fetch"

**Решение:**
1. Откройте Apps Script → ⏰ Триггеры
2. Удалите все триггеры для `onEdit`
3. Создайте новый триггер:
   - Функция: `onEdit`
   - Источник события: "Из таблицы"
   - Тип события: "При редактировании"
4. Дайте разрешения при появлении окна авторизации

### Проблема: Элементы не двигаются в Bitrix24

**Проверьте:**
1. Правильность `BITRIX_WEBHOOK_URL` (должен заканчиваться на `/crm.item.update`)
2. Права вебхука в Bitrix24 (должен быть доступ к `crm`)
3. Правильность `BITRIX_PAID_STAGE_ID` (можно проверить через API)
4. Логи Railway: `railway logs`

**Тестовый запрос напрямую в Bitrix24:**
```bash
curl -X POST "https://ваш_портал.bitrix24.ru/rest/143/ххх/crm.item.update" \
  -H "Content-Type: application/json" \
  -d '{"entityTypeId":1064,"id":"782","fields":{"stageId":"DT1064_28:SUCCESS"}}'
```

### Проблема: Cron job не запускается

**Проверьте:**
1. Логи Railway: должно быть сообщение `⏰ Cron job настроен: ...`
2. Переменную окружения `BITRIX_WEBHOOK_URL` (должна быть задана)
3. Время ожидания: cron запускается строго в :00 минут (или каждые 5 минут в тестовом режиме)

**Принудительный редеплой:**
```bash
railway up --detach
```

### Проблема: Очередь не очищается

**Решение:**
1. Проверьте логи Railway на наличие ошибок обновления Bitrix24
2. Убедитесь, что `BITRIX_WEBHOOK_URL` правильный
3. Проверьте, что элементы с такими CRM ID существуют в Bitrix24
4. Проверьте права вебхука (должен иметь доступ к записи в CRM)

---

## 📚 Дополнительная документация

- [GOOGLE_SHEETS_SETUP.md](GOOGLE_SHEETS_SETUP.md) - Подробная инструкция по настройке Google Apps Script
- [DEPLOYMENT.md](DEPLOYMENT.md) - Подробная инструкция по деплою на Railway
- [OAUTH_FIX.md](OAUTH_FIX.md) - Решение проблем с OAuth в Google Apps Script
- [google-apps-script.js](google-apps-script.js) - Готовый код для Google Apps Script

---

## 📞 Полезные ссылки

- **Production URL**: https://bitrix24-webhook-filter-production.up.railway.app
- **GitHub Repository**: https://github.com/DenisDenis567/bitrix-webhook-filter
- **Railway Dashboard**: https://railway.app/project/YOUR_PROJECT_ID

---

## 🔄 Возврат в продакшн-режим

После тестирования верните cron на hourly режим:

1. Откройте [src/server.js](src/server.js)
2. Найдите строку 284: `cron.schedule('*/5 * * * *', ...)`
3. Измените на: `cron.schedule('0 * * * *', ...)`
4. Найдите строку 288: `console.log('⏰ Cron job настроен: каждые 5 минут (тестовый режим)');`
5. Измените на: `console.log('⏰ Cron job настроен: каждый час в :00 минут');`
6. Найдите строку 171: `cronSchedule: 'Every 5 minutes (test mode)',`
7. Измените на: `cronSchedule: 'Every hour at :00',`
8. Закоммитьте и задеплойте:
```bash
git add src/server.js
git commit -m "Возврат cron на hourly режим"
git push origin main
railway up --detach
```

---

## 🤖 Технологии

- **Backend**: Node.js v24.14.0, Express.js 4.18.2
- **HTTP Client**: Axios 1.6.0
- **Scheduler**: node-cron 4.2.1
- **Environment**: dotenv 16.3.1
- **Hosting**: Railway
- **Frontend**: Google Apps Script (V8 runtime)

---

## 📝 Лицензия

MIT

---

Создано с помощью [Claude Code](https://claude.com/claude-code) 🤖
