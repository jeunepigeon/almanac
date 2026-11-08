// 1.62 — Bandeaux proposés au partage : ceux affichés dans la liste, sauf « 24 h » (même logique que
// la liste : catégorie = couleur d'au moins 1 substance, bandeau personnalisé existant…), et leur dessin
// (identique à la liste, sans date ni cloche).
import { useMemo } from 'react';
import { theme } from '../theme';
import { useStore } from '../store';
import { SobreBanner, CounterBanner, RecordBanner } from './Banners';

export function useShareBanners() {
  const substances = useStore((s) => s.substances);
  const lastTimestamps = useStore((s) => s.lastTimestamps);
  const colorBanners = useStore((s) => s.colorBanners);
  const customBanners = useStore((s) => s.customBanners);
  return useMemo(() => {
    const byColor = {};
    for (const sub of substances) {
      const b = byColor[sub.color] || (byColor[sub.color] = { lastTs: 0 });
      const ts = (lastTimestamps || {})[sub.id] || 0;
      if (ts > b.lastTs) b.lastTs = ts;
    }
    const out = [];
    for (const entry of colorBanners) {
      if (entry === '__sobre') {
        out.push({ id: `banner:${entry}`, entry, type: 'sobre', color: theme.colors.text });
      } else if (entry.startsWith('#')) {
        if (!byColor[entry]) continue;
        out.push({ id: `banner:${entry}`, entry, type: 'color', color: entry, lastTs: byColor[entry].lastTs || null });
      } else if (entry.startsWith('custom:')) {
        const def = customBanners.find((b) => b.id === entry.slice(7));
        if (!def) continue;
        let lastTs = 0;
        for (const sid of def.subIds) { const ts = (lastTimestamps || {})[sid] || 0; if (ts > lastTs) lastTs = ts; }
        out.push({ id: `banner:${entry}`, entry, type: 'custom', def, color: theme.colors.text, lastTs: lastTs || null });
      } else if (entry === 'record') {
        out.push({ id: `banner:${entry}`, entry, type: 'record', color: theme.colors.text });
      }
      // 'last24' : jamais dans le partage
    }
    return out;
  }, [substances, lastTimestamps, colorBanners, customBanners]);
}

// Dessin d'un bandeau pour le partage (aperçu et image) : comme la liste, sans date ni cloche
export function renderShareBanner(item, { compact = false, layoutWidth, inReorder = false, isWiggling = false, phase = 0 } = {}, sobreTs = null) {
  const frame = { compact, inReorder, isWiggling, phase, noDate: true, flashTick: 0 };
  if (item.type === 'sobre') return <SobreBanner {...frame} lastGlobalTimestamp={sobreTs} />;
  if (item.type === 'color') return <CounterBanner {...frame} label="SOBRE DEPUIS" color={item.color} lastTimestamp={item.lastTs} />;
  if (item.type === 'custom') {
    return (
      <CounterBanner
        {...frame}
        label={`SOBRE DE ${item.def.name.toUpperCase()} DEPUIS`}
        color={theme.colors.text}
        labelColor={theme.colors.textMuted}
        lastTimestamp={item.lastTs}
      />
    );
  }
  return <RecordBanner {...frame} />;
}
