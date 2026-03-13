require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;
const ALLOWED_ENTITY_TYPE_ID = '1064';

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

  // Получаем ENTITY_TYPE_ID из разных мест в теле вебхука
  // (стандартный вебхук кладёт его в data.FIELDS, робот — напрямую в тело)
  let entityTypeId = String(body?.ENTITY_TYPE_ID || body?.data?.FIELDS?.ENTITY_TYPE_ID || '');

  // Если не нашли — пробуем вытащить из имени события (например ONCRMDYNAMICITEMUPDATE -> нет ID)
  if (!entityTypeId && body?.event) {
    const match = body.event.match(/_(\d+)$/);
    if (match) entityTypeId = match[1];
  }

  // Фильтр: пропускаем только ENTITY_TYPE_ID = 1064
  if (entityTypeId !== ALLOWED_ENTITY_TYPE_ID) {
    console.log(`Пропускаем: ENTITY_TYPE_ID=${entityTypeId}, нужен ${ALLOWED_ENTITY_TYPE_ID}`);
    return;
  }

  console.log(`Подходит ENTITY_TYPE_ID=${entityTypeId} — отправляем в Make`);

  // Получаем URL Make динамически при каждом запросе
  const makeUrl = process.env.MAKE_WEBHOOK_URL;

  if (!makeUrl) {
    console.error('ОШИБКА: MAKE_WEBHOOK_URL не задан в переменных Railway!');
    return;
  }

  try {
    // Отправляем весь входящий вебхук от Битрикса прямо в Make
    await axios.post(makeUrl, body);
    console.log('Успешно отправлено в Make');
  } catch (err) {
    console.error('Ошибка при отправке в Make:', err.response?.data || err.message);
  }
});

app.get('/debug', (req, res) => {
  res.json({
    make_configured: !!process.env.MAKE_WEBHOOK_URL,
    make_url_length: process.env.MAKE_WEBHOOK_URL ? process.env.MAKE_WEBHOOK_URL.length : 0,
    allowed_entity_type_id: ALLOWED_ENTITY_TYPE_ID
  });
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
