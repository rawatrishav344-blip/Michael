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

  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }

  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const userId = msg.from.id;
  const photo = msg.photo;

  if (text === '/start') {
    if (userId === ADMIN_ID) {
      await clearTemp(userId);
      await showAdminPanel(chatId);
    } else {
      await sendMessage(chatId, '🎌 *AnimeZone mein swagat hai!*\n\nAnime dekhne ke liye Mini App use karo!');
    }
    return;
  }

  if (text.startsWith('/start ')) {
    const param = text.split(' ')[1];
    const epData = await Animelightup.get(param);
    if (!epData) {
      await sendMessage(chatId, '❌ Episode abhi available nahi hai.');
      return;
    }
    const ep = JSON.parse(epData);
    await copyMessage(chatId, CHANNEL_ID, ep.messageId);
    return;
  }

  if (userId === ADMIN_ID) {
    await handleAdminInput(chatId, userId, text, photo);
  }
}

// ── ADMIN PANEL ──
async function showAdminPanel(chatId) {
  await sendButtons(chatId,
    '🎌 *AnimeZone Admin Panel*\n\nKya karna chahte ho?',
    [
      [{ text: '➕ Naya Anime Add', callback_data: 'add_anime' }],
      [{ text: '📋 Anime List', callback_data: 'list_anime' }],
      [{ text: '🗑️ Anime Delete', callback_data: 'delete_anime' }],
    ]
  );
}

