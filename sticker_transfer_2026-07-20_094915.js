'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const { addExif } = require('./webpExif');

ffmpeg.setFfmpegPath(ffmpegPath);

const PACK_NAME = 'Rophys';
const AUTHOR_NAME = 'Ekyy';

function tmpFile(ext) {
  return path.join(os.tmpdir(), `rophys-${crypto.randomBytes(6).toString('hex')}.${ext}`);
}

/**
 * Konversi buffer gambar menjadi stiker WebP (512x512, dengan metadata pack/author).
 */
async function imageToSticker(buffer) {
  const webp = await sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp()
    .toBuffer();
  return addExif(webp, PACK_NAME, AUTHOR_NAME);
}

/**
 * Konversi buffer video/GIF pendek (maks ~8 detik disarankan) menjadi stiker WebP animasi.
 */
function videoToSticker(buffer) {
  return new Promise((resolve, reject) => {
    const inPath = tmpFile('mp4');
    const outPath = tmpFile('webp');
    fs.writeFileSync(inPath, buffer);

    ffmpeg(inPath)
      .outputOptions([
        '-vcodec', 'libwebp',
        '-vf', "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=white@0.0",
        '-loop', '0',
        '-preset', 'default',
        '-an',
        '-vsync', '0',
        '-t', '8',
      ])
      .toFormat('webp')
      .save(outPath)
      .on('end', async () => {
        try {
          const raw = fs.readFileSync(outPath);
          const withExif = await addExif(raw, PACK_NAME, AUTHOR_NAME);
          resolve(withExif);
        } catch (e) {
          reject(e);
        } finally {
          fs.unlink(inPath, () => {});
          fs.unlink(outPath, () => {});
        }
      })
      .on('error', (err) => {
        fs.unlink(inPath, () => {});
        reject(err);
      });
  });
}

module.exports = { imageToSticker, videoToSticker };
