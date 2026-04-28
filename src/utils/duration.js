// Format condensé en cascade pour le compteur "temps depuis dernière conso".
// Affiche uniquement les unités utiles, en cascade :
//   < 1 min  -> "47s"
//   < 1 h    -> "12m 47s"
//   < 1 j    -> "3h 12m 47s"
//   < 1 mois -> "5j 3h 12m"
//   < 1 an   -> "2mois 5j 3h"
//   >= 1 an  -> "1a 2mois 5j"

const MS_PER_SEC = 1000;
const MS_PER_MIN = 60 * MS_PER_SEC;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;
// Approximations : 1 mois = 30.4375 jours (365.25/12), 1 an = 365.25 jours.
const MS_PER_MONTH = 30.4375 * MS_PER_DAY;
const MS_PER_YEAR = 365.25 * MS_PER_DAY;

export function formatDurationSince(timestamp, now = Date.now()) {
  if (!timestamp) return '—';
  const diff = Math.max(0, now - timestamp);

  if (diff < MS_PER_MIN) {
    const s = Math.floor(diff / MS_PER_SEC);
    return `${s}s`;
  }

  if (diff < MS_PER_HOUR) {
    const m = Math.floor(diff / MS_PER_MIN);
    const s = Math.floor((diff % MS_PER_MIN) / MS_PER_SEC);
    return `${m}m ${s}s`;
  }

  if (diff < MS_PER_DAY) {
    const h = Math.floor(diff / MS_PER_HOUR);
    const m = Math.floor((diff % MS_PER_HOUR) / MS_PER_MIN);
    const s = Math.floor((diff % MS_PER_MIN) / MS_PER_SEC);
    return `${h}h ${m}m ${s}s`;
  }

  if (diff < MS_PER_MONTH) {
    const d = Math.floor(diff / MS_PER_DAY);
    const h = Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR);
    const m = Math.floor((diff % MS_PER_HOUR) / MS_PER_MIN);
    return `${d}j ${h}h ${m}m`;
  }

  if (diff < MS_PER_YEAR) {
    const months = Math.floor(diff / MS_PER_MONTH);
    const remainAfterMonths = diff - months * MS_PER_MONTH;
    const d = Math.floor(remainAfterMonths / MS_PER_DAY);
    const h = Math.floor((remainAfterMonths % MS_PER_DAY) / MS_PER_HOUR);
    return `${months}mois ${d}j ${h}h`;
  }

  const years = Math.floor(diff / MS_PER_YEAR);
  const remainAfterYears = diff - years * MS_PER_YEAR;
  const months = Math.floor(remainAfterYears / MS_PER_MONTH);
  const remainAfterMonths = remainAfterYears - months * MS_PER_MONTH;
  const d = Math.floor(remainAfterMonths / MS_PER_DAY);
  return `${years}a ${months}mois ${d}j`;
}

// Renvoie l'intervalle de mise à jour idéal en ms,
// en fonction de la précision actuellement affichée.
// < 1 jour : tick chaque seconde, sinon chaque minute.
export function getTickInterval(timestamp, now = Date.now()) {
  if (!timestamp) return 60_000;
  const diff = now - timestamp;
  if (diff < MS_PER_DAY) return 1_000;
  return 60_000;
}
