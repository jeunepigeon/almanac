// Formatage des dates et heures en français.

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

const DAYS_FR = [
  'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
];

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatDate(ts) {
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatTime(ts) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatDateTime(ts) {
  return `${formatDate(ts)} ${formatTime(ts)}`;
}

export function formatDateLong(ts) {
  const d = new Date(ts);
  return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(ts) {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
