// The board: squares, the rectangles so far in their players' colours, and
// whatever is happening on it now (a rectangle being drawn, the CPU's growing
// one, skip-counting). Drawing is a drag from corner to corner.
import { useMemo, useRef } from 'react';
import { PanResponder, Platform, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { boardLayout, cellAt, dragRect } from './boardMath';
import { PLAYER_COLORS, useTheme } from './theme';

// (the web build: the system's sans-serif, and no text selection while dragging)
const FONT = Platform.OS === 'web' ? 'system-ui, sans-serif' : undefined;
const NO_SELECT = Platform.OS === 'web' ? { userSelect: 'none' } : null;

// A colour made darker (amount < 0) or lighter, like the web board's outlines
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(Math.max(0, Math.min(255, amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

// The lines between the squares inside a rectangle, drawn over its colour so
// every square can be counted
function SquareLines({ x, y, w, h, cell, width = 1.5 }) {
  const lines = [];
  for (let i = 1; i < w; i++) lines.push(<Line key={`c${i}`} x1={(x + i) * cell} y1={y * cell} x2={(x + i) * cell} y2={(y + h) * cell} stroke="#fff" strokeOpacity={0.6} strokeWidth={width} />);
  for (let i = 1; i < h; i++) lines.push(<Line key={`r${i}`} x1={x * cell} y1={(y + i) * cell} x2={(x + w) * cell} y2={(y + i) * cell} stroke="#fff" strokeOpacity={0.6} strokeWidth={width} />);
  return lines;
}

// drag: { c0, r0, c1, r1, verdict } while drawing (verdict: match.judge's); preview: the CPU's rectangle so
// far (hide: the placed one it grows into); counting: { rect, byRows, shown };
// onDraw(rect) when a drag ends.
export default function Board({ match, width, drag, preview, hide, counting, canDraw, onDrag, onDraw }) {
  const t = useTheme();
  const { size, board } = match;
  const { cell, side } = boardLayout(width, size);
  const start = useRef(null);
  const live = useRef({ canDraw, onDrag, onDraw, cell, size });
  live.current = { canDraw, onDrag, onDraw, cell, size };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => live.current.canDraw,
        onMoveShouldSetPanResponder: () => live.current.canDraw,
        onPanResponderTerminationRequest: () => false, // (don't let a scroll steal the drag)
        onPanResponderGrant: (e) => {
          const { cell: px, size: n } = live.current;
          const { c, r } = cellAt(e.nativeEvent.locationX, e.nativeEvent.locationY, px, n);
          start.current = { c0: c, r0: r, x0: e.nativeEvent.locationX, y0: e.nativeEvent.locationY };
          live.current.onDrag({ c0: c, r0: r, c1: c, r1: r });
        },
        onPanResponderMove: (_, g) => {
          const s = start.current;
          if (!s) return;
          const { cell: px, size: n } = live.current;
          const { c, r } = cellAt(s.x0 + g.dx, s.y0 + g.dy, px, n);
          live.current.onDrag({ c0: s.c0, r0: s.r0, c1: c, r1: r });
        },
        onPanResponderRelease: (_, g) => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          const { cell: px, size: n } = live.current;
          const { c, r } = cellAt(s.x0 + g.dx, s.y0 + g.dy, px, n);
          live.current.onDraw(dragRect({ c0: s.c0, r0: s.r0, c1: c, r1: r }));
        },
        onPanResponderTerminate: () => {
          start.current = null;
          live.current.onDrag(null);
        },
      }),
    []
  );

  const box = (r, key, props) => <Rect key={key} x={r.x * cell} y={r.y * cell} width={r.w * cell} height={r.h * cell} {...props} />;
  const drawing = drag ? dragRect(drag) : null;

  return (
    <View style={[{ width: side, height: side, alignSelf: 'center' }, NO_SELECT]} {...responder.panHandlers} accessibilityLabel={`Board, ${size} by ${size}`}>
      <Svg width={side} height={side} pointerEvents="none">
        <Rect x={0} y={0} width={side} height={side} fill={t.boardBg} />
        {Array.from({ length: size + 1 }, (_, i) => (
          <G key={i}>
            <Line x1={i * cell} y1={0} x2={i * cell} y2={side} stroke={t.boardGrid} strokeWidth={1} />
            <Line x1={0} y1={i * cell} x2={side} y2={i * cell} stroke={t.boardGrid} strokeWidth={1} />
          </G>
        ))}
        {board.rects.map((r, i) => {
          if (r === hide) return null;
          const color = PLAYER_COLORS[r.player % PLAYER_COLORS.length];
          const label = r.w * cell >= 34 && r.h * cell >= 22;
          return (
            <G key={`r${i}`}>
              {box(r, 'fill', { fill: color, fillOpacity: r.solved ? 0.85 : 0.5 })}
              <SquareLines {...r} cell={cell} />
              {box(r, 'edge', { fill: 'none', stroke: shade(color, -0.35), strokeWidth: 2.5 })}
              {label && r.solved ? (
                <SvgText x={(r.x + r.w / 2) * cell} y={(r.y + r.h / 2) * cell + 6} fill="#fff" fontFamily={FONT} fontSize={Math.min(18, cell * 0.6)} fontWeight="bold" textAnchor="middle">
                  {r.area}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        {counting ? <CountingOverlay counting={counting} cell={cell} t={t} /> : null}
        {preview ? box(preview, 'cpu', { fill: PLAYER_COLORS[match.current % PLAYER_COLORS.length], fillOpacity: 0.35, stroke: t.boardEdge, strokeWidth: 2, strokeDasharray: '6 4' }) : null}
        {drawing ? <Drawing rect={drawing} verdict={drag.verdict} color={PLAYER_COLORS[match.current % PLAYER_COLORS.length]} cell={cell} side={side} t={t} /> : null}
        <Rect x={1} y={1} width={side - 2} height={side - 2} fill="none" stroke={t.boardEdge} strokeWidth={2} />
      </Svg>
    </View>
  );
}

// The rectangle being drawn, labelled with its size, as on the web: the
// player's colour when it's right and fits, grey when the size is wrong, red
// when it bumps into another. The label sits above it (the finger is on it),
// or inside its top when there's no room above.
function Drawing({ rect, verdict, color, cell, side, t }) {
  const tint = !verdict.fits ? t.bad : verdict.ok ? color : t.boardWrong;
  const x = rect.x * cell;
  const y = rect.y * cell;
  const w = rect.w * cell;
  const h = rect.h * cell;
  const label = `${rect.w} × ${rect.h}${verdict.ok ? ' ✓' : ''}`;
  const size = Math.max(14, Math.min(cell * 0.6, 24));
  const tw = label.length * size * 0.62 + 14;
  const th = size + 10;
  const tx = Math.max(2, Math.min(x + w / 2 - tw / 2, side - tw - 2));
  const ty = y - th - 4 >= 0 ? y - th - 4 : y + 4;
  return (
    <G>
      <Rect x={x} y={y} width={w} height={h} fill={tint} fillOpacity={verdict.ok ? 0.55 : 0.3} />
      <Rect x={x + 1.5} y={y + 1.5} width={w - 3} height={h - 3} fill="none" stroke={tint} strokeWidth={3} />
      <Rect x={tx} y={ty} width={tw} height={th} rx={6} fill={t.ink} />
      <SvgText x={tx + tw / 2} y={ty + th / 2 + size * 0.35} fill={t.boardBg} fontFamily={FONT} fontSize={size} fontWeight="900" textAnchor="middle">
        {label}
      </SvgText>
    </G>
  );
}

// Skip-counting: the rows (or columns) counted so far light up, each with its running total
function CountingOverlay({ counting, cell, t }) {
  const { rect, byRows, shown, group } = counting;
  const strips = [];
  for (let i = 0; i < shown; i++) {
    const strip = byRows ? { x: rect.x, y: rect.y + i, w: rect.w, h: 1 } : { x: rect.x + i, y: rect.y, w: 1, h: rect.h };
    strips.push(
      <G key={i}>
        <Rect x={strip.x * cell} y={strip.y * cell} width={strip.w * cell} height={strip.h * cell} fill={t.gold} fillOpacity={0.9} />
        <SquareLines {...strip} cell={cell} width={2} />
        <SvgText
          x={(strip.x + strip.w - 0.5) * cell}
          y={(strip.y + strip.h - 0.5) * cell + 5}
          fill={t.ink}
          fontFamily={FONT}
          fontSize={Math.min(16, cell * 0.5)}
          fontWeight="bold"
          textAnchor="middle"
        >
          {(i + 1) * group}
        </SvgText>
      </G>
    );
  }
  return strips;
}

// The rectangle just drawn, on its own, for answering: a × b squares in the
// player's colour, as big as fits (up to 56 px a square), with "Help me
// count" lighting up its rows. counting: { byRows, group, shown }.
export function RectPicture({ rect, color, counting, maxWidth, maxHeight }) {
  const t = useTheme();
  const cell = Math.max(8, Math.floor(Math.min(maxWidth / rect.w, maxHeight / rect.h, 56)));
  const width = cell * rect.w;
  const height = cell * rect.h;
  const at = { ...rect, x: 0, y: 0 };
  return (
    <View style={[{ width, height, alignSelf: 'center' }, NO_SELECT]} accessibilityLabel={`Your rectangle: ${rect.w} squares across and ${rect.h} down`}>
      <Svg width={width} height={height} pointerEvents="none">
        <Rect x={0} y={0} width={width} height={height} fill={color} fillOpacity={0.85} />
        {counting ? <CountingOverlay counting={{ ...counting, rect: at }} cell={cell} t={t} /> : null}
        <SquareLines x={0} y={0} w={rect.w} h={rect.h} cell={cell} width={2} />
        <Rect x={1.5} y={1.5} width={width - 3} height={height - 3} fill="none" stroke={shade(color, -0.35)} strokeWidth={3} />
      </Svg>
    </View>
  );
}
