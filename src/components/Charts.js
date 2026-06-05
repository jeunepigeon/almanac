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
export function LineChart({ data, color = theme.colors.text, height = 140, segmentColors = null }) {
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
    return (
      <View>
        <Svg width={w} height={chartH} style={{ alignSelf: 'center' }}>
          {data.slice(0, -1).map((_, i) => {
            const p1 = points[i]; const p2 = points[i + 1];
            const c = segmentColors[i] || color;
            return (
              <Path key={`a${i}`} d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p2.x} ${padY + innerH} L ${p1.x} ${padY + innerH} Z`} fill={c} opacity={0.15} />
            );
          })}
          {data.slice(0, -1).map((_, i) => {
            const p1 = points[i]; const p2 = points[i + 1];
            const c = segmentColors[i] || color;
            return (
              <Path key={`l${i}`} d={`M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`} stroke={c} strokeWidth={1.5} fill="none" />
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

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) pathD += ` L ${points[i].x} ${points[i].y}`;
  let areaD = pathD + ` L ${points[points.length - 1].x} ${padY + innerH} L ${points[0].x} ${padY + innerH} Z`;

  return (
    <View>
      <Svg width={w} height={chartH} style={{ alignSelf: 'center' }}>
        <Path d={areaD} fill={color} opacity={0.15} />
        <Path d={pathD} stroke={color} strokeWidth={1.5} fill="none" />
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
  if (!data || data.length === 0) {
    return (
      <View style={{ height: size, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.textFaint, fontSize: theme.font.sizes.sm }}>
          Aucune donnée
        </Text>
      </View>
    );
  }
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <View style={{ height: size, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: theme.colors.textFaint, fontSize: theme.font.sizes.sm }}>
          Aucune donnée
        </Text>
      </View>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

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
export function MultiLineChart({ curves, height = 140 }) {
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
  const chartH = height - LABEL_H;
  // Max global pour normaliser
  let globalMax = 1;
  for (const c of curves) {
    for (const p of c.points) {
      if (p.count > globalMax) globalMax = p.count;
    }
  }
  const padX = 8;
  const padY = 8;
  const innerW = w - padX * 2;
  const innerH = chartH - padY * 2;
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
  const labels = labelIndices.map((i) => ({ x: padX + i * stepX, text: fmtShort(curves[0].points[i].ts) }));

  return (
    <View>
      <Svg width={w} height={chartH} style={{ alignSelf: 'center' }}>
        {curves.map((curve, i) => {
          // Skip invisible curves (décochées) — mais globalMax inclut leur valeur
          if (curve.visible === false) return null;

          const points = curve.points.map((d, j) => ({
            x: padX + j * stepX,
            y: padY + innerH - (d.count / globalMax) * innerH,
            v: d.count,
            ts: d.ts,
            idx: j,
          }));

          // Décompose en segments de JOURS CONSÉCUTIFS avec count > 0
          // Deux points sont reliés seulement si idx successifs (j et j+1)
          const segments = [];
          let cur = [];
          for (let j = 0; j < points.length; j++) {
            const p = points[j];
            if (p.v > 0) {
              if (cur.length === 0) cur.push(p);
              else {
                const prev = cur[cur.length - 1];
                if (p.idx === prev.idx + 1) cur.push(p);
                else {
                  segments.push(cur);
                  cur = [p];
                }
              }
            } else {
              if (cur.length > 0) {
                segments.push(cur);
                cur = [];
              }
            }
          }
          if (cur.length > 0) segments.push(cur);

          if (segments.length === 0) return null;

          return (
            <React.Fragment key={curve.id || i}>
              {segments.map((seg, sIdx) => {
                if (seg.length === 1) {
                  return <Circle key={`c${sIdx}`} cx={seg[0].x} cy={seg[0].y} r={2.5} fill={curve.color} opacity={0.95} />;
                }
                let pathD = `M ${seg[0].x} ${seg[0].y}`;
                for (let j = 1; j < seg.length; j++) pathD += ` L ${seg[j].x} ${seg[j].y}`;
                return <Path key={`l${sIdx}`} d={pathD} stroke={curve.color} strokeWidth={1.5} fill="none" opacity={0.9} />;
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
