// Format condensé en cascade pour le compteur "temps depuis dernière conso".
// Mots complets sauf "s" (secondes) et "min" (minutes).
//   < 1 min  -> "47 s"
//   < 1 h    -> "12 min 47 s"
//   < 1 j    -> "3 heures 12 min"
//   < 1 mois -> "5 jours 3 heures"
//   < 1 an   -> "2 mois 5 jours"
//   >= 1 an  -> "1 an 2 mois" / "2 ans 5 mois"

const MS_PER_SEC = 1000;
const MS_PER_MIN = 60 * MS_PER_SEC;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const MS_PER_MONTH = 30.4375 * MS_PER_DAY;
const MS_PER_YEAR = 365.25 * MS_PER_DAY;

function plural(n, singular, plural) {
  return `${n} ${n > 1 ? plural : singular}`;
}

export function formatDurationSince(timestamp, now = Date.now()) {
  if (!timestamp) return '—';
  const diff = Math.max(0, now - timestamp);

  if (diff < MS_PER_MIN) {
    const s = Math.floor(diff / MS_PER_SEC);
    return `${s} s`;
  }

  if (diff < MS_PER_HOUR) {
    const m = Math.floor(diff / MS_PER_MIN);
    const s = Math.floor((diff % MS_PER_MIN) / MS_PER_SEC);
    return `${m} min ${s} s`;
  }

  if (diff < MS_PER_DAY) {
    const h = Math.floor(diff / MS_PER_HOUR);
    const m = Math.floor((diff % MS_PER_HOUR) / MS_PER_MIN);
    return `${plural(h, 'heure', 'heures')} ${m} min`;
  }

  if (diff < MS_PER_MONTH) {
    const d = Math.floor(diff / MS_PER_DAY);
    const h = Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR);
    return `${plural(d, 'jour', 'jours')} ${plural(h, 'heure', 'heures')}`;
  }

  if (diff < MS_PER_YEAR) {
    const months = Math.floor(diff / MS_PER_MONTH);
    const remainAfterMonths = diff - months * MS_PER_MONTH;
    const d = Math.floor(remainAfterMonths / MS_PER_DAY);
    return `${months} mois ${plural(d, 'jour', 'jours')}`;
  }

  const years = Math.floor(diff / MS_PER_YEAR);
  const remainAfterYears = diff - years * MS_PER_YEAR;
  const months = Math.floor(remainAfterYears / MS_PER_MONTH);
  return `${plural(years, 'an', 'ans')} ${months} mois`;
}

// Tick toutes les secondes < 1 jour, sinon par minute
export function getTickInterval(timestamp, now = Date.now()) {
  if (!timestamp) return 60_000;
  const diff = now - timestamp;
  if (diff < MS_PER_DAY) return 1_000;
  return 60_000;
}
