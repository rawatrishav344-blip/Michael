const BOT_TOKEN = '8635067603:AAGyKoPaZUgF5DyLSRXVBpayZ-Ll_NMrlkI';
const CHANNEL_ID = '-1004362743928';
const ADMIN_ID = 5840296032;

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
  if (!update.message && !update.callback_query) return;

  // CALLBACK QUERY (button press)
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const userId = msg.from.id;

  // /start handling
  if (text.startsWith('/start')) {
    const param = text.split(' ')[1];

    // Admin panel
    if (userId === ADMIN_ID && !param) {
      await showAdminPanel(chatId);
      return;
    }

    // User - no param
    if (!param) {
      await sendMessage(chatId, '🎌 *AnimeZone mein aapka swagat hai!*\n\nAnime dekhne ke liye Mini App use karo!');
      return;
    }

    // User - episode request
    const epData = await Animelightup.get(param);
    if (!epData) {
      await sendMessage(chatId, '❌ Episode abhi available nahi hai.');
      return;
    }
    const ep = JSON.parse(epData);
    await copyMessage(chatId, CHANNEL_ID, ep.messageId);
    return;
  }

  // Admin state handling
  if (userId === ADMIN_ID) {
    await handleAdminInput(chatId, userId, text);
  }
}

// ── ADMIN PANEL ──
async function showAdminPanel(chatId) {
  await sendButtons(chatId, '🎌 *AnimeZone Admin Panel*\n\nKya karna chahte ho?', [
    [{ text: '➕ Naya Anime Add', callback_data: 'add_anime' }],
    [{ text: '📋 Anime List', callback_data: 'list_anime' }],
    [{ text: '🗑️ Anime Delete', callback_data: 'delete_anime' }],
  ]);
}

async function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const userId = cb.from.id;
  const data = cb.data;

  if (userId !== ADMIN_ID) return;

  await answerCallback(cb.id);

  if (data === 'add_anime') {
    await Animelightup.put(`state_${userId}`, 'waiting_name');
    await sendMessage(chatId, '📝 Anime ka *naam* likho:');
  }

  else if (data === 'list_anime') {
    const list = await Animelightup.get('anime_list');
    if (!list || JSON.parse(list).length === 0) {
      await sendMessage(chatId, '❌ Koi anime nahi hai abhi.');
      return;
    }
    const animes = JSON.parse(list);
    let msg = '📋 *Anime List:*\n\n';
    animes.forEach((a, i) => { msg += `${i+1}. ${a.name}\n`; });
    await sendMessage(chatId, msg);
  }

  else if (data === 'delete_anime') {
    const list = await Animelightup.get('anime_list');
    if (!list || JSON.parse(list).length === 0) {
      await sendMessage(chatId, '❌ Koi anime nahi hai delete karne ke liye.');
      return;
    }
    const animes = JSON.parse(list);
    const buttons = animes.map(a => [{ text: `🗑️ ${a.name}`, callback_data: `del_${a.id}` }]);
    buttons.push([{ text: '🔙 Back', callback_data: 'back' }]);
    await sendButtons(chatId, '🗑️ Kaunsa anime delete karna hai?', buttons);
  }

  else if (data.startsWith('del_')) {
    const animeId = data.replace('del_', '');
    const list = await Animelightup.get('anime_list');
    let animes = JSON.parse(list);
    animes = animes.filter(a => a.id !== animeId);
    await Animelightup.put('anime_list', JSON.stringify(animes));
    await Animelightup.delete(`anime_${animeId}`);
    await sendMessage(chatId, '✅ Anime delete ho gaya!');
    await showAdminPanel(chatId);
  }

  else if (data.startsWith('confirm_')) {
    const action = data.replace('confirm_', '');
    if (action === 'name') {
      const name = await Animelightup.get(`temp_name_${userId}`);
      await Animelightup.put(`state_${userId}`, 'waiting_desc');
      await sendMessage(chatId, `✅ Naam confirm: *${name}*\n\nAb *description* likho:`);
    }
    else if (action === 'desc') {
      const desc = await Animelightup.get(`temp_desc_${userId}`);
      await Animelightup.put(`state_${userId}`, 'waiting_episodes');
      await sendMessage(chatId, `✅ Description confirm!\n\nAb *kitne episodes* hain? (sirf number likho)`);
    }
    else if (action === 'save') {
      await saveAnime(chatId, userId);
    }
  }

  else if (data.startsWith('reenter_')) {
    const field = data.replace('reenter_', '');
    await Animelightup.put(`state_${userId}`, `waiting_${field}`);
    await sendMessage(chatId, `✏️ Dobara *${field}* likho:`);
  }

  else if (data === 'back') {
    await Animelightup.delete(`state_${userId}`);
    await showAdminPanel(chatId);
  }
}

