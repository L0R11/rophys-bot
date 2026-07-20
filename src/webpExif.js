'use strict';

const webpmux = require('node-webpmux');

/**
 * Tempel metadata EXIF (nama pack & author) ke buffer WebP supaya muncul
 * dengan benar sebagai stiker WhatsApp.
 */
async function addExif(webpBuffer, packName, authorName) {
  const img = new webpmux.Image();
  await img.load(webpBuffer);

  const json = {
    'sticker-pack-id': `rophys-${Date.now()}`,
    'sticker-pack-name': packName,
    'sticker-pack-publisher': authorName,
    emojis: ['🖤'],
  };

  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  exifAttr.writeUIntLE(jsonBuffer.length, 14, 4);
  const exif = Buffer.concat([exifAttr, jsonBuffer]);

  img.exif = exif;
  return img.save(null);
}

module.exports = { addExif };
