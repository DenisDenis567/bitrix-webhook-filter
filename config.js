require('dotenv').config();

module.exports = {
  // Порт сервера
  port: process.env.PORT || 3000,

  // Битрикс24 REST API
  bitrix: {
    webhookUrl: process.env.BITRIX_WEBHOOK_URL, // https://your-domain.bitrix24.ru/rest/USER_ID/SECRET/
  },

  // Telegram
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID, // ID чата руководителя
  },

  // Время отправки отчёта (формат cron: "минуты часы * * *")
  reportCron: process.env.REPORT_CRON || '0 19 * * 1-5', // 19:00 по будням

  // Сотрудники для отслеживания
  // Формат: { "bitrix_user_id": "Имя Фамилия" }
  employees: JSON.parse(process.env.EMPLOYEES || '{}'),

  // Путь к папке хранения данных
  dataDir: process.env.DATA_DIR || './data',
};