async function handleAdminInput(chatId, userId, text) {
  const state = await Animelightup.get(`state_${userId}`);
  if (!state) return;

  if (state === 'waiting_name') {
    await Animelightup.put(`temp_name_${userId}`, text);
    await sendButtons(chatId, `Anime naam: *${text}*\n\nSahi hai?`, [
      [
        { text: '✅ Haan', callback_data: 'confirm_name' },
        { text: '❌ Dobara', callback_data: 'reenter_name' }
      ]
    ]);
  }

  else if (state === 'waiting_desc') {
    await Animelightup.put(`temp_desc_${userId}`, text);
    await sendButtons(chatId, `Description:\n_${text}_\n\nSahi hai?`, [
      [
        { text: '✅ Haan', callback_data: 'confirm_desc' },
        { text: '❌ Dobara', callback_data: 'reenter_desc' }
      ]
    ]);
  }

  else if (state === 'waiting_episodes') {
    const count = parseInt(text);
    if (isNaN(count) || count < 1) {
      await sendMessage(chatId, '❌ Sirf number likho! Jaise: 12');
      return;
    }
    await Animelightup.put(`temp_epcount_${userId}`, String(count));
    await Animelightup.put(`temp_epcurrent_${userId}`, '1');
    await Animelightup.put(`state_${userId}`, 'waiting_ep_name');
    await sendMessage(chatId, `✅ ${count} episodes!\n\n*Episode 1* ka naam likho:`);
  }

  else if (state === 'waiting_ep_name') {
    const current = await Animelightup.get(`temp_epcurrent_${userId}`);
    await Animelightup.put(`temp_ep${current}_name_${userId}`, text);
    await Animelightup.put(`state_${userId}`, 'waiting_ep_link');
    await sendMessage(chatId, `Episode ${current} naam: *${text}*\n\nAb Episode ${current} ka *Telegram link* paste karo:\n(channel mein message pe tap → Copy Link)`);
  }

  else if (state === 'waiting_ep_link') {
    const current = parseInt(await Animelightup.get(`temp_epcurrent_${userId}`));
    const total = parseInt(await Animelightup.get(`temp_epcount_${userId}`));

    // Link se message ID nikalo
    const messageId = extractMessageId(text);
    if (!messageId) {
      await sendMessage(chatId, '❌ Sahi Telegram link paste karo!\nJaise: https://t.me/c/1234567890/5');
      return;
    }

    await Animelightup.put(`temp_ep${current}_link_${userId}`, String(messageId));

    if (current < total) {
      await Animelightup.put(`temp_epcurrent_${userId}`, String(current + 1));
      await Animelightup.put(`state_${userId}`, 'waiting_ep_name');
      await sendMessage(chatId, `✅ Episode ${current} save!\n\n*Episode ${current + 1}* ka naam likho:`);
    } else {
      // Sab episodes done - summary dikhao
      const name = await Animelightup.get(`temp_name_${userId}`);
      const desc = await Animelightup.get(`temp_desc_${userId}`);
      let summary = `📋 *Summary:*\n\n*Naam:* ${name}\n*Description:* ${desc}\n*Episodes:* ${total}\n\n`;
      for (let i = 1; i <= total; i++) {
        const epName = await Animelightup.get(`temp_ep${i}_name_${userId}`);
        summary += `EP${i}: ${epName}\n`;
      }
      summary += '\n*Save karein?*';
      await sendButtons(chatId, summary, [
        [
          { text: '✅ Save Karo', callback_data: 'confirm_save' },
          { text: '❌ Cancel', callback_data: 'back' }
        ]
      ]);
      await Animelightup.put(`state_${userId}`, 'waiting_final_confirm');
    }
  }
}

async function saveAnime(chatId, userId) {
  const name = await Animelightup.get(`temp_name_${userId}`);
  const desc = await Animelightup.get(`temp_desc_${userId}`);
  const total = parseInt(await Animelightup.get(`temp_epcount_${userId}`));
  const animeId = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();

  // Episodes save karo
  const episodes = [];
  for (let i = 1; i <= total; i++) {
    const epName = await Animelightup.get(`temp_ep${i}_name_${userId}`);
    const messageId = await Animelightup.get(`temp_ep${i}_link_${userId}`);
    const key = `${animeId}_ep${i}`;
    await Animelightup.put(key, JSON.stringify({ messageId: parseInt(messageId) }));
    episodes.push({ name: epName, key });
  }

  // Anime info save
  await Animelightup.put(`anime_${animeId}`, JSON.stringify({ name, desc, episodes }));

  // List update
  const listRaw = await Animelightup.get('anime_list');
  const list = listRaw ? JSON.parse(listRaw) : [];
  list.push({ id: animeId, name });
  await Animelightup.put('anime_list', JSON.stringify(list));

  // Temp data clean
  await Animelightup.delete(`state_${userId}`);
  await Animelightup.delete(`temp_name_${userId}`);
  await Animelightup.delete(`temp_desc_${userId}`);
  await Animelightup.delete(`temp_epcount_${userId}`);
  await Animelightup.delete(`temp_epcurrent_${userId}`);
  for (let i = 1; i <= total; i++) {
    await Animelightup.delete(`temp_ep${i}_name_${userId}`);
    await Animelightup.delete(`temp_ep${i}_link_${userId}`);
  }

  await sendMessage(chatId, `🎉 *${name}* successfully save ho gaya!\n\n${total} episodes add ho gaye!`);
  await showAdminPanel(chatId);
}

function extractMessageId(link) {
  const match = link.match(/\/(\d+)$/);
  return match ? match[1] : null;
}

async function sendMessage(chatId, text) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
}

async function sendButtons(chatId, text, buttons) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    })
  });
}

async function answerCallback(callbackId) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId })
  });
}

async function copyMessage(chatId, fromChatId, messageId) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, from_chat_id: fromChatId, message_id: messageId })
  });
             }
