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

  // Битрикс ждёт 200 — отвечаем сразу
  res.sendStatus(200);

  const entityTypeId = String(body?.data?.FIELDS?.ENTITY_TYPE_ID || '');
  const itemId = body?.data?.FIELDS?.ID;

  // Шаг 1: фильтр по ENTITY_TYPE_ID
  if (entityTypeId !== ALLOWED_ENTITY_TYPE_ID) {
    console.log(`Пропускаем: ENTITY_TYPE_ID=${entityTypeId}`);
    return;
  }

  console.log(`ID подходит (${entityTypeId}), получаем данные элемента...`);

  try {
    // Шаг 2: получаем полные данные элемента из Битрикс
    const itemRes = await axios.get(`${BITRIX_WEBHOOK}/crm.item.get`, {
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

    // Шаг 4: отправляем в Make полные данные
    await axios.post(MAKE_WEBHOOK_URL, {
      event: body,
      item: item
    });

    console.log('Успешно отправлено в Make');

  } catch (err) {
    console.error('Ошибка:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
