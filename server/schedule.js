'use strict';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function isYmd(value) {
  return YMD_RE.test(String(value || ''));
}

function parseScheduleField(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  if (!isYmd(s)) throw new Error('invalid date format');
  return s;
}

function validateSchedule(start, end) {
  if (start != null && start !== '' && !isYmd(start)) return { ok: false, code: 'invalid_format' };
  if (end != null && end !== '' && !isYmd(end)) return { ok: false, code: 'invalid_format' };
  const s = start || null;
  const e = end || null;
  if (s && e && s > e) return { ok: false, code: 'invalid_range' };
  return { ok: true, schedule_start_date: s, schedule_end_date: e };
}

function resolveScheduleFields(card, fields) {
  const start = fields.schedule_start_date !== undefined
    ? parseScheduleField(fields.schedule_start_date)
    : (card.schedule_start_date || null);
  const end = fields.schedule_end_date !== undefined
    ? parseScheduleField(fields.schedule_end_date)
    : (card.schedule_end_date || null);
  const check = validateSchedule(start, end);
  if (!check.ok) throw new Error(check.code === 'invalid_range' ? 'end date must be on or after start date' : 'invalid date format');
  return { schedule_start_date: start, schedule_end_date: end };
}

module.exports = {
  isYmd,
  parseScheduleField,
  validateSchedule,
  resolveScheduleFields,
};
