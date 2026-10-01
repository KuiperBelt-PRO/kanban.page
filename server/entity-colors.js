'use strict';

const ENTITY_COLORS = [
  '#FFB454', '#7FD1AE', '#8FB8FF', '#F58FA8', '#C79BFF', '#6FD3E8', '#D6C36B', '#9AA5B8',
];

function colorByIndex(index) {
  const n = Number(index) || 0;
  return ENTITY_COLORS[((n % ENTITY_COLORS.length) + ENTITY_COLORS.length) % ENTITY_COLORS.length];
}

function colorByName(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return colorByIndex(Math.abs(h));
}

function normalizeHexColor(raw) {
  const s = String(raw || '').trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(s)) return null;
  return s.toUpperCase();
}

module.exports = {
  ENTITY_COLORS,
  colorByIndex,
  colorByName,
  normalizeHexColor,
};
