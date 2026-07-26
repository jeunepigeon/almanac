import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Path, Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { theme } from '../theme';

const { width: SCREEN_W } = Dimensions.get('window');

// ---------- BarChart : histogramme simple ----------
// data : array of numbers
// labels : array of strings (même longueur)
// color : couleur des barres
export function BarChart({ data, labels, color = theme.colors.text, height = 120 }) {
  const w = SCREEN_W - 64;
  const barCount = data.length;
  const max = Math.max(...data, 1);
  const barW = (w - 24) / barCount;
  const padBottom = 18;

  return (
    <Svg width={w} height={height} style={{ alignSelf: 'center' }}>
      {data.map((v, i) => {
        const h = max > 0 ? (v / max) * (height - padBottom - 4) : 0;
        const x = 12 + i * barW;
        const y = height - padBottom - h;
        return (
          <G key={i}>
            <Rect
              x={x + 1}
              y={y}
              width={barW - 2}
              height={Math.max(1, h)}
              fill={v > 0 ? color : theme.colors.border}
              opacity={v > 0 ? 1 : 0.4}
              rx={1}
            />
            {labels && labels[i] != null && (
              <SvgText
                x={x + barW / 2}
                y={height - 4}
                fontSize="9"
                fill={theme.colors.textFaint}
                textAnchor="middle"
              >
                {labels[i]}
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}

// ---------- LineChart : courbe avec graduations temporelles ----------
// data : array of { ts, count }
// segmentColors : array de couleurs (longueur = data.length - 1), optionnel
export function LineChart({ data, color = theme.colors.text, height = 140, segmentColors = null, clusterGap = 1 }) {
  const w = SCREEN_W - 64;
  if (!data || data.length === 0) {
    return (
      <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.textFaint, fontSize: theme.font.sizes.sm }}>
          Pas de données
        </Text>
      </View>
    );
  }

  const LABEL_H = 16;
  const chartH = height - LABEL_H;
  const max = Math.max(...data.map((d) => d.count), 1);
  const padX = 8;
  const padY = 8;
  const innerW = w - padX * 2;
  const innerH = chartH - padY * 2;

  if (data.length === 1) {
    return (
      <Svg width={w} height={height} style={{ alignSelf: 'center' }}>
        <Circle cx={w / 2} cy={chartH / 2} r={3} fill={color} />
      </Svg>
    );
  }

  const stepX = innerW / (data.length - 1);
  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padY + innerH - (d.count / max) * innerH,
  }));

  // Graduation : 3 labels (début, milieu, fin)
  const fmtShort = (ts) => {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  const labelIndices = [0, Math.floor((data.length - 1) / 2), data.length - 1];
  const labels = labelIndices.map((i) => ({ x: points[i].x, text: fmtShort(data[i].ts) }));

  if (segmentColors && segmentColors.length >= data.length - 1) {
    // Détecter les clusters (tolérance clusterGap) avec segmentColors
    const active = data
      .map((d, i) => ({ ...d, x: points[i].x, y: points[i].y, idx: i }))
      .filter((d) => d.count > 0);
    const clusters = [];
    let cur = [];
    for (const p of active) {
      if (cur.length === 0) cur.push(p);
      else {
        const last = cur[cur.length - 1];
        if (p.idx - last.idx <= clusterGap) cur.push(p);
        else { clusters.push(cur); cur = [p]; }
      }
    }
    if (cur.length > 0) clusters.push(cur);

    return (
      <View>
        <Svg width={w} height={chartH} style={{ alignSelf: 'center' }}>
          {clusters.map((cl, cIdx) => {
            if (cl.length === 1) {
              const p = cl[0];
              return <Circle key={`p${cIdx}`} cx={p.x} cy={p.y} r={3} fill={segmentColors[Math.min(p.idx, segmentColors.length - 1)] || color} />;
            }
            // Dessin segment par segment entre 2 points consécutifs du cluster
            return (
              <React.Fragment key={`s${cIdx}`}>
                {cl.slice(0, -1).map((p1, j) => {
                  const p2 = cl[j + 1];
                  const c = segmentColors[p1.idx] || color;
                  return (
                    <React.Fragment key={`seg${cIdx}_${j}`}>
                      <Path d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p2.x} ${padY + innerH} L ${p1.x} ${padY + innerH} Z`} fill={c} opacity={0.15} />
                      <Path d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`} stroke={c} strokeWidth={1.5} fill="none" />
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            );
          })}
        </Svg>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: padX }}>
          {labels.map((l, i) => (
            <Text key={i} style={{ color: theme.colors.textFaint, fontSize: 9, fontWeight: '300', letterSpacing: 0.3, textAlign: i === 0 ? 'left' : i === labels.length - 1 ? 'right' : 'center' }}>
              {l.text}
            </Text>
          ))}
        </View>
      </View>
    );
  }

  // Détecter les clusters de jours CONSÉCUTIFS avec conso > 0
  // Chaque cluster ≥ 2 = segment, cluster 1 pt = cercle isolé.
  const activePoints = points
    .map((p, idx) => ({ ...p, v: data[idx].count, idx }))
    .filter((p) => p.v > 0);

  const clusters = [];
  let cur = [];
  for (const p of activePoints) {
    if (cur.length === 0) {
      cur.push(p);
    } else {
      const last = cur[cur.length - 1];
      if (p.idx - last.idx <= clusterGap) {
        cur.push(p);
      } else {
        clusters.push(cur);
        cur = [p];
      }
    }
  }
  if (cur.length > 0) clusters.push(cur);

  return (
    <View>
      <Svg width={w} height={chartH} style={{ alignSelf: 'center' }}>
        {clusters.map((cl, cIdx) => {
          if (cl.length === 1) {
            return <Circle key={`p${cIdx}`} cx={cl[0].x} cy={cl[0].y} r={3} fill={color} />;
          }
          let pathD = `M ${cl[0].x} ${cl[0].y}`;
          for (let j = 1; j < cl.length; j++) pathD += ` L ${cl[j].x} ${cl[j].y}`;
          // Area sous le segment (garde le style visuel)
          const areaD = pathD +
            ` L ${cl[cl.length - 1].x} ${padY + innerH}` +
            ` L ${cl[0].x} ${padY + innerH} Z`;
          return (
            <React.Fragment key={`s${cIdx}`}>
              <Path d={areaD} fill={color} opacity={0.15} />
              <Path d={pathD} stroke={color} strokeWidth={1.5} fill="none" />
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: padX }}>
        {labels.map((l, i) => (
          <Text key={i} style={{ color: theme.colors.textFaint, fontSize: 9, fontWeight: '300', letterSpacing: 0.3, textAlign: i === 0 ? 'left' : i === labels.length - 1 ? 'right' : 'center' }}>
            {l.text}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ---------- PieChart : camembert ----------
// data : array of { label, value, color }
export function PieChart({ data, size = 160 }) {
  const containerStyle = { width: size, height: size, justifyContent: 'center', alignItems: 'center' };

  // Aucune donnée : afficher "Aucune sélection" en gardant la même taille (pas de shift UI)
  if (!data || data.length === 0) {
    return (
      <View style={containerStyle}>
        <Text style={{ color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontStyle: 'italic' }}>
          Aucune sélection
        </Text>
      </View>
    );
  }
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <View style={containerStyle}>
        <Text style={{ color: theme.colors.textFaint, fontSize: theme.font.sizes.sm, fontStyle: 'italic' }}>
          Aucune donnée
        </Text>
      </View>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  // Une seule tranche visible = cercle plein (pas de path d'arc pour éviter le bug 360°)
  if (data.length === 1) {
    return (
      <View style={{ width: size, height: size, position: 'relative' }}>
        <Svg width={size} height={size} style={{ alignSelf: 'center' }}>
          <Circle cx={cx} cy={cy} r={r} fill={data[0].color} />
        </Svg>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: theme.font.sizes.md, fontWeight: '600' }}>
            100%
          </Text>
        </View>
      </View>
    );
  }

  let startAngle = -Math.PI / 2; // commence en haut
  const slices = data.map((d) => {
    const angle = (d.value / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    const slice = { path, color: d.color };
    startAngle = endAngle;
    return slice;
  });

  return (
    <Svg width={size} height={size} style={{ alignSelf: 'center' }}>
      {slices.map((s, i) => (
        <Path key={i} d={s.path} fill={s.color} />
      ))}
    </Svg>
  );
}

// ---------- MultiLineChart : plusieurs courbes superposées ----------
// curves : [{ id, name, color, points: [{ts, count}] }]
export function MultiLineChart({ curves, height = 140, forcePoints = false, timeline = null, clusterGap = 1 }) {
  const w = SCREEN_W - 64;
  if (!curves || curves.length === 0) {
    return (
      <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.textFaint, fontSize: theme.font.sizes.sm }}>
          Pas de données
        </Text>
      </View>
    );
  }

  const LABEL_H = 16;

  // Max global pour normaliser
  let globalMax = 1;
  for (const c of curves) {
    for (const p of c.points) {
      if (p.count > globalMax) globalMax = p.count;
    }
  }

  // Détecter TOUTES les courbes plates au sol (indépendamment du fait qu'elles soient
  // visibles ou non, pour que le rail reste fixe même quand on décoche)
  // Une courbe est "plate au sol" si : ≥4 occ ET max ≤ 20% du globalMax
  // Le rail (index) est basé sur l'ordre dans le tableau `curves` (donc ordre substances)
  const flatRailsMap = {};
  if (!forcePoints) {
    const flatCurves = [];
    for (const curve of curves) {
      const activePts = curve.points.filter((p) => p.count > 0);
      if (activePts.length < 4) continue;
      const localMax = Math.max(...activePts.map((p) => p.count));
      if (localMax <= globalMax * 0.20) {
        flatCurves.push(curve);
      }
    }
    // Seulement si >= 2 courbes plates (une seule reste à la baseline normale)
    if (flatCurves.length >= 2) {
      flatCurves.forEach((c, idx) => {
        flatRailsMap[c.id] = idx; // rail 0, 1, 2, ...
      });
    }
  }
  const numFlatRails = Object.keys(flatRailsMap).length;

  // Zone principale (mêlée) : garde la hauteur habituelle
  // Zone étendue en bas : ajoute de la hauteur si des courbes plates
  const RAIL_STEP = 6;
  const EXTRA_TOP = numFlatRails > 0 ? RAIL_STEP : 0;
  const extraBottomH = numFlatRails > 0 ? EXTRA_TOP + numFlatRails * RAIL_STEP : 0;

  const chartH = (height - LABEL_H) + extraBottomH;

  const padX = 8;
  const padY = 8;
  const innerW = w - padX * 2;
  const innerH = chartH - padY * 2 - extraBottomH; // zone de la mêlée, pas la zone étendue
  const dataLen = curves[0].points.length;

  if (dataLen === 0) {
    return (
      <View style={{ height, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.textFaint, fontSize: theme.font.sizes.sm }}>
          Pas de données
        </Text>
      </View>
    );
  }
  if (dataLen === 1) {
    return (
      <Svg width={w} height={height} style={{ alignSelf: 'center' }}>
        {curves.map((c, i) => (
          <Circle key={i} cx={w / 2} cy={chartH / 2} r={3} fill={c.color} />
        ))}
      </Svg>
    );
  }

  const stepX = innerW / (dataLen - 1);

  const fmtShort = (ts) => {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  const labelIndices = [0, Math.floor((dataLen - 1) / 2), dataLen - 1];
  // Utilise la timeline explicite si fournie, sinon fallback sur la 1re courbe
  const tsSource = timeline || curves[0].points;
  const labels = labelIndices.map((i) => ({ x: padX + i * stepX, text: fmtShort(tsSource[i]?.ts ?? curves[0].points[i]?.ts) }));

  // Pré-calcul cluster offsets par jour pour forcePoints :
  // Pour chaque jour, on liste les substances visibles qui ont conso ce jour.
  // Si plusieurs → on répartit en cluster géométrique centré sur position moyenne.
  const POINT_RADIUS = 3;
  const POINT_DIAMETER = POINT_RADIUS * 2;
  const clusterOffsets = {}; // key = `${dayIdx}_${curveId}` → { dx, dy }
  if (forcePoints) {
    const dayGroups = {}; // dayIdx → [{curveId, v}]
    for (const curve of curves) {
      if (curve.visible === false) continue;
      curve.points.forEach((p, dayIdx) => {
        if (p.count > 0) {
          if (!dayGroups[dayIdx]) dayGroups[dayIdx] = [];
          dayGroups[dayIdx].push({ curveId: curve.id, v: p.count });
        }
      });
    }
    // Pour chaque jour, calculer positions géométriques
    Object.entries(dayGroups).forEach(([dayIdx, items]) => {
      const n = items.length;
      if (n === 1) {
        clusterOffsets[`${dayIdx}_${items[0].curveId}`] = { dx: 0, dy: 0 };
      } else if (n === 2) {
        // Côte à côte, écart = rayon (léger overlap)
        const off = POINT_RADIUS * 0.5;
        items.forEach((it, i) => {
          clusterOffsets[`${dayIdx}_${it.curveId}`] = { dx: (i === 0 ? -off : off), dy: 0 };
        });
      } else if (n === 3) {
        // Triangle équilatéral centré, distance = rayon
        const r = POINT_RADIUS * 0.6;
        items.forEach((it, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
          clusterOffsets[`${dayIdx}_${it.curveId}`] = { dx: r * Math.cos(angle), dy: r * Math.sin(angle) };
        });
      } else if (n === 4) {
        // Carré centré
        const off = POINT_RADIUS * 0.5;
        const pos = [[-off, -off], [off, -off], [off, off], [-off, off]];
        items.forEach((it, i) => {
          clusterOffsets[`${dayIdx}_${it.curveId}`] = { dx: pos[i][0], dy: pos[i][1] };
        });
      } else {
        // Cercle réparti
        const r = POINT_RADIUS * 0.7;
        items.forEach((it, i) => {
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
          clusterOffsets[`${dayIdx}_${it.curveId}`] = { dx: r * Math.cos(angle), dy: r * Math.sin(angle) };
        });
      }
    });
  }

  return (
    <View>
      <Svg width={w} height={chartH} style={{ alignSelf: 'center' }}>
        {curves.map((curve, i) => {
          if (curve.visible === false) return null;

          const points = curve.points.map((d, j) => ({
            x: padX + j * stepX,
            v: d.count,
            ts: d.ts,
            idx: j,
          }));

          const activePoints = points.filter((p) => p.v > 0);
          if (activePoints.length === 0) return null;

          // Si forcePoints (fenêtre courte) : points avec hauteur réelle, cluster géométrique
          if (forcePoints) {
            return (
              <React.Fragment key={curve.id || i}>
                {activePoints.map((p, idx2) => {
                  const y = padY + innerH - (p.v / globalMax) * innerH;
                  const off = clusterOffsets[`${p.idx}_${curve.id}`] || { dx: 0, dy: 0 };
                  return <Circle key={`c${idx2}`} cx={p.x + off.dx} cy={y + off.dy} r={POINT_RADIUS} fill={curve.color} opacity={0.95} />;
                })}
              </React.Fragment>
            );
          }

          // < 4 occurrences (hors forcePoints) = points isolés à 30% baseline
          if (activePoints.length < 4) {
            const visibleCurves = curves.filter((c) => c.visible !== false);
            const idx = visibleCurves.findIndex((c) => c.id === curve.id);
            const n = visibleCurves.length || 1;
            const jitterFactor = stepX * 0.25;
            const jitter = n > 1 ? (idx - (n - 1) / 2) * (jitterFactor / Math.max(1, n - 1)) : 0;
            const pointY = padY + innerH * 0.70;
            return (
              <React.Fragment key={curve.id || i}>
                {activePoints.map((p, idx2) => (
                  <Circle key={`c${idx2}`} cx={p.x + jitter} cy={pointY} r={3} fill={curve.color} opacity={0.95} />
                ))}
              </React.Fragment>
            );
          }

          // ≥ 4 occurrences : détecter les clusters de jours CONSÉCUTIFS
          // Chaque cluster ≥ 2 pts = segment de courbe reliant ces pts
          // Cluster 1 pt = point isolé
          // Entre clusters : rien
          const clusters = [];
          let cur = [];
          for (const p of activePoints) {
            if (cur.length === 0) {
              cur.push(p);
            } else {
              const last = cur[cur.length - 1];
              if (p.idx - last.idx <= clusterGap) {
                cur.push(p);
              } else {
                clusters.push(cur);
                cur = [p];
              }
            }
          }
          if (cur.length > 0) clusters.push(cur);

          const railIdx = flatRailsMap[curve.id];
          if (railIdx !== undefined) {
            // Courbe plate → dessin dans la zone étendue en bas, sur son rail Y fixe
            // Les clusters sont dessinés comme des segments horizontaux à la Y du rail,
            // les points isolés comme cercles à la Y du rail.
            const railY = padY + innerH + EXTRA_TOP + (railIdx * RAIL_STEP) + RAIL_STEP / 2;
            return (
              <React.Fragment key={curve.id || i}>
                {clusters.map((cl, cIdx) => {
                  if (cl.length === 1) {
                    return <Circle key={`p${cIdx}`} cx={cl[0].x} cy={railY} r={2.5} fill={curve.color} opacity={0.95} />;
                  }
                  return (
                    <Path
                      key={`s${cIdx}`}
                      d={`M ${cl[0].x} ${railY} L ${cl[cl.length - 1].x} ${railY}`}
                      stroke={curve.color}
                      strokeWidth={1.6}
                      fill="none"
                      opacity={0.95}
                    />
                  );
                })}
              </React.Fragment>
            );
          }

          // Courbe normale (dans la mêlée) : scalée entre 5% et 100%, avec clusters
          const BASELINE = 0.05;
          const yFor = (v) => padY + innerH - (BASELINE + (1 - BASELINE) * (v / globalMax)) * innerH;

          return (
            <React.Fragment key={curve.id || i}>
              {clusters.map((cl, cIdx) => {
                if (cl.length === 1) {
                  return <Circle key={`p${cIdx}`} cx={cl[0].x} cy={yFor(cl[0].v)} r={2.5} fill={curve.color} opacity={0.95} />;
                }
                let pathD = `M ${cl[0].x} ${yFor(cl[0].v)}`;
                for (let j = 1; j < cl.length; j++) pathD += ` L ${cl[j].x} ${yFor(cl[j].v)}`;
                return (
                  <Path key={`s${cIdx}`} d={pathD} stroke={curve.color} strokeWidth={1.5} fill="none" opacity={0.9} />
                );
              })}
            </React.Fragment>
          );
        })}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: padX }}>
        {labels.map((l, i) => (
          <Text key={i} style={{ color: theme.colors.textFaint, fontSize: 9, fontWeight: '300', letterSpacing: 0.3, textAlign: i === 0 ? 'left' : i === labels.length - 1 ? 'right' : 'center' }}>
            {l.text}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ---------- Container helper ----------
export function ChartCard({ title, children }) {
  return (
    <View style={styles.card}>
      {title != null && (
        typeof title === 'string'
          ? <Text style={styles.cardTitle}>{title}</Text>
          : <View style={styles.cardTitleWrap}>{title}</View>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.font.sizes.xs,
    fontWeight: '400',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: theme.spacing.sm,
  },
  cardTitleWrap: {
    marginBottom: theme.spacing.sm,
  },
});