// ── CALLBACK HANDLER ──
async function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const userId = cb.from.id;
  const data = cb.data;
  if (userId !== ADMIN_ID) return;
  await answerCallback(cb.id);

  // STOP - sab cancel
  if (data === 'stop') {
    await clearTemp(userId);
    await sendMessage(chatId, '🛑 Process cancel ho gayi.');
    await showAdminPanel(chatId);
    return;
  }

  // ADD ANIME start
  if (data === 'add_anime') {
    await clearTemp(userId);
    await Animelightup.put(`state_${userId}`, 'waiting_photo');
    await sendButtons(chatId,
      '📸 *Step 1/9*\n\nAnime ki *cover photo* bhejo:',
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  // LIST
  if (data === 'list_anime') {
    const list = await Animelightup.get('anime_list');
    if (!list || JSON.parse(list).length === 0) {
      await sendMessage(chatId, '❌ Koi anime nahi hai abhi.');
      await showAdminPanel(chatId);
      return;
    }
    const animes = JSON.parse(list);
    let msg = '📋 *Anime List:*\n\n';
    animes.forEach((a, i) => { msg += `${i+1}. ${a.name}\n`; });
    await sendMessage(chatId, msg);
    await showAdminPanel(chatId);
    return;
  }

  // DELETE LIST
  if (data === 'delete_anime') {
    const list = await Animelightup.get('anime_list');
    if (!list || JSON.parse(list).length === 0) {
      await sendMessage(chatId, '❌ Koi anime nahi hai.');
      await showAdminPanel(chatId);
      return;
    }
    const animes = JSON.parse(list);
    const buttons = animes.map(a => [{ text: `🗑️ ${a.name}`, callback_data: `del_${a.id}` }]);
    buttons.push([{ text: '🔙 Back', callback_data: 'back_panel' }]);
    await sendButtons(chatId, '🗑️ *Kaunsa anime delete karna hai?*', buttons);
    return;
  }

  // DELETE CONFIRM
  if (data.startsWith('del_')) {
    const animeId = data.replace('del_', '');
    await sendButtons(chatId, '⚠️ *Pakka delete karna hai?*', [
      [
        { text: '✅ Haan Delete Karo', callback_data: `confirm_del_${animeId}` },
        { text: '❌ Nahi', callback_data: 'back_panel' }
      ]
    ]);
    return;
  }

  if (data.startsWith('confirm_del_')) {
    const animeId = data.replace('confirm_del_', '');
    const list = await Animelightup.get('anime_list');
    let animes = JSON.parse(list);
    const anime = animes.find(a => a.id === animeId);
    animes = animes.filter(a => a.id !== animeId);
    await Animelightup.put('anime_list', JSON.stringify(animes));
    await Animelightup.delete(`anime_${animeId}`);
    await sendMessage(chatId, `✅ *${anime?.name}* delete ho gaya!`);
    await showAdminPanel(chatId);
    return;
  }

  if (data === 'back_panel') {
    await showAdminPanel(chatId);
    return;
  }

  // CONFIRM / REENTER handlers
  if (data.startsWith('confirm_') || data.startsWith('reenter_')) {
    await handleConfirm(chatId, userId, data);
    return;
  }

  // TYPE SELECT
  if (data.startsWith('type_')) {
    const type = data.replace('type_', '');
    await Animelightup.put(`temp_type_${userId}`, type);
    await Animelightup.put(`state_${userId}`, 'waiting_year');
    await sendButtons(chatId,
      `✅ Type: *${type}*\n\n📅 *Step 4b/9*\n\nAnime ka *release year* likho:\n(jaise: 2024)`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  // AGE RATING SELECT
  if (data.startsWith('age_')) {
    const age = data.replace('age_', '');
    await Animelightup.put(`temp_age_${userId}`, age);
    await Animelightup.put(`state_${userId}`, 'waiting_rating');
    await sendButtons(chatId,
      `✅ Age Rating: *${age}*\n\n⭐ *Step 5/9*\n\nAnime ki *rating* likho:\n(jaise: 4.7)`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }
}

// ── CONFIRM/REENTER ──
async function handleConfirm(chatId, userId, data) {
  if (data === 'confirm_name') {
    await Animelightup.put(`state_${userId}`, 'waiting_desc');
    const name = await Animelightup.get(`temp_name_${userId}`);
    await sendButtons(chatId,
      `✅ Naam: *${name}*\n\n📋 *Step 3/9*\n\nAnime ka *description* likho:`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
  }
  else if (data === 'reenter_name') {
    await Animelightup.put(`state_${userId}`, 'waiting_name');
    await sendButtons(chatId, '📝 Dobara *naam* likho:', [[{ text: '🛑 Stop', callback_data: 'stop' }]]);
  }
  else if (data === 'confirm_desc') {
    await Animelightup.put(`state_${userId}`, 'waiting_type');
    await sendButtons(chatId,
      '✅ Description save!\n\n🏷️ *Step 4a/9*\n\n*Type select karo:*',
      [
        [
          { text: '🎧 Dual Audio', callback_data: 'type_Dual Audio' },
          { text: '📖 Sub', callback_data: 'type_Sub' },
          { text: '🎙️ Dub', callback_data: 'type_Dub' }
        ],
        [{ text: '🛑 Stop', callback_data: 'stop' }]
      ]
    );
  }
  else if (data === 'reenter_desc') {
    await Animelightup.put(`state_${userId}`, 'waiting_desc');
    await sendButtons(chatId, '📋 Dobara *description* likho:', [[{ text: '🛑 Stop', callback_data: 'stop' }]]);
  }
  else if (data === 'confirm_rating') {
    await Animelightup.put(`state_${userId}`, 'waiting_season');
    const rating = await Animelightup.get(`temp_rating_${userId}`);
    const reviews = await Animelightup.get(`temp_reviews_${userId}`);
    await sendButtons(chatId,
      `✅ Rating: *${rating}* (${reviews} reviews)\n\n🎬 *Step 6/9*\n\n*Season naam* likho:\n(jaise: S1: Demon Slayer)`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
  }
  else if (data === 'reenter_rating') {
    await Animelightup.put(`state_${userId}`, 'waiting_rating');
    await sendButtons(chatId, '⭐ Dobara *rating* likho:', [[{ text: '🛑 Stop', callback_data: 'stop' }]]);
  }
  else if (data === 'confirm_season') {
    await Animelightup.put(`state_${userId}`, 'waiting_epcount');
    const season = await Animelightup.get(`temp_season_${userId}`);
    await sendButtons(chatId,
      `✅ Season: *${season}*\n\n📺 *Step 7/9*\n\n*Kitne episodes* hain? (sirf number likho)`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
  }
  else if (data === 'reenter_season') {
    await Animelightup.put(`state_${userId}`, 'waiting_season');
    await sendButtons(chatId, '🎬 Dobara *season naam* likho:', [[{ text: '🛑 Stop', callback_data: 'stop' }]]);
  }
  else if (data === 'confirm_save') {
    await saveAnime(chatId, userId);
  }
}

// ── ADMIN INPUT ──
async function handleAdminInput(chatId, userId, text, photo) {
  const state = await Animelightup.get(`state_${userId}`);
  if (!state) return;

  // STOP text se bhi
  if (text === '🛑' || text?.toLowerCase() === 'stop') {
    await clearTemp(userId);
    await sendMessage(chatId, '🛑 Process cancel.');
    await showAdminPanel(chatId);
    return;
  }

  // PHOTO
  if (state === 'waiting_photo') {
    if (!photo) {
      await sendMessage(chatId, '❌ Photo bhejo! Text nahi.');
      return;
    }
    const fileId = photo[photo.length - 1].file_id;
    await Animelightup.put(`temp_photo_${userId}`, fileId);
    await Animelightup.put(`state_${userId}`, 'waiting_name');
    await sendPhotoWithButtons(chatId, fileId,
      '✅ Photo mil gayi!\n\n📝 *Step 2/9*\n\nAnime ka *naam* likho:',
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  // NAME
  if (state === 'waiting_name') {
    await Animelightup.put(`temp_name_${userId}`, text);
    await sendButtons(chatId,
      `Anime naam: *${text}*\n\nSahi hai?`,
      [
        [
          { text: '✅ Haan', callback_data: 'confirm_name' },
          { text: '❌ Dobara', callback_data: 'reenter_name' }
        ],
        [{ text: '🛑 Stop', callback_data: 'stop' }]
      ]
    );
    return;
  }

  // DESCRIPTION
  if (state === 'waiting_desc') {
    await Animelightup.put(`temp_desc_${userId}`, text);
    await sendButtons(chatId,
      `Description:\n_${text}_\n\nSahi hai?`,
      [
        [
          { text: '✅ Haan', callback_data: 'confirm_desc' },
          { text: '❌ Dobara', callback_data: 'reenter_desc' }
        ],
        [{ text: '🛑 Stop', callback_data: 'stop' }]
      ]
    );
    return;
  }

  // YEAR
  if (state === 'waiting_year') {
    await Animelightup.put(`temp_year_${userId}`, text);
    await Animelightup.put(`state_${userId}`, 'waiting_age');
    await sendButtons(chatId,
      `✅ Year: *${text}*\n\n🔞 *Step 4c/9*\n\n*Age rating* select karo:`,
      [
        [
          { text: 'U/A 7+', callback_data: 'age_UA7+' },
          { text: 'U/A 13+', callback_data: 'age_UA13+' },
        ],
        [
          { text: 'U/A 16+', callback_data: 'age_UA16+' },
          { text: 'U/A 18+', callback_data: 'age_UA18+' },
        ],
        [{ text: '🛑 Stop', callback_data: 'stop' }]
      ]
    );
    return;
  }

  // RATING
  if (state === 'waiting_rating') {
    if (isNaN(parseFloat(text))) {
      await sendMessage(chatId, '❌ Sirf number likho! Jaise: 4.7');
      return;
    }
    await Animelightup.put(`temp_rating_${userId}`, text);
    await Animelightup.put(`state_${userId}`, 'waiting_reviews');
    await sendButtons(chatId,
      `⭐ Rating: *${text}*\n\nAb *review count* likho:\n(jaise: 16.5K)`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  // REVIEWS
  if (state === 'waiting_reviews') {
    await Animelightup.put(`temp_reviews_${userId}`, text);
    const rating = await Animelightup.get(`temp_rating_${userId}`);
    await sendButtons(chatId,
      `Rating: *${rating}* ⭐\nReviews: *${text}*\n\nSahi hai?`,
      [
        [
          { text: '✅ Haan', callback_data: 'confirm_rating' },
          { text: '❌ Dobara', callback_data: 'reenter_rating' }
        ],
        [{ text: '🛑 Stop', callback_data: 'stop' }]
      ]
    );
    return;
  }

  // SEASON
  if (state === 'waiting_season') {
    await Animelightup.put(`temp_season_${userId}`, text);
    await sendButtons(chatId,
      `Season: *${text}*\n\nSahi hai?`,
      [
        [
          { text: '✅ Haan', callback_data: 'confirm_season' },
          { text: '❌ Dobara', callback_data: 'reenter_season' }
        ],
        [{ text: '🛑 Stop', callback_data: 'stop' }]
      ]
    );
    return;
  }

  // EPISODE COUNT
  if (state === 'waiting_epcount') {
    const count = parseInt(text);
    if (isNaN(count) || count < 1) {
      await sendMessage(chatId, '❌ Sirf number likho! Jaise: 12');
      return;
    }
    await Animelightup.put(`temp_epcount_${userId}`, String(count));
    await Animelightup.put(`temp_epcurrent_${userId}`, '1');
    await Animelightup.put(`state_${userId}`, 'waiting_ep_name');
    await sendButtons(chatId,
      `✅ *${count}* episodes!\n\n📺 *Step 8/9*\n\n*Episode 1* ka naam likho:`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  // EPISODE NAME
  if (state === 'waiting_ep_name') {
    const current = await Animelightup.get(`temp_epcurrent_${userId}`);
    await Animelightup.put(`temp_ep${current}_name_${userId}`, text);
    await Animelightup.put(`state_${userId}`, 'waiting_ep_link');
    await sendButtons(chatId,
      `Episode ${current} naam: *${text}*\n\nAb Episode ${current} ka *Telegram link* paste karo:\n_(Channel mein message pe tap → Copy Link)_`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  // EPISODE LINK
  if (state === 'waiting_ep_link') {
    const current = parseInt(await Animelightup.get(`temp_epcurrent_${userId}`));
    const total = parseInt(await Animelightup.get(`temp_epcount_${userId}`));
    const messageId = extractMessageId(text);
    if (!messageId) {
      await sendMessage(chatId, '❌ Sahi Telegram link paste karo!\nJaise: https://t.me/c/1234567890/5');
      return;
    }
    await Animelightup.put(`temp_ep${current}_link_${userId}`, String(messageId));

    if (current < total) {
      await Animelightup.put(`temp_epcurrent_${userId}`, String(current + 1));
      await Animelightup.put(`state_${userId}`, 'waiting_ep_name');
      await sendButtons(chatId,
        `✅ Episode ${current} save!\n\n*Episode ${current + 1}* ka naam likho:`,
        [[{ text: '🛑 Stop', callback_data: 'stop' }]]
      );
    } else {
      // Final summary
      const name = await Animelightup.get(`temp_name_${userId}`);
      const desc = await Animelightup.get(`temp_desc_${userId}`);
      const type = await Animelightup.get(`temp_type_${userId}`);
      const year = await Animelightup.get(`temp_year_${userId}`);
      const age = await Animelightup.get(`temp_age_${userId}`);
      const rating = await Animelightup.get(`temp_rating_${userId}`);
      const reviews = await Animelightup.get(`temp_reviews_${userId}`);
      const season = await Animelightup.get(`temp_season_${userId}`);

      let summary = `📋 *Final Summary:*\n\n`;
      summary += `🎌 *Naam:* ${name}\n`;
      summary += `📋 *Desc:* ${desc}\n`;
      summary += `🏷️ *Type:* ${type} | ${year} | ${age}\n`;
      summary += `⭐ *Rating:* ${rating} (${reviews})\n`;
      summary += `🎬 *Season:* ${season}\n`;
      summary += `📺 *Episodes:* ${total}\n\n`;
      for (let i = 1; i <= total; i++) {
        const epName = await Animelightup.get(`temp_ep${i}_name_${userId}`);
        summary += `EP${i}: ${epName}\n`;
      }
      summary += '\n*Save karein?*';

      await sendButtons(chatId, summary, [
        [
          { text: '✅ Save Karo', callback_data: 'confirm_save' },
          { text: '🛑 Cancel', callback_data: 'stop' }
        ]
      ]);
      await Animelightup.put(`state_${userId}`, 'waiting_final');
    }
    return;
  }
}

// ── SAVE ANIME ──
async function saveAnime(chatId, userId) {
  const name = await Animelightup.get(`temp_name_${userId}`);
  const desc = await Animelightup.get(`temp_desc_${userId}`);
  const photo = await Animelightup.get(`temp_photo_${userId}`);
  const type = await Animelightup.get(`temp_type_${userId}`);
  const year = await Animelightup.get(`temp_year_${userId}`);
  const age = await Animelightup.get(`temp_age_${userId}`);
  const rating = await Animelightup.get(`temp_rating_${userId}`);
  const reviews = await Animelightup.get(`temp_reviews_${userId}`);
  const season = await Animelightup.get(`temp_season_${userId}`);
  const total = parseInt(await Animelightup.get(`temp_epcount_${userId}`));
  const animeId = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();

  const episodes = [];
  for (let i = 1; i <= total; i++) {
    const epName = await Animelightup.get(`temp_ep${i}_name_${userId}`);
    const messageId = await Animelightup.get(`temp_ep${i}_link_${userId}`);
    const key = `${animeId}_ep${i}`;
    await Animelightup.put(key, JSON.stringify({ messageId: parseInt(messageId) }));
    episodes.push({ name: epName, key });
  }

  await Animelightup.put(`anime_${animeId}`, JSON.stringify({
    name, desc, photo, type, year, age, rating, reviews, season, episodes
  }));

  const listRaw = await Animelightup.get('anime_list');
  const list = listRaw ? JSON.parse(listRaw) : [];
  list.push({ id: animeId, name });
  await Animelightup.put('anime_list', JSON.stringify(list));

  await clearTemp(userId);
  await sendMessage(chatId, `🎉 *${name}* successfully save ho gaya!\n✅ ${total} episodes add ho gaye!`);
  await showAdminPanel(chatId);
}

// ── HELPERS ──
function extractMessageId(link) {
  const match = link.match(/\/(\d+)$/);
  return match ? match[1] : null;
}

async function clearTemp(userId) {
  await Animelightup.delete(`state_${userId}`);
  await Animelightup.delete(`temp_photo_${userId}`);
  await Animelightup.delete(`temp_name_${userId}`);
  await Animelightup.delete(`temp_desc_${userId}`);
  await Animelightup.delete(`temp_type_${userId}`);
  await Animelightup.delete(`temp_year_${userId}`);
  await Animelightup.delete(`temp_age_${userId}`);
  await Animelightup.delete(`temp_rating_${userId}`);
  await Animelightup.delete(`temp_reviews_${userId}`);
  await Animelightup.delete(`temp_season_${userId}`);
  await Animelightup.delete(`temp_epcount_${userId}`);
  await Animelightup.delete(`temp_epcurrent_${userId}`);
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
      chat_id: chatId, text,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    })
  });
}

async function sendPhotoWithButtons(chatId, fileId, caption, buttons) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: fileId,
      caption,
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
