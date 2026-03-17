const cron = require('node-cron');
const config = require('./config');
const { sendDailyReport } = require('./reporter');

function startScheduler() {
  console.log(`[scheduler] Отчёт будет отправляться по расписанию: ${config.reportCron}`);

  cron.schedule(config.reportCron, async () => {
    console.log('[scheduler] Запуск отправки отчёта...');
    await sendDailyReport();
  });
}

module.exports = { startScheduler };
