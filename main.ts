const BOT_TOKEN = '8635067603:AAGyKoPaZUgF5DyLSRXVBpayZ-Ll_NMrlkI';
const CHANNEL_ID = '-1004362743928';
const ADMIN_ID = 5840296032;

const kv = await Deno.openKv();

Deno.serve({ port: 8080 }, async (req) => {
  if (req.method === 'POST') {
    try {
      const update = await req.json();
      await processUpdate(update);
    } catch(e) {
      console.log('Error:', e);
    }
  }
  return new Response('OK');
});

async function processUpdate(update: any) {
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
    const epData = await kv.get(['ep', param]);
    if (!epData.value) {
      await sendMessage(chatId, '❌ Episode abhi available nahi hai.');
      return;
    }
    const ep = epData.value as any;
    await copyMessage(chatId, CHANNEL_ID, ep.messageId);
    return;
  }

  if (userId === ADMIN_ID) {
    await handleAdminInput(chatId, userId, text, photo);
  }
}

async function showAdminPanel(chatId: number) {
  await sendButtons(chatId,
    '🎌 *AnimeZone Admin Panel*\n\nKya karna chahte ho?',
    [
      [{ text: '➕ Naya Anime Add', callback_data: 'add_anime' }],
      [{ text: '📋 Anime List', callback_data: 'list_anime' }],
      [{ text: '🗑️ Anime Delete', callback_data: 'delete_anime' }],
    ]
  );
}

