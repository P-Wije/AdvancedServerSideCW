function isoNow() {
  return new Date().toISOString();
}

function toDateOnly(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function monthKey(date) {
  return toDateOnly(date).slice(0, 7);
}

function monthBounds(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return {
    start: toDateOnly(start),
    end: toDateOnly(end),
  };
}

module.exports = {
  addDays,
  isoNow,
  monthBounds,
  monthKey,
  toDateOnly,
};
