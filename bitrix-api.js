const https = require('https');
const http = require('http');
const config = require('./config');

/**
 * Вызов метода Битрикс24 REST API
 */
function callBitrix(method, params = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${config.bitrix.webhookUrl}${method}`);

    const postData = JSON.stringify(params);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error(`Bitrix API parse error: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Получить информацию о задаче по ID
 */
async function getTask(taskId) {
  const result = await callBitrix('tasks.task.get', {
    taskId,
    select: ['ID', 'TITLE', 'STATUS', 'RESPONSIBLE_ID', 'CREATED_BY'],
  });
  return result.result?.task || null;
}

module.exports = { callBitrix, getTask };
