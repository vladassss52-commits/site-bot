import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const leadsFile = path.join(__dirname, 'leads.jsonl');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function normalizePhone(value = '') {
  const raw = String(value).trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('8') && digits.length === 11) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.startsWith('7') && digits.length === 11) {
    return `+${digits}`;
  }
  if (raw.startsWith('+')) return raw;
  return `+${digits}`;
}

async function appendLeadLog(lead) {
  const line = JSON.stringify(lead, ensureAsciiSafeReplacer) + '\n';
  await fs.appendFile(leadsFile, line, 'utf-8');
}

function ensureAsciiSafeReplacer(_key, value) {
  return value;
}

app.post('/api/lead', async (req, res) => {
  try {
    const {
      name = '',
      phone = '',
      address = '',
      comment = '',
      source = 'Сайт',
      formType = 'Основная форма',
      page = '/',
    } = req.body || {};

    if (!phone.trim()) {
      return res.status(400).json({ error: 'Укажите телефон' });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    const personalChatId = process.env.TELEGRAM_CHAT_ID;
    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;

    if (!token || !personalChatId) {
      return res.status(500).json({ error: 'Не настроены TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID' });
    }

    const now = new Date();
    const timestamp = now.toLocaleString('ru-RU', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const safeName = escapeHtml(name) || '—';
    const safePhone = escapeHtml(phone);
    const safeAddress = escapeHtml(address) || '—';
    const safeComment = escapeHtml(comment) || '—';
    const safeSource = escapeHtml(source) || 'Сайт';
    const safeFormType = escapeHtml(formType) || 'Основная форма';
    const safePage = escapeHtml(page) || '/';

    const normalizedPhone = normalizePhone(phone);
    const phoneBlock = normalizedPhone
    ? `${safePhone} (${escapeHtml(normalizedPhone)})`
    : safePhone;

    const message = [
    '🔥 <b>Новая заявка с сайта</b>',
    '',
    `🕒 <b>Время:</b> ${timestamp}`,
    `🌐 <b>Источник:</b> ${safeSource}`,
    `📋 <b>Форма:</b> ${safeFormType}`,
    `📍 <b>Страница:</b> ${safePage}`,
    '',
    `👤 <b>Имя:</b> ${safeName}`,
    `📞 <b>Телефон:</b> ${phoneBlock}`,
    `🏗 <b>Адрес:</b> ${safeAddress}`,
    `📝 <b>Комментарий:</b> ${safeComment}`,
    '',
    '⏱ <b>Проверьте заявку как можно быстрее</b>',
  ].join('\n');

    const chatIds = [personalChatId, groupChatId].filter(Boolean);

    for (const chatId of chatIds) {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      const tgData = await tgRes.json();

      if (!tgRes.ok || !tgData.ok) {
        console.error('Telegram error:', tgData);
        return res.status(500).json({ error: 'Telegram не принял сообщение' });
      }
    }

    await appendLeadLog({
      createdAt: now.toISOString(),
      timestampRu: timestamp,
      source,
      formType,
      page,
      name,
      phone,
      normalizedPhone,
      address,
      comment,
    });

    return res.json({ ok: true, message: 'Заявка отправлена в Telegram' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
