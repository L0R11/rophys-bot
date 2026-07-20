'use strict';

const LINK_REGEX = /(https?:\/\/|www\.|chat\.whatsapp\.com)/i;

/**
 * Cek apakah pengirim adalah admin grup.
 */
async function isSenderAdmin(sock, groupId, senderJid) {
  try {
    const meta = await sock.groupMetadata(groupId);
    const participant = meta.participants.find((p) => p.id === senderJid);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
  } catch {
    return false;
  }
}

async function isBotAdmin(sock, groupId) {
  const meta = await sock.groupMetadata(groupId);
  const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
  const participant = meta.participants.find((p) => p.id.split(':')[0] + '@s.whatsapp.net' === botJid);
  return participant?.admin === 'admin' || participant?.admin === 'superadmin';
}

/**
 * Fitur anti-link: hapus pesan berisi link grup/undangan dan tandai pelanggaran.
 * Hanya aktif untuk member biasa (bukan admin), dan hanya kalau bot adalah admin.
 */
async function handleAntilink(sock, msg, text) {
  if (process.env.FEATURE_ANTILINK !== 'true') return false;
  const chatId = msg.key.remoteJid;
  if (!chatId.endsWith('@g.us')) return false;
  if (!LINK_REGEX.test(text)) return false;

  const sender = msg.key.participant || msg.key.remoteJid;
  const senderIsAdmin = await isSenderAdmin(sock, chatId, sender);
  if (senderIsAdmin) return false;

  const botIsAdmin = await isBotAdmin(sock, chatId).catch(() => false);
  if (!botIsAdmin) return false;

  try {
    await sock.sendMessage(chatId, { delete: msg.key });
    await sock.sendMessage(chatId, {
      text: `Eh, jangan share link sembarangan di sini ya 🖤 aku hapus dulu pesannya @${sender.split('@')[0]}`,
      mentions: [sender],
    });
  } catch (e) {
    console.error('[moderation] gagal hapus pesan antilink:', e.message);
  }
  return true;
}

/**
 * Kirim pesan selamat datang / perpisahan saat ada member masuk/keluar grup.
 */
function registerWelcomeHandler(sock) {
  if (process.env.FEATURE_WELCOME !== 'true') return;

  sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
    try {
      for (const jid of participants) {
        const name = '@' + jid.split('@')[0];
        if (action === 'add') {
          await sock.sendMessage(id, {
            text: `Hai ${name}! 🖤 selamat datang di grup, aku Rophys, salam kenal ya~`,
            mentions: [jid],
          });
        } else if (action === 'remove') {
          await sock.sendMessage(id, {
            text: `${name} udah pergi... yaudah deh, semoga betah di tempat baru 😔`,
            mentions: [jid],
          });
        }
      }
    } catch (e) {
      console.error('[moderation] gagal kirim welcome/leave:', e.message);
    }
  });
}

/**
 * Command admin: .kick / .promote / .demote (reply atau mention target).
 * Return true kalau command tertangani (biar tidak diteruskan ke AI).
 */
async function handleAdminCommand(sock, msg, command, args) {
  if (process.env.FEATURE_MODERATION !== 'true') return false;
  const chatId = msg.key.remoteJid;
  if (!chatId.endsWith('@g.us')) return false;
  if (!['kick', 'promote', 'demote'].includes(command)) return false;

  const sender = msg.key.participant || msg.key.remoteJid;
  const senderIsAdmin = await isSenderAdmin(sock, chatId, sender);
  if (!senderIsAdmin) {
    await sock.sendMessage(chatId, { text: 'Hmm, kamu bukan admin, gak bisa pake command ini 😏' }, { quoted: msg });
    return true;
  }

  const mentioned =
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
    (msg.message?.extendedTextMessage?.contextInfo?.participant
      ? [msg.message.extendedTextMessage.contextInfo.participant]
      : []);

  if (mentioned.length === 0) {
    await sock.sendMessage(chatId, { text: 'Tag atau reply orangnya dulu dong sayang 🖤' }, { quoted: msg });
    return true;
  }

  const action = command === 'kick' ? 'remove' : command === 'promote' ? 'promote' : 'demote';

  try {
    await sock.groupParticipantsUpdate(chatId, mentioned, action);
    await sock.sendMessage(chatId, { text: 'Beres~ udah aku proses ya 🖤' }, { quoted: msg });
  } catch (e) {
    await sock.sendMessage(chatId, { text: 'Gagal nih, mungkin aku belum jadi admin di grup ini 😣' }, { quoted: msg });
  }
  return true;
}

module.exports = { handleAntilink, registerWelcomeHandler, handleAdminCommand };
