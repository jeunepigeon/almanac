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

// ---------- LineChart : courbe simple ou arc-en-ciel par segment ----------
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
  const max = Math.max(...data.map((d) => d.count), 1);
  const padX = 8;
  const padY = 8;
  const innerW = w - padX * 2;
  const innerH = height - padY * 2;

  if (data.length === 1) {
    return (
      <Svg width={w} height={height} style={{ alignSelf: 'center' }}>
        <Circle cx={w / 2} cy={height / 2} r={3} fill={color} />
      </Svg>
    );
  }

  const stepX = innerW / (data.length - 1);
  const points = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padY + innerH - (d.count / max) * innerH,
  }));

  if (segmentColors && segmentColors.length >= data.length - 1) {
    // Arc-en-ciel : un Path par segment
    const segments = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const segColor = segmentColors[i] || color;
      const segPath = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
      const areaPath = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p2.x} ${padY + innerH} L ${p1.x} ${padY + innerH} Z`;
      segments.push({ segPath, areaPath, segColor });
    }
    return (
      <Svg width={w} height={height} style={{ alignSelf: 'center' }}>
        {segments.map((s, i) => (
          <Path key={`a${i}`} d={s.areaPath} fill={s.segColor} opacity={0.15} />
        ))}
        {segments.map((s, i) => (
          <Path key={`l${i}`} d={s.segPath} stroke={s.segColor} strokeWidth={1.5} fill="none" />
        ))}
      </Svg>
    );
  }

  // Courbe simple (mode substance ou global sans segmentColors)
  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${points[i].x} ${points[i].y}`;
  }
  let areaD = pathD;
  areaD += ` L ${points[points.length - 1].x} ${padY + innerH}`;
  areaD += ` L ${points[0].x} ${padY + innerH} Z`;

  return (
    <Svg width={w} height={height} style={{ alignSelf: 'center' }}>
      <Path d={areaD} fill={color} opacity={0.15} />
      <Path d={pathD} stroke={color} strokeWidth={1.5} fill="none" />
    </Svg>
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
