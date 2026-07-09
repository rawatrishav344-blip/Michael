const BOT_TOKEN = '8635067603:AAGyKoPaZUgF5DyLSRXVBpayZ-Ll_NMrlkI';
const ADMIN_ID = 5840296032;

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  if (request.method === 'POST') {
    try {
      const update = await request.json();
      await processUpdate(update);
    } catch(e) {
      return new Response('Error: ' + e.message, {status: 200});
    }
  }
  return new Response('OK', {status: 200});
}

async function processUpdate(update) {
  if (!update.message) return;
  
  const chatId = update.message.chat.id;
  const text = update.message.text || '';
  const userId = update.message.from.id;

  if (text === '/start') {
    if (userId === ADMIN_ID) {
      await sendMessage(chatId, '✅ Admin Panel coming soon!');
    } else {
      await sendMessage(chatId, '🎌 AnimeZone mein swagat hai!');
    }
  }
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}
