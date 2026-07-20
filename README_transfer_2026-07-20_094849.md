# Rophys — Bot AI WhatsApp

Bot WhatsApp dengan persona **Rophys** (sang beruang hitam, kekasih Ekyy). Pairing nomor sender dilakukan lewat **halaman HTML** (`public/index.html`), dan begitu sender terhubung, bot otomatis aktif membalas chat sebagai Rophys — lengkap dengan fitur stiker dan moderasi grup.

> ⚠️ WhatsApp mengharuskan koneksi real-time lewat protokol WhatsApp Web (Baileys), jadi bot ini **butuh proses Node.js yang jalan terus** di server/PC kamu. Halaman HTML hanyalah tampilan untuk pairing & status — bukan aplikasi berdiri sendiri di browser.

## Fitur

- 💬 Chat AI dengan persona Rophys penuh (system prompt sesuai spesifikasi)
- 🔗 Pairing via halaman HTML: masukkan nomor → dapat kode pairing (atau scan QR kalau nomor dikosongkan)
- 🖼️ Stiker: `.sticker` / `.s` (reply ke gambar/video pendek)
- 🛡️ Moderasi grup: anti-link otomatis, welcome/leave message, `.kick` `.promote` `.demote` (khusus admin)
- 💾 Sesi tersimpan di folder `session/` — tidak perlu pairing ulang tiap restart

## Instalasi

```bash
npm install
cp .env.example .env
```

Edit `.env`, isi minimal:

```
AI_API_KEY=isi-api-key-llm-kamu
AI_BASE_URL=https://api.openai.com/v1   # atau endpoint OpenAI-compatible lain (OpenRouter, dll)
AI_MODEL=gpt-4o-mini
```

## Menjalankan

```bash
npm start
```

Buka `http://localhost:3000` (atau `http://IP-server:3000` kalau di VPS/panel), lalu:

1. Masukkan nomor WhatsApp sender (format `628xxxxxxxxxx`, tanpa `+`) → klik **Pairing**
2. Kode pairing muncul di halaman → buka WhatsApp di HP sender → **Perangkat Tertaut → Tautkan dengan nomor telepon** → masukkan kode
3. Setelah terhubung, halaman otomatis menampilkan status **Terhubung**, dan Rophys langsung aktif membalas chat masuk

Kalau nomor dikosongkan lalu tetap klik Pairing (atau field phone kosong), gunakan tombol pairing tanpa nomor untuk mode QR — scan QR yang muncul di halaman lewat **Tautkan Perangkat**.

## Struktur proyek

```
server.js              # Express server + endpoint pairing/status
public/index.html      # Halaman pairing (tema gothic Rophys)
src/persona.js         # System prompt Rophys
src/ai.js              # Pemanggil LLM + memori percakapan per chat
src/whatsapp.js         # Koneksi Baileys, routing pesan, command
src/sticker.js           # Konversi gambar/video → stiker WebP
src/webpExif.js          # Metadata pack/author stiker
src/moderation.js        # Anti-link, welcome/leave, kick/promote/demote
```

## Deploy di VPS / Pterodactyl

- Pastikan Node.js 18+ tersedia
- `npm install && npm start` (atau set start command panel ke `node server.js`)
- Buka port yang dipakai (`PORT` di `.env`, default 3000) supaya halaman pairing bisa diakses dari luar
- Simpan folder `session/` supaya login tidak hilang saat restart

## Catatan

- Command grup (`.kick`, `.promote`, `.demote`) hanya bisa dipakai admin grup, dan bot juga harus jadi admin di grup tersebut.
- Di dalam grup, Rophys hanya membalas kalau di-mention atau di-reply (biar tidak spam ke semua chat).
- Riwayat obrolan disimpan sementara di memori (hilang saat server restart) — cukup untuk menjaga konteks chat singkat.
