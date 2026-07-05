const BOT_TOKEN = '8635067603:AAGyKoPaZUgF5DyLSRXVBpayZ-Ll_NMrlkI';
const CHANNEL_ID = '-1004362743928';

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === 'POST') {
    const update = await request.json();
    await processUpdate(update);
  }
  return new Response('OK');
}

async function processUpdate(update) {
  if (!update.message) return;

  const chatId = update.message.chat.id;
  const text = update.message.text || '';

  // /start command handle
  if (text.startsWith('/start')) {
    const param = text.split(' ')[1]; // episode ID milega

    if (!param) {
      await sendMessage(chatId, '🎌 *AnimeZone Bot*\n\nEpisode download karne ke liye mini app use karo!');
      return;
    }

    // Database - episode mapping
    const episodeDB = {
      'jjk_ep1': 2,      // channel mein message ID 2
      'jjk_ep2': 3,
      'ds_ep1': 4,
      'ds_ep2': 5,
      // aur episodes add karte raho
    };

    const messageId = episodeDB[param];

    if (!messageId) {
      await sendMessage(chatId, '❌ Episode abhi available nahi hai.');
      return;
    }

    // Channel se video forward karo
    await forwardMessage(chatId, CHANNEL_ID, messageId);
  }
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    })
  });
}

async function forwardMessage(chatId, fromChatId, messageId) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/forwardMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      from_chat_id: fromChatId,
      message_id: messageId
    })
  });
      }
