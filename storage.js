const fs = require('fs');
const path = require('path');
const config = require('./config');

const dataDir = path.resolve(config.dataDir);

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // "2026-03-17"
}

function getFilePath(date) {
  return path.join(dataDir, `${date}.json`);
}

function loadDay(date) {
  const filePath = getFilePath(date);
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function saveDay(date, data) {
  ensureDataDir();
  fs.writeFileSync(getFilePath(date), JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Структура дневного файла:
 * {
 *   "userId": {
 *     "tasks": {
 *       "taskId": {
 *         "id": "123",
 *         "title": "Название задачи",
 *         "events": [
 *           { "type": "completed", "at": "2026-03-17T14:30:00Z" },
 *           { "type": "resumed",   "at": "2026-03-17T15:00:00Z" },
 *           { "type": "completed", "at": "2026-03-17T16:00:00Z" }
 *         ]
 *       }
 *     }
 *   }
 * }
 */

function recordEvent(userId, taskId, taskTitle, eventType) {
  const today = getTodayKey();
  const data = loadDay(today);

  if (!data[userId]) {
    data[userId] = { tasks: {} };
  }

  if (!data[userId].tasks[taskId]) {
    data[userId].tasks[taskId] = {
      id: taskId,
      title: taskTitle,
      events: [],
    };
  }

  data[userId].tasks[taskId].events.push({
    type: eventType, // "completed" | "resumed"
    at: new Date().toISOString(),
  });

  saveDay(today, data);
}

/**
 * Классифицирует задачи сотрудника за день:
 * - completed: завершена сегодня (без возобновления)
 * - resumed: возобновлена сегодня, но НЕ завершена повторно
 * - resumed_completed: возобновлена И завершена в тот же день
 */
function classifyTasks(userId, date) {
  const data = loadDay(date || getTodayKey());
  const userEntry = data[userId];

  const result = {
    completed: [],
    resumed: [],
    resumed_completed: [],
  };

  if (!userEntry) return result;

  for (const [taskId, task] of Object.entries(userEntry.tasks)) {
    const events = task.events;
    const hasCompleted = events.some((e) => e.type === 'completed');
    const hasResumed = events.some((e) => e.type === 'resumed');

    if (hasResumed && hasCompleted) {
      // Возобновлена и завершена в тот же день
      const lastEvent = events[events.length - 1];
      if (lastEvent.type === 'completed') {
        result.resumed_completed.push(task);
      } else {
        // Последнее событие — resumed, значит снова в работе
        result.resumed.push(task);
      }
    } else if (hasResumed && !hasCompleted) {
      // Только возобновлена, не завершена
      result.resumed.push(task);
    } else if (hasCompleted && !hasResumed) {
      // Только завершена
      result.completed.push(task);
    }
  }

  return result;
}

function clearDay(date) {
  const filePath = getFilePath(date || getTodayKey());
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

module.exports = {
  recordEvent,
  classifyTasks,
  clearDay,
  getTodayKey,
  loadDay,
};
