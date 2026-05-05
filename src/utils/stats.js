// Calculs de statistiques sur des consommations.
// Fenêtres temporelles : jours glissants.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const WINDOWS = [
  { id: '30d',  label: '30j' },
  { id: '90d',  label: '90j' },
  { id: '180d', label: '180j' },
  { id: '365d', label: '365j' },
  { id: 'all',  label: 'Tout' },
];

// Renvoie [start, end] (timestamps en ms) pour une fenêtre donnée.
export function windowRange(windowId, now = Date.now()) {
  const end = now;
  if (windowId === '30d')  return [end - 30  * MS_PER_DAY, end];
  if (windowId === '90d')  return [end - 90  * MS_PER_DAY, end];
  if (windowId === '180d') return [end - 180 * MS_PER_DAY, end];
  if (windowId === '365d') return [end - 365 * MS_PER_DAY, end];
  // 'all'
  return [null, end];
}

// Filtre les consos dans la fenêtre.
export function filterInWindow(consumptions, windowId, now = Date.now()) {
  const [start, end] = windowRange(windowId, now);
  return consumptions.filter((c) => {
    if (start !== null && c.timestamp < start) return false;
    if (c.timestamp > end) return false;
    return true;
  });
}

function pad2(n) { return n < 10 ? `0${n}` : `${n}`; }
function dayKeyOf(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Calcule l'ensemble des stats principales.
export function computeStats(consumptions, windowId, now = Date.now()) {
  const inWindow = filterInWindow(consumptions, windowId, now);
  const total = inWindow.length;

  if (total === 0) {
    return {
      total: 0,
      daysWithConsumption: 0,
      daysWithoutConsumption: 0,
      avgPerWeek: 0,
      avgIntervalMs: null,
      longestSoberStreak: 0,
      longestActiveStreak: 0,
      currentSoberStreak: 0,
      hourDistribution: new Array(24).fill(0),
      weekdayDistribution: new Array(7).fill(0),
      trendPercent: null,
      timeline: [],
      dosageTotal: 0,
      dosageAvg: null,
      dosageCount: 0,
      hasDosageData: false,
    };
  }

  // Jours avec/sans
  const daysSet = new Set(inWindow.map((c) => dayKeyOf(c.timestamp)));
  const daysWithConsumption = daysSet.size;

  const [start, end] = windowRange(windowId, now);
  let totalDays;
  if (start === null) {
    // 'all' : du jour de la première conso à aujourd'hui
    const firstTs = Math.min(...inWindow.map((c) => c.timestamp));
    totalDays = Math.max(1, Math.ceil((end - firstTs) / MS_PER_DAY));
  } else {
    totalDays = Math.max(1, Math.ceil((end - start) / MS_PER_DAY));
  }
  const daysWithoutConsumption = Math.max(0, totalDays - daysWithConsumption);

  // Fréquence moyenne par semaine
  const avgPerWeek = (total / totalDays) * 7;

  // Intervalles entre consos (sur les consos triées chronologiquement croissant)
  const sorted = [...inWindow].sort((a, b) => a.timestamp - b.timestamp);
  let avgIntervalMs = null;
  if (sorted.length >= 2) {
    let sum = 0;
    for (let i = 1; i < sorted.length; i++) {
      sum += sorted[i].timestamp - sorted[i - 1].timestamp;
    }
    avgIntervalMs = sum / (sorted.length - 1);
  }

  // Streaks : on regarde les jours consécutifs sur la fenêtre
  let longestSoberStreak = 0;
  let longestActiveStreak = 0;
  if (totalDays > 0) {
    // Construire un tableau booléen jour par jour sur la fenêtre
    const days = [];
    const startDay = start === null
      ? new Date(Math.min(...inWindow.map((c) => c.timestamp)))
      : new Date(start);
    startDay.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);
    let cur = new Date(startDay);
    while (cur.getTime() <= endDay.getTime()) {
      days.push(daysSet.has(dayKeyOf(cur.getTime())));
      cur.setDate(cur.getDate() + 1);
    }
    let curSober = 0, curActive = 0;
    for (const has of days) {
      if (has) {
        curActive++;
        longestActiveStreak = Math.max(longestActiveStreak, curActive);
        curSober = 0;
      } else {
        curSober++;
        longestSoberStreak = Math.max(longestSoberStreak, curSober);
        curActive = 0;
      }
    }
  }

  // Distribution par heure (0-23)
  const hourDistribution = new Array(24).fill(0);
  for (const c of inWindow) {
    const h = new Date(c.timestamp).getHours();
    hourDistribution[h]++;
  }

  // Distribution par jour de la semaine (0=lundi, 6=dimanche)
  const weekdayDistribution = new Array(7).fill(0);
  for (const c of inWindow) {
    let wd = new Date(c.timestamp).getDay() - 1; // dimanche=0 -> -1
    if (wd < 0) wd = 6;
    weekdayDistribution[wd]++;
  }

  // Tendance vs période précédente de même durée
  let trendPercent = null;
  if (start !== null) {
    const duration = end - start;
    const prevStart = start - duration;
    const prevEnd = start;
    const prevCount = consumptions.filter(
      (c) => c.timestamp >= prevStart && c.timestamp < prevEnd
    ).length;
    if (prevCount > 0) {
      trendPercent = ((total - prevCount) / prevCount) * 100;
    } else if (total > 0) {
      trendPercent = 100;
    }
  }

  // Timeline (consos par jour) — pour graphique courbe
  const timeline = [];
  if (totalDays > 0) {
    const startDay = start === null
      ? new Date(Math.min(...inWindow.map((c) => c.timestamp)))
      : new Date(start);
    startDay.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);
    const dayCount = {};
    for (const c of inWindow) {
      const k = dayKeyOf(c.timestamp);
      dayCount[k] = (dayCount[k] || 0) + 1;
    }
    let cur = new Date(startDay);
    while (cur.getTime() <= endDay.getTime()) {
      const k = dayKeyOf(cur.getTime());
      timeline.push({ ts: cur.getTime(), count: dayCount[k] || 0 });
      cur.setDate(cur.getDate() + 1);
    }
  }

  // Dosage stats (si présents)
  let dosageTotal = 0;
  let dosageCount = 0;
  for (const c of inWindow) {
    if (typeof c.dosage === 'number' && Number.isFinite(c.dosage)) {
      dosageTotal += c.dosage;
      dosageCount++;
    }
  }
  const dosageAvg = dosageCount > 0 ? dosageTotal / dosageCount : null;
  const hasDosageData = dosageCount > 0;

  // Streak en cours sans conso (jours depuis dernière conso)
  let currentSoberStreak = 0;
  if (sorted.length > 0) {
    const lastTs = sorted[sorted.length - 1].timestamp;
    const lastDay = new Date(lastTs);
    lastDay.setHours(0, 0, 0, 0);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    currentSoberStreak = Math.max(0, Math.floor((today.getTime() - lastDay.getTime()) / MS_PER_DAY));
  }

  return {
    total,
    daysWithConsumption,
    daysWithoutConsumption,
    avgPerWeek,
    avgIntervalMs,
    longestSoberStreak,
    longestActiveStreak,
    currentSoberStreak,
    hourDistribution,
    weekdayDistribution,
    trendPercent,
    timeline,
    dosageTotal,
    dosageAvg,
    dosageCount,
    hasDosageData,
  };
}

