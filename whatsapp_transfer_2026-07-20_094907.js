'use strict';

const path = require('path');
const { EventEmitter } = require('events');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} = require('baileys');
const { Boom } = require('@hapi/boom');

const { askRophys } = require('./ai');
const { FIRST_MESSAGE } = require('./persona');
const { imageToSticker, videoToSticker } = require('./sticker');
const { handleAntilink, registerWelcomeHandler, handleAdminCommand } = require('./moderation');

const SESSION_DIR = path.join(__dirname, '..', 'session');
const PREFIX = process.env.PREFIX || '.';

class WhatsAppManager extends EventEmitter {
  constructor() {
    super();
    this.sock = null;
    this.status = 'disconnected'; // disconnected | connecting | qr | connected
    this.qr = null;
    this.pairingCode = null;
    this.userInfo = null;
    this.seenChats = new Set(); // buat kirim pesan pembuka sekali per chat
  }

  async start(phoneNumber) {
    if (this.status === 'connecting' || this.status === 'connected') return;
    this.status = 'connecting';
    this.emit('status', this.status);

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      browser: ['Rophys', 'Chrome', '1.0.0'],
    });

    this.sock = sock;
    registerWelcomeHandler(sock);

    // Kalau user kasih nomor & belum terdaftar creds, minta pairing code (tanpa QR).
    if (phoneNumber && !state.creds.registered) {
      try {
        const code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
        this.pairingCode = code;
        this.status = 'pairing';
        this.emit('status', this.status);
        this.emit('pairingCode', code);
      } catch (e) {
        this.status = 'disconnected';
        this.emit('status', this.status);
        this.emit('error', e.message);
        return;
      }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !phoneNumber) {
        this.qr = qr;
        this.status = 'qr';
        this.emit('status', this.status);
        this.emit('qr', qr);
      }

      if (connection === 'open') {
        this.status = 'connected';
        this.qr = null;
        this.pairingCode = null;
        this.userInfo = sock.user;
        this.emit('status', this.status);
        this.emit('connected', sock.user);
      }

      if (connection === 'close') {
        const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        this.status = 'disconnected';
        this.emit('status', this.status);
        this.emit('disconnected', { loggedOut });

        if (!loggedOut) {
          // reconnect otomatis kecuali memang logout manual
          setTimeout(() => this.start(), 3000);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        this.handleMessage(msg).catch((e) => console.error('[wa] handleMessage error:', e));
      }
    });
  }

  async handleMessage(msg) {
    const sock = this.sock;
    if (!msg.message || msg.key.fromMe) return;

    const chatId = msg.key.remoteJid;
    if (chatId === 'status@broadcast') return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      '';

    const isCommand = text.startsWith(PREFIX);
    const [rawCmd, ...args] = isCommand ? text.slice(PREFIX.length).trim().split(/\s+/) : [];
    const command = rawCmd?.toLowerCase();

    // --- Command: sticker ---
    if (isCommand && (command === 'sticker' || command === 's')) {
      if (process.env.FEATURE_STICKER !== 'true') return;
      const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
      const target = quoted
        ? { message: quoted, key: { ...msg.key, id: msg.message.extendedTextMessage.contextInfo.stanzaId } }
        : msg;

      const isImage = !!target.message?.imageMessage;
      const isVideo = !!target.message?.videoMessage;

      if (!isImage && !isVideo) {
        await sock.sendMessage(chatId, { text: 'Reply atau kirim gambar/video pendek dulu ya, baru pake .sticker 🖤' }, { quoted: msg });
        return;
      }

      try {
        const buffer = await downloadMediaMessage(target, 'buffer', {});
        const webp = isImage ? await imageToSticker(buffer) : await videoToSticker(buffer);
        await sock.sendMessage(chatId, { sticker: webp }, { quoted: msg });
      } catch (e) {
        console.error('[sticker] gagal bikin stiker:', e.message);
        await sock.sendMessage(chatId, { text: 'Duh gagal bikin stikernya, coba file lain ya 😣' }, { quoted: msg });
      }
      return;
    }

    // --- Command: admin (kick/promote/demote) ---
    if (isCommand && ['kick', 'promote', 'demote'].includes(command)) {
      const handled = await handleAdminCommand(sock, msg, command, args);
      if (handled) return;
    }

    // --- Anti-link (grup) ---
    const deleted = await handleAntilink(sock, msg, text);
    if (deleted) return;

    if (!text.trim()) return;

    // Grup: cuma balas kalau di-mention atau reply ke bot (biar gak spam)
    if (chatId.endsWith('@g.us')) {
      const mentions = msg.message.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const botJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
      const isMentioned = mentions.includes(botJid);
      const isReplyToBot = msg.message.extendedTextMessage?.contextInfo?.participant?.split(':')[0] + '@s.whatsapp.net' === botJid;
      if (!isMentioned && !isReplyToBot) return;
    }

    await sock.sendPresenceUpdate('composing', chatId);
    const reply = await askRophys(chatId, text);
    await sock.sendMessage(chatId, { text: reply }, { quoted: msg });
  }

  getState() {
    return {
      status: this.status,
      qr: this.qr,
      pairingCode: this.pairingCode,
      user: this.userInfo,
    };
  }
}

module.exports = new WhatsAppManager();