async function handleCallback(cb: any) {
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
    await kv.set(['state', userId], 'waiting_photo');
    await sendButtons(chatId,
      '📸 *Step 1/9*\n\nAnime ki *cover photo* bhejo:',
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (data === 'list_anime') {
    const list = await kv.get(['anime_list']);
    if (!list.value || (list.value as any[]).length === 0) {
      await sendMessage(chatId, '❌ Koi anime nahi hai abhi.');
    } else {
      const animes = list.value as any[];
      let msg = '📋 *Anime List:*\n\n';
      animes.forEach((a, i) => { msg += `${i+1}. ${a.name}\n`; });
      await sendMessage(chatId, msg);
    }
    await showAdminPanel(chatId);
    return;
  }

  if (data === 'delete_anime') {
    const list = await kv.get(['anime_list']);
    if (!list.value || (list.value as any[]).length === 0) {
      await sendMessage(chatId, '❌ Koi anime nahi hai.');
      await showAdminPanel(chatId);
      return;
    }
    const animes = list.value as any[];
    const buttons = animes.map((a: any) => [{ text: `🗑️ ${a.name}`, callback_data: `del_${a.id}` }]);
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
    const list = await kv.get(['anime_list']);
    let animes = list.value as any[];
    const anime = animes.find((a: any) => a.id === animeId);
    animes = animes.filter((a: any) => a.id !== animeId);
    await kv.set(['anime_list'], animes);
    await kv.delete(['anime', animeId]);
    await sendMessage(chatId, `✅ *${anime?.name}* delete ho gaya!`);
    await showAdminPanel(chatId);
    return;
  }

  if (data === 'back_panel') {
    await showAdminPanel(chatId);
    return;
  }

  if (data === 'confirm_name') {
    const name = await kv.get(['temp', userId, 'name']);
    await kv.set(['state', userId], 'waiting_desc');
    await sendButtons(chatId,
      `✅ Naam: *${name.value}*\n\n📋 *Step 3/9*\n\nAnime ka *description* likho:`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (data === 'reenter_name') {
    await kv.set(['state', userId], 'waiting_name');
    await sendButtons(chatId, '📝 Dobara *naam* likho:', [[{ text: '🛑 Stop', callback_data: 'stop' }]]);
    return;
  }

  if (data === 'confirm_desc') {
    await kv.set(['state', userId], 'waiting_type');
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
    await kv.set(['state', userId], 'waiting_desc');
    await sendButtons(chatId, '📋 Dobara *description* likho:', [[{ text: '🛑 Stop', callback_data: 'stop' }]]);
    return;
  }

  if (data.startsWith('type_')) {
    const type = data.replace('type_', '');
    await kv.set(['temp', userId, 'type'], type);
    await kv.set(['state', userId], 'waiting_year');
    await sendButtons(chatId,
      `✅ Type: *${type}*\n\n📅 *Step 4b/9*\n\nAnime ka *release year* likho:`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (data.startsWith('age_')) {
    const age = data.replace('age_', '');
    await kv.set(['temp', userId, 'age'], age);
    await kv.set(['state', userId], 'waiting_rating');
    await sendButtons(chatId,
      `✅ Age Rating: *${age}*\n\n⭐ *Step 5/9*\n\nAnime ki *rating* likho:\n(jaise: 4.7)`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (data === 'confirm_rating') {
    const rating = await kv.get(['temp', userId, 'rating']);
    const reviews = await kv.get(['temp', userId, 'reviews']);
    await kv.set(['state', userId], 'waiting_season');
    await sendButtons(chatId,
      `✅ Rating: *${rating.value}* (${reviews.value})\n\n🎬 *Step 6/9*\n\n*Season naam* likho:`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (data === 'reenter_rating') {
    await kv.set(['state', userId], 'waiting_rating');
    await sendButtons(chatId, '⭐ Dobara *rating* likho:', [[{ text: '🛑 Stop', callback_data: 'stop' }]]);
    return;
  }

  if (data === 'confirm_season') {
    const season = await kv.get(['temp', userId, 'season']);
    await kv.set(['state', userId], 'waiting_epcount');
    await sendButtons(chatId,
      `✅ Season: *${season.value}*\n\n📺 *Step 7/9*\n\n*Kitne episodes* hain?`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (data === 'reenter_season') {
    await kv.set(['state', userId], 'waiting_season');
    await sendButtons(chatId, '🎬 Dobara *season naam* likho:', [[{ text: '🛑 Stop', callback_data: 'stop' }]]);
    return;
  }

  if (data === 'confirm_save') {
    await saveAnime(chatId, userId);
    return;
  }
}

async function handleAdminInput(chatId: number, userId: number, text: string, photo: any) {
  const stateRes = await kv.get(['state', userId]);
  const state = stateRes.value as string;
  if (!state) return;

  if (state === 'waiting_photo') {
    if (!photo) {
      await sendMessage(chatId, '❌ Photo bhejo! Text nahi.');
      return;
    }
    const fileId = photo[photo.length - 1].file_id;
    await kv.set(['temp', userId, 'photo'], fileId);
    await kv.set(['state', userId], 'waiting_name');
    await sendPhotoWithButtons(chatId, fileId,
      '✅ Photo mil gayi!\n\n📝 *Step 2/9*\n\nAnime ka *naam* likho:',
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (state === 'waiting_name') {
    await kv.set(['temp', userId, 'name'], text);
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
    await kv.set(['temp', userId, 'desc'], text);
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
    await kv.set(['temp', userId, 'year'], text);
    await kv.set(['state', userId], 'waiting_age');
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
    await kv.set(['temp', userId, 'rating'], text);
    await kv.set(['state', userId], 'waiting_reviews');
    await sendButtons(chatId,
      `⭐ Rating: *${text}*\n\nAb *review count* likho:\n(jaise: 16.5K)`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (state === 'waiting_reviews') {
    await kv.set(['temp', userId, 'reviews'], text);
    const rating = await kv.get(['temp', userId, 'rating']);
    await sendButtons(chatId,
      `Rating: *${rating.value}* ⭐\nReviews: *${text}*\n\nSahi hai?`,
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
    await kv.set(['temp', userId, 'season'], text);
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
    await kv.set(['temp', userId, 'epcount'], count);
    await kv.set(['temp', userId, 'epcurrent'], 1);
    await kv.set(['state', userId], 'waiting_ep_name');
    await sendButtons(chatId,
      `✅ *${count}* episodes!\n\n📺 *Step 8/9*\n\n*Episode 1* ka naam likho:`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (state === 'waiting_ep_name') {
    const currentRes = await kv.get(['temp', userId, 'epcurrent']);
    const current = currentRes.value as number;
    await kv.set(['temp', userId, `ep${current}_name`], text);
    await kv.set(['state', userId], 'waiting_ep_link');
    await sendButtons(chatId,
      `Episode ${current} naam: *${text}*\n\nAb Episode ${current} ka *Telegram link* paste karo:`,
      [[{ text: '🛑 Stop', callback_data: 'stop' }]]
    );
    return;
  }

  if (state === 'waiting_ep_link') {
    const currentRes = await kv.get(['temp', userId, 'epcurrent']);
    const totalRes = await kv.get(['temp', userId, 'epcount']);
    const current = currentRes.value as number;
    const total = totalRes.value as number;
    const messageId = extractMessageId(text);
    if (!messageId) {
      await sendMessage(chatId, '❌ Sahi Telegram link paste karo!\nJaise: https://t.me/c/1234567890/5');
      return;
    }
    await kv.set(['temp', userId, `ep${current}_link`], messageId);

    if (current < total) {
      await kv.set(['temp', userId, 'epcurrent'], current + 1);
      await kv.set(['state', userId], 'waiting_ep_name');
      await sendButtons(chatId,
        `✅ Episode ${current} save!\n\n*Episode ${current + 1}* ka naam likho:`,
        [[{ text: '🛑 Stop', callback_data: 'stop' }]]
      );
    } else {
      const name = await kv.get(['temp', userId, 'name']);
      const desc = await kv.get(['temp', userId, 'desc']);
      const type = await kv.get(['temp', userId, 'type']);
      const year = await kv.get(['temp', userId, 'year']);
      const age = await kv.get(['temp', userId, 'age']);
      const rating = await kv.get(['temp', userId, 'rating']);
      const reviews = await kv.get(['temp', userId, 'reviews']);
      const season = await kv.get(['temp', userId, 'season']);

      let summary = `📋 *Final Summary:*\n\n`;
      summary += `🎌 *Naam:* ${name.value}\n`;
      summary += `📋 *Desc:* ${desc.value}\n`;
      summary += `🏷️ *Type:* ${type.value} | ${year.value} | ${age.value}\n`;
      summary += `⭐ *Rating:* ${rating.value} (${reviews.value})\n`;
      summary += `🎬 *Season:* ${season.value}\n`;
      summary += `📺 *Episodes:* ${total}\n\n`;
      for (let i = 1; i <= total; i++) {
        const epName = await kv.get(['temp', userId, `ep${i}_name`]);
        summary += `EP${i}: ${epName.value}\n`;
      }
      summary += '\n*Save karein?*';

      await sendButtons(chatId, summary, [
        [
          { text: '✅ Save Karo', callback_data: 'confirm_save' },
          { text: '🛑 Cancel', callback_data: 'stop' }
        ]
      ]);
      await kv.set(['state', userId], 'waiting_final');
    }
    return;
  }
}

async function saveAnime(chatId: number, userId: number) {
  const name = (await kv.get(['temp', userId, 'name'])).value as string;
  const desc = (await kv.get(['temp', userId, 'desc'])).value as string;
  const photo = (await kv.get(['temp', userId, 'photo'])).value as string;
  const type = (await kv.get(['temp', userId, 'type'])).value as string;
  const year = (await kv.get(['temp', userId, 'year'])).value as string;
  const age = (await kv.get(['temp', userId, 'age'])).value as string;
  const rating = (await kv.get(['temp', userId, 'rating'])).value as string;
  const reviews = (await kv.get(['temp', userId, 'reviews'])).value as string;
  const season = (await kv.get(['temp', userId, 'season'])).value as string;
  const total = (await kv.get(['temp', userId, 'epcount'])).value as number;
  const animeId = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now();

  const episodes = [];
  for (let i = 1; i <= total; i++) {
    const epName = (await kv.get(['temp', userId, `ep${i}_name`])).value as string;
    const messageId = (await kv.get(['temp', userId, `ep${i}_link`])).value as string;
    const key = `${animeId}_ep${i}`;
    await kv.set(['ep', key], { messageId: parseInt(messageId) });
    episodes.push({ name: epName, key });
  }

  await kv.set(['anime', animeId], { name, desc, photo, type, year, age, rating, reviews, season, episodes });

  const listRes = await kv.get(['anime_list']);
  const list = (listRes.value as any[]) || [];
  list.push({ id: animeId, name });
  await kv.set(['anime_list'], list);

  await clearTemp(userId, total);
  await sendMessage(chatId, `🎉 *${name}* successfully save ho gaya!\n✅ ${total} episodes add ho gaye!`);
  await showAdminPanel(chatId);
}

function extractMessageId(link: string): string | null {
  const match = link.match(/\/(\d+)$/);
  return match ? match[1] : null;
}

async function clearTemp(userId: number, epCount: number = 50) {
  const keys = ['state','photo','name','desc','type','year','age','rating','reviews','season','epcount','epcurrent'];
  for (const k of keys) {
    await kv.delete(['temp', userId, k]);
  }
  for (let i = 1; i <= epCount; i++) {
    await kv.delete(['temp', userId, `ep${i}_name`]);
    await kv.delete(['temp', userId, `ep${i}_link`]);
  }
}

async function sendMessage(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
}

async function sendButtons(chatId: number, text: string, buttons: any[]) {
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

async function sendPhotoWithButtons(chatId: number, fileId: string, caption: string, buttons: any[]) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId, photo: fileId, caption,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons }
    })
  });
}

async function answerCallback(callbackId: string) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId })
  });
}

async function copyMessage(chatId: number, fromChatId: string, messageId: number) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, from_chat_id: fromChatId, message_id: messageId })
  });
      }
