require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_ENTITY_TYPE_ID = process.env.ALLOWED_ENTITY_TYPE_ID || '1064';
const AXIOS_TIMEOUT = 10000; // 10 секунд
const MAX_RETRIES = 3;

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
