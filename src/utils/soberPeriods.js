// Périodes de sobriété (1.40) : temps EXACT entre deux prises consécutives.
//  - précédente : entre l'avant-dernière et la dernière prise ;
//  - plus longue : le plus grand écart de tout l'historique ; si la période en cours le dépasse,
//    c'est elle (« en cours », identique au compteur principal).
// timestamps : n'importe quel ordre.
export function soberPeriods(timestamps) {
  const ts = (timestamps || []).filter(Boolean).slice().sort((a, b) => a - b);
  const n = ts.length;
  if (n === 0) return { last: null, prev: null, pastRecord: null };
  const prev = n >= 2 ? { start: ts[n - 2], end: ts[n - 1] } : null;
  let pastRecord = null;
  for (let i = 1; i < n; i++) {
    const d = ts[i] - ts[i - 1];
    if (!pastRecord || d > pastRecord.end - pastRecord.start) pastRecord = { start: ts[i - 1], end: ts[i] };
  }
  return { last: ts[n - 1], prev, pastRecord };
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export function shortDateFR(ts, withYear) {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;
}
// « du 3 sept. au 21 oct. » — l'année n'apparaît que si une des dates n'est pas de cette année
export function rangeFR(start, end) {
  const y = new Date().getFullYear();
  const withYear = new Date(start).getFullYear() !== y || (end != null && new Date(end).getFullYear() !== y);
  if (end == null) return `depuis le ${shortDateFR(start, withYear)}`;
  return `du ${shortDateFR(start, withYear)} au ${shortDateFR(end, withYear)}`;
}
