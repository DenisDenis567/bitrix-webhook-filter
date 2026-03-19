require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_ENTITY_TYPE_ID = process.env.ALLOWED_ENTITY_TYPE_ID || '1064';
const AXIOS_TIMEOUT = 10000; // 10 секунд
const MAX_RETRIES = 3;

// Очередь для хранения оплаченных элементов из Google Sheets
const paidItemsQueue = [];

// Middleware
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// Логирование всех запросов
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// Функция отправки с retry логикой
async function sendToMakeWithRetry(url, data, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await axios.post(url, data, {
        timeout: AXIOS_TIMEOUT,
        headers: { 'Content-Type': 'application/json' }
      });
      console.log(`✓ Успешно отправлено в Make (попытка ${attempt}/${retries})`);
      return true;
    } catch (err) {
      const isLastAttempt = attempt === retries;
      const errorMsg = err.response?.data || err.message;

      console.error(`✗ Ошибка при отправке в Make (попытка ${attempt}/${retries}):`, errorMsg);

      if (isLastAttempt) {
        console.error('Все попытки исчерпаны. Данные потеряны.');
        return false;
      }

      // Экспоненциальная задержка: 1s, 2s, 4s
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.log(`Повтор через ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return false;
}

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    allowedEntityTypeId: ALLOWED_ENTITY_TYPE_ID,
    makeConfigured: !!process.env.MAKE_WEBHOOK_URL
  });
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  const timestamp = new Date().toISOString();

  // Валидация: проверяем что пришел объект
  if (!body || typeof body !== 'object') {
    console.error(`[${timestamp}] ✗ Невалидное тело запроса`);
    return res.status(400).json({ error: 'Invalid request body' });
  }

  console.log(`\n[${timestamp}] 📨 Входящий вебхук от Битрикс24:`);
  console.log(JSON.stringify(body, null, 2));

  // Битрикс ждёт 200 — отвечаем сразу, чтобы не заставлять его ждать
  res.sendStatus(200);

  // Получаем ENTITY_TYPE_ID из разных мест в теле вебхука
  // (стандартный вебхук кладёт его в data.FIELDS, робот — напрямую в тело)
  let entityTypeId = String(body?.ENTITY_TYPE_ID || body?.data?.FIELDS?.ENTITY_TYPE_ID || '');

  // Если не нашли — пробуем вытащить из имени события (например ONCRMDYNAMICITEMUPDATE_1064)
  if (!entityTypeId && body?.event) {
    const match = body.event.match(/_(\d+)$/);
    if (match) entityTypeId = match[1];
  }

  console.log(`🔍 Обнаружен ENTITY_TYPE_ID: ${entityTypeId || 'не найден'}`);

  // Фильтр: пропускаем только ENTITY_TYPE_ID = ALLOWED_ENTITY_TYPE_ID
  if (entityTypeId !== ALLOWED_ENTITY_TYPE_ID) {
    console.log(`⊘ ОТФИЛЬТРОВАНО: ENTITY_TYPE_ID=${entityTypeId}, требуется ${ALLOWED_ENTITY_TYPE_ID}\n`);
    return;
  }

  console.log(`✓ Фильтр пройден! ENTITY_TYPE_ID=${entityTypeId} → Отправляем в Make`);

  // Получаем URL Make
  const makeUrl = process.env.MAKE_WEBHOOK_URL;

  if (!makeUrl) {
    console.error('✗ КРИТИЧЕСКАЯ ОШИБКА: MAKE_WEBHOOK_URL не задан в переменных окружения!\n');
    return;
  }

  // Отправляем с retry логикой
  await sendToMakeWithRetry(makeUrl, body);
  console.log('─'.repeat(80) + '\n');
});

app.get('/debug', (req, res) => {
  // Показываем все ключи переменных окружения (без значений — они секретные)
  const envKeys = Object.keys(process.env).sort();
  res.json({
    make_configured: !!process.env.MAKE_WEBHOOK_URL,
    make_url_length: process.env.MAKE_WEBHOOK_URL ? process.env.MAKE_WEBHOOK_URL.length : 0,
    allowed_entity_type_id: ALLOWED_ENTITY_TYPE_ID,
    all_env_keys: envKeys
  });
});

// ==================== НОВЫЙ ФУНКЦИОНАЛ: Google Sheets → Bitrix24 ====================

// Endpoint для приёма webhook от Google Sheets
app.post('/sheets-webhook', async (req, res) => {
  const { crmId, status, timestamp, sheetRow } = req.body;
  const now = new Date().toISOString();

  console.log(`\n[${now}] 📊 Входящий webhook от Google Sheets:`);
  console.log(JSON.stringify(req.body, null, 2));

  // Валидация: проверяем обязательные поля
  if (!crmId || status !== 'paid') {
    console.error(`[${now}] ✗ Невалидные данные: crmId=${crmId}, status=${status}`);
    return res.status(400).json({
      error: 'Invalid payload',
      required: { crmId: 'string', status: 'paid' }
    });
  }

  // Добавляем в очередь
  const queueItem = {
    crmId: String(crmId),
    timestamp: timestamp || now,
    addedAt: now,
    sheetRow: sheetRow || null
  };

  paidItemsQueue.push(queueItem);

  console.log(`✓ Добавлено в очередь: CRM ID ${crmId}`);
  console.log(`📦 Всего в очереди: ${paidItemsQueue.length} элементов`);
  console.log('─'.repeat(80) + '\n');

  // Отвечаем Google Sheets сразу
  res.status(200).json({
    success: true,
    queueSize: paidItemsQueue.length,
    message: 'Added to queue. Will be processed on next hourly cron run.'
  });
});

// Endpoint для проверки статуса очереди
app.get('/queue-status', (_req, res) => {
  res.json({
    queueSize: paidItemsQueue.length,
    items: paidItemsQueue,
    cronSchedule: 'Every 5 minutes (test mode)', // Продакшн: 'Every hour at :00'
    bitrixConfigured: !!process.env.BITRIX_WEBHOOK_URL
  });
});

// Функция обновления стадии элемента в Bitrix24
async function updateBitrixStage(webhookUrl, crmId, stageId, retries = MAX_RETRIES) {
  const payload = {
    entityTypeId: 1064,
    id: crmId,
    fields: {
      stageId: stageId
    }
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(webhookUrl, payload, {
        timeout: AXIOS_TIMEOUT,
        headers: { 'Content-Type': 'application/json' }
      });

      console.log(`  ✓ CRM ID ${crmId} → стадия ${stageId} (попытка ${attempt}/${retries})`);
      return { success: true, response: response.data };
    } catch (err) {
      const isLastAttempt = attempt === retries;
      const errorMsg = err.response?.data || err.message;

      console.error(`  ✗ Ошибка для CRM ID ${crmId} (попытка ${attempt}/${retries}):`, errorMsg);

      if (isLastAttempt) {
        return { success: false, error: errorMsg };
      }

      // Экспоненциальная задержка
      const delay = Math.pow(2, attempt - 1) * 1000;
      console.log(`  Повтор через ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

// Функция обработки очереди (запускается по cron)
async function processPaidItemsQueue() {
  const timestamp = new Date().toISOString();

  console.log('\n' + '═'.repeat(80));
  console.log(`[${timestamp}] 🕐 Запуск cron job: обработка очереди оплаченных элементов`);
  console.log('═'.repeat(80));

  if (paidItemsQueue.length === 0) {
    console.log('📭 Очередь пуста, нечего отправлять\n');
    return;
  }

  console.log(`📦 В очереди ${paidItemsQueue.length} элементов`);

  const bitrixUrl = process.env.BITRIX_WEBHOOK_URL;
  const stageId = process.env.BITRIX_PAID_STAGE_ID || 'DT1064_28:SUCCESS';

  if (!bitrixUrl) {
    console.error('✗ КРИТИЧЕСКАЯ ОШИБКА: BITRIX_WEBHOOK_URL не задан!\n');
    return;
  }

  console.log(`🎯 Целевая стадия: ${stageId}`);
  console.log(`🔗 Bitrix24 URL: ${bitrixUrl.substring(0, 50)}...\n`);

  const results = {
    success: [],
    failed: []
  };

  // Создаём копию очереди для итерации
  const itemsToProcess = [...paidItemsQueue];

  for (const item of itemsToProcess) {
    console.log(`\nОбработка CRM ID ${item.crmId}...`);
    const result = await updateBitrixStage(bitrixUrl, item.crmId, stageId);

    if (result.success) {
      results.success.push(item.crmId);
      // Удаляем из очереди только успешно обработанные
      const index = paidItemsQueue.indexOf(item);
      if (index > -1) {
        paidItemsQueue.splice(index, 1);
      }
    } else {
      results.failed.push({ crmId: item.crmId, error: result.error });
    }
  }

  console.log('\n' + '─'.repeat(80));
  console.log(`✓ Успешно обработано: ${results.success.length}`);
  if (results.success.length > 0) {
    console.log(`  CRM IDs: ${results.success.join(', ')}`);
  }

  if (results.failed.length > 0) {
    console.log(`✗ Ошибки: ${results.failed.length}`);
    results.failed.forEach(f => {
      console.log(`  - CRM ID ${f.crmId}: ${f.error}`);
    });
  }

  console.log(`📦 Осталось в очереди: ${paidItemsQueue.length} элементов`);
  console.log('═'.repeat(80) + '\n');
}

// Cron job: запускается каждые 5 минут (для тестирования)
// Продакшн: '0 * * * *' (каждый час в :00)
cron.schedule('*/5 * * * *', async () => {
  await processPaidItemsQueue();
});

console.log('⏰ Cron job настроен: каждые 5 минут (тестовый режим)');

// ==================== КОНЕЦ НОВОГО ФУНКЦИОНАЛА ====================

const server = app.listen(PORT, () => {
  console.log('═'.repeat(80));
  console.log(`🚀 Bitrix24 Webhook Filter Server`);
  console.log(`📡 Сервер запущен на порту ${PORT}`);
  console.log(`🎯 Фильтр настроен на ENTITY_TYPE_ID: ${ALLOWED_ENTITY_TYPE_ID}`);
  console.log(`🔗 Make.com URL: ${process.env.MAKE_WEBHOOK_URL ? 'настроен ✓' : 'НЕ НАСТРОЕН ✗'}`);
  console.log('═'.repeat(80) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM получен, начинаю graceful shutdown...');
  server.close(() => {
    console.log('✓ HTTP сервер закрыт');
    process.exit(0);
  });

  // Принудительное завершение через 10 секунд
  setTimeout(() => {
    console.error('✗ Принудительное завершение после таймаута');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('\n⚠️  SIGINT получен (Ctrl+C), завершаю работу...');
  server.close(() => {
    console.log('✓ Сервер остановлен');
    process.exit(0);
  });
});
