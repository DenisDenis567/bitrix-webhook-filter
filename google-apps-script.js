/**
 * Google Apps Script для интеграции Google Sheets → Railway Server → Bitrix24
 *
 * ИНСТРУКЦИЯ ПО УСТАНОВКЕ:
 * 1. Откройте вашу Google Таблицу "Реестр платежей"
 * 2. Нажмите Расширения → Apps Script
 * 3. Скопируйте весь код из этого файла
 * 4. Вставьте в редактор Apps Script (заменив весь существующий код)
 * 5. Сохраните проект (Ctrl+S или иконка дискеты)
 * 6. При первом редактировании ячейки с "Оплачен" дайте разрешения Google
 *
 * ЧТО ДЕЛАЕТ СКРИПТ:
 * - Отслеживает изменения в колонке H (Оплачен)
 * - Когда вы вводите "Оплачен", скрипт берёт ID CRM из колонки M
 * - Отправляет webhook на ваш сервер Railway (БЕЗ всплывающих окон!)
 * - Сервер добавляет элемент в очередь
 * - Каждый час сервер переводит все элементы из очереди на стадию "Оплачено" в Bitrix24
 * - Все события логируются в Apps Script (Расширения → Apps Script → Выполнения)
 */

// КОНФИГУРАЦИЯ
const CONFIG = {
  // URL вашего сервера на Railway
  SERVER_URL: "https://bitrix24-webhook-filter-production.up.railway.app/sheets-webhook",

  // Номера колонок (не менять без необходимости!)
  COLUMNS: {
    STATUS: 8,      // Колонка H - "Оплачен"
    CRM_ID: 13,     // Колонка M - "ID CRM"
    DATE: 9,        // Колонка I - "дата оплаты"
    AMOUNT: 5       // Колонка E - "Сумма"
  },

  // Значение, которое триггерит отправку
  TRIGGER_VALUE: "Оплачен"
};

/**
 * Главная функция - срабатывает при редактировании любой ячейки
 */
function onEdit(e) {
  try {
    const sheet = e.source.getActiveSheet();
    const range = e.range;
    const col = range.getColumn();
    const row = range.getRow();

    // Пропускаем строку заголовков
    if (row === 1) {
      return;
    }

    // Проверяем: редактируется ли колонка H (Оплачен)?
    if (col !== CONFIG.COLUMNS.STATUS) {
      return;
    }

    // Проверяем: введено ли именно слово "Оплачен"?
    if (e.value !== CONFIG.TRIGGER_VALUE) {
      Logger.log(`Строка ${row}: значение "${e.value}" не соответствует триггеру "${CONFIG.TRIGGER_VALUE}"`);
      return;
    }

    // Получаем ID CRM из колонки M
    const crmId = sheet.getRange(row, CONFIG.COLUMNS.CRM_ID).getValue();

    // Если нет ID CRM - пропускаем
    if (!crmId) {
      Logger.log(`Строка ${row}: нет ID CRM в колонке M, пропускаем`);
      return;
    }

    // Формируем данные для отправки
    const payload = {
      crmId: String(crmId),
      status: "paid",
      timestamp: new Date().toISOString(),
      sheetRow: row,
      // Дополнительные данные (опционально)
      metadata: {
        paidDate: sheet.getRange(row, CONFIG.COLUMNS.DATE).getValue(),
        amount: sheet.getRange(row, CONFIG.COLUMNS.AMOUNT).getValue()
      }
    };

    Logger.log(`Строка ${row}: отправка webhook для CRM ID ${crmId}`);

    // Отправляем webhook
    const success = sendWebhook(payload, row);

    if (success) {
      Logger.log(`✓ Строка ${row}: webhook успешно отправлен`);
    } else {
      Logger.log(`✗ Строка ${row}: ошибка отправки webhook`);
    }

  } catch (error) {
    Logger.log(`Критическая ошибка в onEdit: ${error.message}`);
    Logger.log(error.stack);
  }
}

/**
 * Отправка webhook на сервер Railway
 */
function sendWebhook(payload, row) {
  try {
    const options = {
      method: "POST",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true  // Не выбрасывать исключение при HTTP ошибках
    };

    const response = UrlFetchApp.fetch(CONFIG.SERVER_URL, options);
    const statusCode = response.getResponseCode();
    const responseText = response.getContentText();

    Logger.log(`HTTP ${statusCode}: ${responseText}`);

    if (statusCode === 200) {
      // Успех!
      const responseData = JSON.parse(responseText);
      Logger.log(`✓ Успех: CRM ID ${payload.crmId} добавлен в очередь. Всего в очереди: ${responseData.queueSize}`);
      return true;
    } else {
      // Ошибка сервера
      Logger.log(`✗ Ошибка ${statusCode}: ${responseText}`);
      return false;
    }

  } catch (error) {
    Logger.log(`✗ Ошибка подключения: ${error.message}`);
    return false;
  }
}

/**
 * Тестовая функция для ручной проверки
 * Запустите её из редактора Apps Script для теста
 */
function testWebhook() {
  const testPayload = {
    crmId: "999",
    status: "paid",
    timestamp: new Date().toISOString(),
    sheetRow: 0,
    metadata: {
      note: "Это тестовый запрос из Google Apps Script"
    }
  };

  Logger.log("Отправка тестового webhook...");
  const success = sendWebhook(testPayload, 0);

  if (success) {
    Logger.log("✓ Тест пройден успешно!");
  } else {
    Logger.log("✗ Тест не пройден");
  }
}

/**
 * Функция для создания меню в таблице (опционально)
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔄 Bitrix24 Sync')
    .addItem('📊 Проверить подключение', 'testWebhook')
    .addItem('📋 Посмотреть логи', 'showLogs')
    .addToUi();
}

/**
 * Показать недавние логи
 */
function showLogs() {
  Logger.log('Для просмотра логов откройте: Расширения → Apps Script → Выполнения');
}
