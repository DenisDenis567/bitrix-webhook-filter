const express = require('express');
const config = require('./config');
const storage = require('./storage');
const { getTask } = require('./bitrix-api');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Битрикс24 статусы задач
const TASK_STATUS = {
  2: 'pending',      // Ждёт выполнения
  3: 'in_progress',  // Выполняется
  4: 'presumably_completed', // Условно завершена
  5: 'completed',    // Завершена
  6: 'deferred',     // Отложена
};

/**
 * Эндпоинт для вебхуков Битрикс24
 * Битрикс отправляет POST с данными о событии задачи
 */
app.post('/webhook/bitrix', async (req, res) => {
  try {
    const body = req.body;
    console.log('[webhook] Получен вебхук:', JSON.stringify(body).slice(0, 500));

    // Проверка токена исходящего вебхука
    if (config.bitrix.outgoingToken && body.auth?.application_token !== config.bitrix.outgoingToken) {
      console.log('[webhook] Неверный токен, отклоняем');
      return res.status(200).send('OK');
    }

    // Битрикс24 отправляет event и data
    const event = body.event;
    const taskId = body.data?.FIELDS_AFTER?.ID || body.data?.ID;

    if (!event || !taskId) {
      console.log('[webhook] Нет event или taskId, пропускаем');
      return res.status(200).send('OK');
    }

    // Получаем детали задачи из Битрикс API
    const task = await getTask(taskId);
    if (!task) {
      console.log(`[webhook] Задача ${taskId} не найдена`);
      return res.status(200).send('OK');
    }

    const responsibleId = String(task.RESPONSIBLE_ID || task.responsibleId);
    const status = Number(task.STATUS || task.status);
    const title = task.TITLE || task.title || `Задача #${taskId}`;

    // Проверяем, отслеживаем ли этого сотрудника
    if (!config.employees[responsibleId]) {
      console.log(`[webhook] Сотрудник ${responsibleId} не отслеживается`);
      return res.status(200).send('OK');
    }

    console.log(`[webhook] Задача "${title}" (${taskId}), ответственный: ${responsibleId}, статус: ${status} (${TASK_STATUS[status]})`);

    // Обрабатываем событие в зависимости от статуса
    if (status === 5 || status === 4) {
      // Задача завершена или условно завершена
      storage.recordEvent(responsibleId, String(taskId), title, 'completed');
      console.log(`[webhook] Записано: задача "${title}" — завершена`);
    } else if (status === 3) {
      // Задача возобновлена (вернулась в работу)
      storage.recordEvent(responsibleId, String(taskId), title, 'resumed');
      console.log(`[webhook] Записано: задача "${title}" — возобновлена`);
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('[webhook] Ошибка обработки:', err);
    res.status(200).send('OK'); // Всегда 200, иначе Битрикс будет повторять
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', date: storage.getTodayKey() });
});

// Ручной запрос отчёта (для тестирования)
app.get('/report/preview', (req, res) => {
  const today = storage.getTodayKey();
  const report = {};

  for (const [userId, name] of Object.entries(config.employees)) {
    report[name] = storage.classifyTasks(userId, today);
  }

  res.json({ date: today, report });
});

module.exports = app;
