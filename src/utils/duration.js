// Format adaptatif de durée pour le compteur "temps depuis dernière conso".
// Mots complets, pluriels corrects.
//
// Règles :
//   < 1 min  -> "45 s"
//   < 1 h    -> "2 min" ou "2 min 30 s"
//   < 1 j    -> "3 heures 12 min"
//   < 1 mois -> "5 jours 3 heures"
//   < 1 an   -> "1 mois 12 jours" (toujours jours, même à 0)
//   >= 1 an  -> "1 an 2 mois 3 jours" / "1 an 0 jours" / "1 an 5 mois 0 jours"
//   On skip uniquement les niveaux intermédiaires à 0 (mois si 0 et année > 0)
//   Le niveau "jours" est toujours affiché dès qu'il y a au moins un mois ou une année.

const MS_PER_SEC = 1000;
const MS_PER_MIN = 60 * MS_PER_SEC;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;
// Approximations : 1 mois = 30.4375 jours (365.25/12), 1 an = 365.25 jours.
const MS_PER_MONTH = 30.4375 * MS_PER_DAY;
const MS_PER_YEAR = 365.25 * MS_PER_DAY;

function plural(n, sg, pl) {
  return `${n} ${n > 1 ? pl : sg}`;
}

export function formatDurationSince(timestamp, now = Date.now()) {
  if (!timestamp) return '—';
  const diff = Math.max(0, now - timestamp);

  // < 1 minute : juste les secondes
  if (diff < MS_PER_MIN) {
    const s = Math.floor(diff / MS_PER_SEC);
    return `${s} s`;
  }

  // < 1 heure : minutes (+ secondes si > 0)
  if (diff < MS_PER_HOUR) {
    const m = Math.floor(diff / MS_PER_MIN);
    const s = Math.floor((diff % MS_PER_MIN) / MS_PER_SEC);
    if (s > 0) return `${m} min ${s} s`;
    return `${m} min`;
  }

  // < 1 jour : heures + minutes (toujours afficher minutes même à 0)
  if (diff < MS_PER_DAY) {
    const h = Math.floor(diff / MS_PER_HOUR);
    const m = Math.floor((diff % MS_PER_HOUR) / MS_PER_MIN);
    return `${plural(h, 'heure', 'heures')} ${m} min`;
  }

  // < 1 mois : jours + heures (toujours afficher heures même à 0)
  if (diff < MS_PER_MONTH) {
    const d = Math.floor(diff / MS_PER_DAY);
    const h = Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR);
    return `${plural(d, 'jour', 'jours')} ${plural(h, 'heure', 'heures')}`;
  }

  // < 1 an : mois + jours (toujours afficher jours même à 0)
  if (diff < MS_PER_YEAR) {
    const months = Math.floor(diff / MS_PER_MONTH);
    const remAfterMonths = diff - months * MS_PER_MONTH;
    const d = Math.floor(remAfterMonths / MS_PER_DAY);
    return `${months} mois ${plural(d, 'jour', 'jours')}`;
  }

  // >= 1 an : adaptatif
  const years = Math.floor(diff / MS_PER_YEAR);
  const remAfterYears = diff - years * MS_PER_YEAR;
  const months = Math.floor(remAfterYears / MS_PER_MONTH);
  const remAfterMonths = remAfterYears - months * MS_PER_MONTH;
  const d = Math.floor(remAfterMonths / MS_PER_DAY);

  const yearsStr = plural(years, 'an', 'ans');
  const daysStr = plural(d, 'jour', 'jours');

  if (months > 0) {
    // 1 an 5 mois 3 jours / 1 an 5 mois 0 jours
    return `${yearsStr} ${months} mois ${daysStr}`;
  }
  // 1 an 0 jours / 1 an 12 jours (skip mois à 0)
  return `${yearsStr} ${daysStr}`;
}

// Tick toutes les secondes < 1 jour, sinon par minute
export function getTickInterval(timestamp, now = Date.now()) {
  if (!timestamp) return 60_000;
  const diff = now - timestamp;
  if (diff < MS_PER_DAY) return 1_000;
  return 60_000;
}
