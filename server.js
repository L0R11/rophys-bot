'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const wa = require('./src/whatsapp');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

// Mulai koneksi WA otomatis kalau sudah pernah login sebelumnya (creds tersimpan)
wa.start().catch((e) => console.error('[server] gagal auto-start:', e.message));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Minta pairing code untuk nomor WhatsApp tertentu
app.post('/api/pair', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^\d{8,15}$/.test(phone.replace(/[^0-9]/g, ''))) {
    return res.status(400).json({ error: 'Nomor tidak valid. Format: kode negara + nomor, contoh 6281234567890' });
  }
  try {
    await wa.start(phone);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Status koneksi saat ini (dipakai halaman HTML buat polling)
app.get('/api/status', async (_req, res) => {
  const state = wa.getState();
  let qrDataUrl = null;
  if (state.qr) {
    qrDataUrl = await QRCode.toDataURL(state.qr);
  }
  res.json({
    status: state.status,
    pairingCode: state.pairingCode,
    qr: qrDataUrl,
    user: state.user ? { name: state.user.name, id: state.user.id } : null,
  });
});

// Logout / reset sesi
app.post('/api/logout', async (_req, res) => {
  try {
    if (wa.sock) await wa.sock.logout();
  } catch (_e) {
    // abaikan; kita tetap reset state
  }
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`🖤 Rophys bot dashboard jalan di http://localhost:${PORT}`);
});
