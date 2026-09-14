'use strict';

const crypto = require('crypto');

const CARD_ID_RE = /^kb[a-z0-9]{4,6}$/;
const CARD_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function entityId() {
  return crypto.randomUUID().replace(/-/g, '');
}

function generateCardId(db) {
  for (let attempt = 0; attempt < 200; attempt++) {
    let suffix = '';
    for (let i = 0; i < 4; i++) {
      suffix += CARD_CHARS[Math.floor(Math.random() * CARD_CHARS.length)];
    }
    const id = `kb${suffix}`;
    const exists = db.prepare('SELECT 1 AS n FROM cards WHERE id = ?').get(id);
    if (!exists) return id;
  }
  throw new Error('could not generate unique card id');
}

function isCardId(value) {
  return typeof value === 'string' && CARD_ID_RE.test(value);
}

module.exports = { entityId, generateCardId, isCardId, CARD_ID_RE };