// Stats globales : par-substance et répartition pour camembert.
// activeOnly : si true, n'inclut que les substances non-archivées.
export function computeGlobalStats(consumptionsBySubstance, substancesById, windowId, now = Date.now(), { activeOnly = true } = {}) {
  // Collecte toutes les consos actives dans la fenêtre, par substance
  const consosBySubInWindow = {};
  for (const subId of Object.keys(consumptionsBySubstance)) {
    const sub = substancesById[subId];
    if (!sub) continue;
    if (activeOnly && sub.archived) continue;
    consosBySubInWindow[subId] = filterInWindow(consumptionsBySubstance[subId] || [], windowId, now);
  }

  // Jours avec conso par substance (binaire : 1 point = 1 jour)
  const daysBySub = {};
  const allDaysWithAnyConso = new Set();
  let totalPrises = 0;

  for (const [subId, consos] of Object.entries(consosBySubInWindow)) {
    const days = new Set(consos.map((c) => dayKeyOf(c.timestamp)));
    daysBySub[subId] = days.size;
    totalPrises += consos.length;
    for (const d of days) allDaysWithAnyConso.add(d);
  }

  // Calcul de la fenêtre
  const [start, end] = windowRange(windowId, now);
  let totalDaysInWindow = 0;
  const allConsos = Object.values(consosBySubInWindow).flat();
  if (start !== null) {
    totalDaysInWindow = Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
  } else if (allConsos.length > 0) {
    const firstTs = Math.min(...allConsos.map((c) => c.timestamp));
    totalDaysInWindow = Math.max(1, Math.ceil((end - firstTs) / (24 * 60 * 60 * 1000)));
  }

  const joursAvecConso = allDaysWithAnyConso.size;
  const joursSobres = Math.max(0, totalDaysInWindow - joursAvecConso);

  // Breakdown pour le camembert : en jours (unité homogène avec jours sobres)
  const breakdownArr = Object.entries(daysBySub)
    .filter(([_, d]) => d > 0)
    .map(([subId, days]) => ({
      substance: substancesById[subId],
      count: days, // nb jours avec cette substance
      prises: (consosBySubInWindow[subId] || []).length,
      isJoursSobres: false,
    }))
    .filter((entry) => entry.substance)
    .sort((a, b) => b.count - a.count);

  // Entrée "Jours sobres"
  const jourssobresEntry = joursSobres > 0 ? {
    substance: null,
    count: joursSobres,
    prises: 0,
    isJoursSobres: true,
  } : null;

  return {
    total: totalPrises,
    breakdown: breakdownArr,
    jourssobresEntry,
    joursSobres,
    joursAvecConso,
    totalDaysInWindow,
  };
}

// Format intervalle moyen en texte humain
export function formatInterval(ms) {
  if (ms == null) return '—';
  const sec = ms / 1000;
  const min = sec / 60;
  const hour = min / 60;
  const day = hour / 24;
  if (day >= 2) return `${day.toFixed(1)} jours`;
  if (hour >= 2) return `${hour.toFixed(1)} h`;
  if (min >= 2) return `${min.toFixed(0)} min`;
  return `${sec.toFixed(0)} s`;
}
