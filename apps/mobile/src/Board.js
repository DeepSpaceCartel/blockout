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

// drag: { c0, r0, c1, r1, ok } while drawing; preview: the CPU's rectangle so
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
              {box(r, 'fill', { fill: color, fillOpacity: r.solved ? 0.85 : 0.45, stroke: t.boardEdge, strokeWidth: 2 })}
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
        {drawing ? box(drawing, 'drag', { fill: drag.ok ? t.good : t.boardWrong, fillOpacity: 0.35, stroke: drag.ok ? t.good : t.boardWrong, strokeWidth: 3 }) : null}
        <Rect x={1} y={1} width={side - 2} height={side - 2} fill="none" stroke={t.boardEdge} strokeWidth={2} />
      </Svg>
    </View>
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
        <Rect x={strip.x * cell} y={strip.y * cell} width={strip.w * cell} height={strip.h * cell} fill={t.gold} fillOpacity={0.55} />
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
