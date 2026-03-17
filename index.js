const app = require('./server');
const config = require('./config');
const { startScheduler } = require('./scheduler');

app.listen(config.port, () => {
  console.log(`[server] Bitrix Task Reporter запущен на порту ${config.port}`);
  console.log(`[server] Отслеживаемые сотрудники: ${Object.values(config.employees).join(', ') || 'не указаны'}`);
  console.log(`[server] Webhook URL: POST /webhook/bitrix`);
  console.log(`[server] Health check: GET /health`);
  console.log(`[server] Preview отчёта: GET /report/preview`);
});

startScheduler();
