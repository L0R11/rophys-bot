'use strict';

const OpenAI = require('openai');
const { ROPHYS_SYSTEM_PROMPT } = require('./persona');

const client = new OpenAI({
  apiKey: process.env.AI_API_KEY,
  baseURL: process.env.AI_BASE_URL || undefined,
});

const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const MAX_HISTORY = 12; // jumlah pesan (user+assistant) yang disimpan per chat

// Riwayat obrolan per chat, biar Rophys "inget" percakapan sebelumnya.
// Map<chatId, {role, content}[]>
const history = new Map();

function getHistory(chatId) {
  if (!history.has(chatId)) history.set(chatId, []);
  return history.get(chatId);
}

function pushHistory(chatId, role, content) {
  const h = getHistory(chatId);
  h.push({ role, content });
  while (h.length > MAX_HISTORY) h.shift();
}

/**
 * Minta balasan dari Rophys untuk sebuah chat.
 * @param {string} chatId - id unik chat/kontak WhatsApp
 * @param {string} userText - pesan masuk dari user
 * @returns {Promise<string>}
 */
async function askRophys(chatId, userText) {
  pushHistory(chatId, 'user', userText);

  const messages = [
    { role: 'system', content: ROPHYS_SYSTEM_PROMPT },
    ...getHistory(chatId),
  ];

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.9,
      max_tokens: 300,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      'Hmm, Rophys lagi bingung mau jawab apa 😣';

    pushHistory(chatId, 'assistant', reply);
    return reply;
  } catch (err) {
    console.error('[ai] gagal minta balasan:', err.message);
    return 'Duh, koneksi aku lagi gangguan nih 😣 coba chat lagi bentar ya sayang.';
  }
}

function resetHistory(chatId) {
  history.delete(chatId);
}

module.exports = { askRophys, resetHistory };
