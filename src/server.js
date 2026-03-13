require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const BITRIX_WEBHOOK = process.env.BITRIX_WEBHOOK_URL;
const ALLOWED_ENTITY_TYPE_ID = '1064';
const ALLOWED_STAGE_ID = 'DT1064_28:CLIENT';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('Входящий вебхук:', JSON.stringify(body, null, 2));

  // Битрикс ждёт 200 — отвечаем сразу, чтобы не заставлять его ждать
  res.sendStatus(200);

  // Универсальное получение ID и ENTITY_TYPE_ID:
  // 1. Пытаемся взять напрямую из тела (если вебхук из Робота/Бизнес-процесса)
  // 2. Иначе берем из data.FIELDS.ID (если стандартный вебхук)
  const itemId = body?.ID || body?.data?.FIELDS?.ID;
  
  // Пытаемся получить ENTITY_TYPE_ID:
  // 1. Из прямого параметра (из Робота)
  // 2. Из структуры data.FIELDS
  // 3. Вытягиваем из имени события, например ONCRMDYNAMICITEMADD_1064 -> 1064
  let entityTypeId = String(body?.ENTITY_TYPE_ID || body?.data?.FIELDS?.ENTITY_TYPE_ID || '');
  
  if (!entityTypeId && body?.event) {
    const match = body.event.match(/_(\d+)$/);
    if (match) {
      entityTypeId = match[1];
    }
  }

  if (!itemId) {
    console.log('Пропускаем: ID не найден во входящем вебхуке');
    return;
  }

  // Шаг 1: фильтр по ENTITY_TYPE_ID
  if (entityTypeId !== ALLOWED_ENTITY_TYPE_ID) {
    console.log(`Пропускаем: ENTITY_TYPE_ID=${entityTypeId}, а нужен ${ALLOWED_ENTITY_TYPE_ID}`);
    return;
  }

  console.log(`ID подходит (${entityTypeId}), получаем данные элемента с ID ${itemId}...`);

  // Динамически получаем переменные в момент запроса
  const currentBitrixUrl = process.env.BITRIX_WEBHOOK_URL;
  const currentMakeUrl = process.env.MAKE_WEBHOOK_URL;

  try {
    if (!currentBitrixUrl) {
      console.error('КРИТИЧЕСКАЯ ОШИБКА: Переменная окружения BITRIX_WEBHOOK_URL не задана! Добавьте её в Railway.');
      return;
    }

    // Шаг 2: получаем полные данные элемента из Битрикс
    const bitrixUrl = currentBitrixUrl.replace(/\/?$/, '/');
    const itemRes = await axios.get(`${bitrixUrl}crm.item.get`, {
      params: { entityTypeId: ALLOWED_ENTITY_TYPE_ID, id: itemId }
    });

    const item = itemRes.data?.result?.item;
    if (!item) {
      console.log('Элемент не найден в Битрикс');
      return;
    }

    const stageId = item.stageId;
    console.log(`stageId элемента: ${stageId}`);

    // Шаг 3: фильтр по стадии
    if (stageId !== ALLOWED_STAGE_ID) {
      console.log(`Пропускаем: stageId=${stageId}, нужен ${ALLOWED_STAGE_ID}`);
      return;
    }

    console.log('Все условия выполнены — отправляем в Make');

    if (!currentMakeUrl) {
      console.error('КРИТИЧЕСКАЯ ОШИБКА: Переменная окружения MAKE_WEBHOOK_URL не задана! Добавьте её в Railway.');
      return;
    }

    // Шаг 4: отправляем в Make полные данные
    await axios.post(currentMakeUrl, {
      event: body,
      item: item
    });

    console.log('Успешно отправлено в Make');

  } catch (err) {
    // Если ошибка от axios (например, неверный URL Битрикса или Make)
    console.error('Ошибка при обращении к внешнему API:', err.response?.data || err.message);
  }
});

app.get('/debug', (req, res) => {
  res.json({
    bitrix_configured: !!process.env.BITRIX_WEBHOOK_URL,
    make_configured: !!process.env.MAKE_WEBHOOK_URL,
    bitrix_url_length: process.env.BITRIX_WEBHOOK_URL ? process.env.BITRIX_WEBHOOK_URL.length : 0
  });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
