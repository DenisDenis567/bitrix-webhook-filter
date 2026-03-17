const https = require('https');
const config = require('./config');
const storage = require('./storage');

/**
 * Отправка сообщения в Telegram
 */
function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      chat_id: config.telegram.chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${config.telegram.botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          if (!result.ok) {
            reject(new Error(`Telegram API error: ${result.description}`));
          } else {
            resolve(result);
          }
        } catch {
          reject(new Error(`Telegram parse error: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Формирует текст отчёта для одного сотрудника
 */
function formatEmployeeReport(name, classified) {
  const lines = [];
  lines.push(`<b>${name}</b>`);

  if (classified.completed.length === 0 &&
      classified.resumed.length === 0 &&
      classified.resumed_completed.length === 0) {
    lines.push('  Нет завершённых или возобновлённых задач.');
    return lines.join('\n');
  }

  if (classified.completed.length > 0) {
    lines.push('');
    lines.push(`<b>Завершённые задачи (${classified.completed.length}):</b>`);
    classified.completed.forEach((t, i) => {
      lines.push(`  ${i + 1}. ${escapeHtml(t.title)}`);
    });
  }

  if (classified.resumed_completed.length > 0) {
    lines.push('');
    lines.push(`<b>Возобновлённые и завершённые (${classified.resumed_completed.length}):</b>`);
    classified.resumed_completed.forEach((t, i) => {
      lines.push(`  ${i + 1}. ${escapeHtml(t.title)}`);
    });
  }

  if (classified.resumed.length > 0) {
    lines.push('');
    lines.push(`<b>Возвращённые в работу (${classified.resumed.length}):</b>`);
    classified.resumed.forEach((t, i) => {
      lines.push(`  ${i + 1}. ${escapeHtml(t.title)}`);
    });
  }

  return lines.join('\n');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Отправляет вечерний отчёт за сегодня
 */
async function sendDailyReport() {
  const today = storage.getTodayKey();
  console.log(`[report] Формирую отчёт за ${today}`);

  const sections = [];
  let hasAnyTasks = false;

  for (const [userId, name] of Object.entries(config.employees)) {
    const classified = storage.classifyTasks(userId, today);
    const totalTasks = classified.completed.length +
                       classified.resumed.length +
                       classified.resumed_completed.length;

    if (totalTasks > 0) hasAnyTasks = true;

    sections.push(formatEmployeeReport(name, classified));
  }

  if (!hasAnyTasks) {
    console.log('[report] Нет задач за сегодня, отчёт не отправляем');
    return;
  }

  const header = `<b>Отчёт по задачам за ${today}</b>\n${'─'.repeat(30)}`;
  const message = [header, ...sections].join('\n\n');

  try {
    await sendTelegram(message);
    console.log('[report] Отчёт отправлен в Telegram');
  } catch (err) {
    console.error('[report] Ошибка отправки:', err.message);
  }
}

module.exports = { sendDailyReport, sendTelegram };
