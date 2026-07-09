const BOT_TOKEN = '8635067603:AAGyKoPaZUgF5DyLSRXVBpayZ-Ll_NMrlkI';
const CHANNEL_ID = '-1004362743928';
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
      return new Response('OK', {status: 200});
    }
  }
  return new Response('OK', {status: 200});
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
    try {
      const epData = await ANIME_DB.get(param);
      if (!epData) {
        await sendMessage(chatId, '❌ Episode abhi available nahi hai.');
        return;
      }
      const ep = JSON.parse(epData);
      await copyMessage(chatId, CHANNEL_ID, ep.messageId);
    } catch(e) {
      await sendMessage(chatId, '❌ Kuch problem hui. Dobara try karo.');
    }
    return;
  }

  if (userId === ADMIN_ID) {
    await handleAdminInput(chatId, userId, text, photo);
  }
}

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

async function handleCallback(cb) {
  const chatId = cb.message.chat.id;
  const userId = cb.from.id;
  const data = cb.data;
  if (userId !== ADMIN_ID) return;
  await answerCallback(cb.id);

  if (data === 'stop') {
    await clearTemp(userId);
    await sendMessage(chatId, '🛑 Process cancel ho gayi.');
    await showAdminPanel(chatId);
    return;
  }

  if (data === 'add_anime') {
    await clearTemp(userId);
    await ANIME_DB.put(`state_${userId}`, 'waiting_photo');
    await sendButtons(chatId,
      '📸 *Step 1/9*\n\nAnime ki *cover photo* bhejo:',
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (data === 'list_anime') {
    const list = await ANIME_DB.get('anime_list');
    if (!list || JSON.parse(list).length === 0) {
      await sendMessage(chatId, '❌ Koi anime nahi hai abhi.');
    } else {
      const animes = JSON.parse(list);
      let msg = '📋 *Anime List:*\n\n';
      animes.forEach((a, i) => { msg += `${i+1}. ${a.name}\n`; });
      await sendMessage(chatId, msg);
    }
    await showAdminPanel(chatId);
    return;
  }

  if (data === 'delete_anime') {
    const list = await ANIME_DB.get('anime_list');
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

  if (data.startsWith('del_')) {
    const animeId = data.replace('del_', '');
    await sendButtons(chatId, '⚠️ *Pakka delete karna hai?*', [
      [
        { text: '✅ Haan', callback_data: `confirm_del_${animeId}` },
        { text: '❌ Nahi', callback_data: 'back_panel' }
      ]
    ]);
    return;
  }

  if (data.startsWith('confirm_del_')) {
    const animeId = data.replace('confirm_del_', '');
    const list = await ANIME_DB.get('anime_list');
    let animes = JSON.parse(list);
    const anime = animes.find(a => a.id === animeId);
    animes = animes.filter(a => a.id !== animeId);
    await ANIME_DB.put('anime_list', JSON.stringify(animes));
    await ANIME_DB.delete(`anime_${animeId}`);
    await sendMessage(chatId, `✅ *${anime?.name}* delete ho gaya!`);
    await showAdminPanel(chatId);
    return;
  }

  if (data === 'back_panel') {
    await showAdminPanel(chatId);
    return;
  }

  if (data === 'confirm_name') {
    const name = await ANIME_DB.get(`temp_name_${userId}`);
    await ANIME_DB.put(`state_${userId}`, 'waiting_desc');
    await sendButtons(chatId,
      `✅ Naam: *${name}*\n\n📋 *Step 3/9*\n\nAnime ka *description* likho:`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (data === 'reenter_name') {
    await ANIME_DB.put(`state_${userId}`, 'waiting_name');
    await sendButtons(chatId, '📝 Dobara *naam* likho:', [[{ text: '🛑 Stop', callback_data: 'stop' }]]);
    return;
  }

  if (data === 'confirm_desc') {
    await ANIME_DB.put(`state_${userId}`, 'waiting_type');
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
    return;
  }

  if (data === 'reenter_desc') {
    await ANIME_DB.put(`state_${userId}`, 'waiting_desc');
    await sendButtons(chatId, '📋 Dobara *description* likho:', [[{ text: '🛑 Stop', callback_data: 'stop' }]]);
    return;
  }

  if (data.startsWith('type_')) {
    const type = data.replace('type_', '');
    await ANIME_DB.put(`temp_type_${userId}`, type);
    await ANIME_DB.put(`state_${userId}`, 'waiting_year');
    await sendButtons(chatId,
      `✅ Type: *${type}*\n\n📅 *Step 4b/9*\n\nAnime ka *release year* likho:\n(jaise: 2024)`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (data.startsWith('age_')) {
    const age = data.replace('age_', '');
    await ANIME_DB.put(`temp_age_${userId}`, age);
    await ANIME_DB.put(`state_${userId}`, 'waiting_rating');
    await sendButtons(chatId,
      `✅ Age Rating: *${age}*\n\n⭐ *Step 5/9*\n\nAnime ki *rating* likho:\n(jaise: 4.7)`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (data === 'confirm_rating') {
    const rating = await ANIME_DB.get(`temp_rating_${userId}`);
    const reviews = await ANIME_DB.get(`temp_reviews_${userId}`);
    await ANIME_DB.put(`state_${userId}`, 'waiting_season');
    await sendButtons(chatId,
      `✅ Rating: *${rating}* (${reviews})\n\n🎬 *Step 6/9*\n\n*Season naam* likho:\n(jaise: S1: Demon Slayer)`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (data === 'reenter_rating') {
    await ANIME_DB.put(`state_${userId}`, 'waiting_rating');
    await sendButtons(chatId, '⭐ Dobara *rating* likho:', [[{ text: '🛑 Stop', callback_data: 'stop' }]]);
    return;
  }

  if (data === 'confirm_season') {
    const season = await ANIME_DB.get(`temp_season_${userId}`);
    await ANIME_DB.put(`state_${userId}`, 'waiting_epcount');
    await sendButtons(chatId,
      `✅ Season: *${season}*\n\n📺 *Step 7/9*\n\n*Kitne episodes* hain? (sirf number likho)`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (data === 'reenter_season') {
    await ANIME_DB.put(`state_${userId}`, 'waiting_season');
    await sendButtons(chatId, '🎬 Dobara *season naam* likho:', [[{ text: '🛑 Stop', callback_data: 'stop' }]]);
    return;
  }

  if (data === 'confirm_save') {
    await saveAnime(chatId, userId);
    return;
  }
}

async function handleAdminInput(chatId, userId, text, photo) {
  const state = await ANIME_DB.get(`state_${userId}`);
  if (!state) return;

  if (state === 'waiting_photo') {
    if (!photo) {
      await sendMessage(chatId, '❌ Photo bhejo! Text nahi.');
      return;
    }
    const fileId = photo[photo.length - 1].file_id;
    await ANIME_DB.put(`temp_photo_${userId}`, fileId);
    await ANIME_DB.put(`state_${userId}`, 'waiting_name');
    await sendPhotoWithButtons(chatId, fileId,
      '✅ Photo mil gayi!\n\n📝 *Step 2/9*\n\nAnime ka *naam* likho:',
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (state === 'waiting_name') {
    await ANIME_DB.put(`temp_name_${userId}`, text);
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

  if (state === 'waiting_desc') {
    await ANIME_DB.put(`temp_desc_${userId}`, text);
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

  if (state === 'waiting_year') {
    await ANIME_DB.put(`temp_year_${userId}`, text);
    await ANIME_DB.put(`state_${userId}`, 'waiting_age');
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

  if (state === 'waiting_rating') {
    if (isNaN(parseFloat(text))) {
      await sendMessage(chatId, '❌ Sirf number likho! Jaise: 4.7');
      return;
    }
    await ANIME_DB.put(`temp_rating_${userId}`, text);
    await ANIME_DB.put(`state_${userId}`, 'waiting_reviews');
    await sendButtons(chatId,
      `⭐ Rating: *${text}*\n\nAb *review count* likho:\n(jaise: 16.5K)`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (state === 'waiting_reviews') {
    await ANIME_DB.put(`temp_reviews_${userId}`, text);
    const rating = await ANIME_DB.get(`temp_rating_${userId}`);
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

  if (state === 'waiting_season') {
    await ANIME_DB.put(`temp_season_${userId}`, text);
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

  if (state === 'waiting_epcount') {
    const count = parseInt(text);
    if (isNaN(count) || count < 1) {
      await sendMessage(chatId, '❌ Sirf number likho! Jaise: 12');
      return;
    }
    await ANIME_DB.put(`temp_epcount_${userId}`, String(count));
    await ANIME_DB.put(`temp_epcurrent_${userId}`, '1');
    await ANIME_DB.put(`state_${userId}`, 'waiting_ep_name');
    await sendButtons(chatId,
      `✅ *${count}* episodes!\n\n📺 *Step 8/9*\n\n*Episode 1* ka naam likho:`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (state === 'waiting_ep_name') {
    const current = await ANIME_DB.get(`temp_epcurrent_${userId}`);
    await ANIME_DB.put(`temp_ep${current}_name_${userId}`, text);
    await ANIME_DB.put(`state_${userId}`, 'waiting_ep_link');
    await sendButtons(chatId,
      `Episode ${current} naam: *${text}*\n\nAb Episode ${current} ka *Telegram link* paste karo:\n_(Channel mein message pe tap → Copy Link)_`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (state === 'waiting_ep_link') {
    const current = parseInt(await ANIME_DB.get(`temp_epcurrent_${userId}`));
    const total = parseInt(await ANIME_DB.get(`temp_epcount_${userId}`));
    const messageId = extractMessageId(text);
    if (!messageId) {
      await sendMessage(chatId, '❌ Sahi Telegram link paste karo!\nJaise: https://t.me/c/1234567890/5');
      return;
    }
    await ANIME_DB.put(`temp_ep${current}_link_${userId}`, String(messageId));

    if (current < total) {
      await ANIME_DB.put(`temp_epcurrent_${userId}`, String(current + 1));
      await ANIME_DB.put(`state_${userId}`, 'waiting_ep_name');
      await sendButtons(chatId,
        `✅ Episode ${current} save!\n\n*Episode ${current + 1}* ka naam likho:`,
        [[{ text: '🛑 Stop', callback_data: 'stop' }]]
      );
    } else {
      const name = await ANIME_DB.get(`temp_name_${userId}`);
      const desc = await ANIME_DB.get(`temp_desc_${userId}`);
      const type = await ANIME_DB.get(`temp_type_${userId}`);
      const year = await ANIME_DB.get(`temp_year_${userId}`);
      const age = await ANIME_DB.get(`temp_age_${userId}`);
      const rating = await ANIME_DB.get(`temp_rating_${userId}`);
      const reviews = await ANIME_DB.get(`temp_reviews_${userId}`);
      const season = await ANIME_DB.get(`temp_season_${userId}`);

      let summary = `📋 *Final Summary:*\n\n`;
      summary += `🎌 *Naam:* ${name}\n`;
      summary += `📋 *Desc:* ${desc}\n`;
      summary += `🏷️ *Type:* ${type} | ${year} | ${age}\n`;
      summary += `⭐ *Rating:* ${rating} (${reviews})\n`;
      summary += `🎬 *Season:* ${season}\n`;
      summary += `📺 *Episodes:* ${total}\n\n`;
      for (let i = 1; i <= total; i++) {
        const epName = await ANIME_DB.get(`temp_ep${i}_name_${userId}`);
        summary += `EP${i}: ${epName}\n`;
      }
      summary += '\n*Save karein?*';

      await sendButtons(chatId, summary, [
        [
          { text: '✅ Save Karo', callback_data: 'confirm_save' },
          { text: '🛑 Cancel', callback_data: 'stop' }
        ]
      ]);
      await ANIME_DB.put(`state_${userId}`, 'waiting_final');
    }
    return;
  }
}

async function saveAnime(chatId, userId) {
  const name = await ANIME_DB.get(`temp_name_${userId}`);
  const desc = await ANIME_DB.get(`temp_desc_${userId}`);
  const photo = await ANIME_DB.get(`temp_photo_${userId}`);
  const type = await ANIME_DB.get(`temp_type_${userId}`);
  const year = await ANIME_DB.get(`temp_year_${userId}`);
  const age = await ANIME_DB.get(`temp_age_${userId}`);
  const rating = await ANIME_DB.get(`temp_rating_${userId}`);
  const reviews = await ANIME_DB.get(`temp_reviews_${userId}`);
  const season = await ANIME_DB.get(`temp_season_${userId}`);
  const total = parseInt(await ANIME_DB.get(`temp_epcount_${userId}`));
  const animeId = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();

  const episodes = [];
  for (let i = 1; i <= total; i++) {
    const epName = await ANIME_DB.get(`temp_ep${i}_name_${userId}`);
    const messageId = await ANIME_DB.get(`temp_ep${i}_link_${userId}`);
    const key = `${animeId}_ep${i}`;
    await ANIME_DB.put(key, JSON.stringify({ messageId: parseInt(messageId) }));
    episodes.push({ name: epName, key });
  }

  await ANIME_DB.put(`anime_${animeId}`, JSON.stringify({
    name, desc, photo, type, year, age, rating, reviews, season, episodes
  }));

  const listRaw = await ANIME_DB.get('anime_list');
  const list = listRaw ? JSON.parse(listRaw) : [];
  list.push({ id: animeId, name });
  await ANIME_DB.put('anime_list', JSON.stringify(list));

  await clearTemp(userId);
  await sendMessage(chatId, `🎉 *${name}* successfully save ho gaya!\n✅ ${total} episodes add ho gaye!`);
  await showAdminPanel(chatId);
}

function extractMessageId(link) {
  const match = link.match(/\/(\d+)$/);
  return match ? match[1] : null;
}

async function clearTemp(userId) {
  const keys = ['state','photo','name','desc','type','year','age','rating','reviews','season','epcount','epcurrent'];
  for (const k of keys) {
    await ANIME_DB.delete(`temp_${k}_${userId}`);
  }
  for (let i = 1; i <= 50; i++) {
    await ANIME_DB.delete(`temp_ep${i}_name_${userId}`);
    await ANIME_DB.delete(`temp_ep${i}_link_${userId}`);
  }
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
