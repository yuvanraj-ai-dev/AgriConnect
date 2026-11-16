class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const route = (handler) => (req, res, next) =>
  Promise.resolve().then(() => handler(req, res, next)).catch(next);

function check(condition, status, message, details) {
  if (!condition) throw new HttpError(status, message, details);
}

function requiredText(value, field, max = 200) {
  check(typeof value === 'string' && value.trim() && value.trim().length <= max,
    400, field + ' is required and must be at most ' + max + ' characters.', { field });
  return value.trim();
}

function textFilter(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function whole(value, field, min = 1, max = 1000000) {
  check((typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) &&
    Number.isSafeInteger(Number(value)) && Number(value) >= min && Number(value) <= max,
  400, field + ' must be a whole number between ' + min + ' and ' + max + '.', { field });
  return Number(value);
}

function money(value, field, min = 1) {
  const raw = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  const amount = Math.round(Number(raw) * 100);
  check(/^\d+(\.\d{1,2})?$/.test(raw) && amount >= min && amount <= 2147483647,
    400, field + ' must be a valid INR amount with up to two decimal places.', { field });
  return amount;
}

const DAY = 86400000;
const indiaDay = (now = new Date()) => new Date(new Date(now.getTime() + 19800000).toISOString().slice(0, 10));
const indiaDayStart = (value) => new Date(indiaDay(value).getTime() - 19800000);

function dateOnly(value, field) {
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value) : null;
  check(parsed && !isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value),
    400, field + ' must be a valid date.', { field });
  return parsed;
}

function dateRange(input) {
  const startDate = dateOnly(input.startDate, 'Start date');
  const endDate = dateOnly(input.endDate, 'End date');
  check(startDate >= indiaDay(), 400, 'Start date must be today or later.');
  check(endDate >= startDate, 400, 'End date must be on or after the start date.');
  return { startDate, endDate };
}

function notify(client, userId, type, message) {
  return client.notification.create({ data: { userId, type, message, channel: 'IN_APP' } });
}

module.exports = { HttpError, route, check, requiredText, textFilter, whole, money, dateOnly, dateRange, DAY, indiaDay, indiaDayStart, notify };
