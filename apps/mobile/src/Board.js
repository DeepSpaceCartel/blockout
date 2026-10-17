// The board: squares, the rectangles so far in their players' colours, and
// whatever is happening on it now (a rectangle being drawn, the CPU's growing
// one, skip-counting). Drawing is a drag from corner to corner.
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { boardLayout, cellAt, dragRect } from './boardMath';
import { useTheme } from './theme';
import { BoardDecor, PatternDefs, hasPattern, patternFill, useBoardSkin, useLooks, usePlayerColors } from './looks';
import { useReducedMotion } from './effects';

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
// every square can be counted (quieter than the rectangle's outline, so its shape still shows)
function SquareLines({ x, y, w, h, cell, width = 1, opacity = 0.45 }) {
  const lines = [];
  for (let i = 1; i < w; i++) lines.push(<Line key={`c${i}`} x1={(x + i) * cell} y1={y * cell} x2={(x + i) * cell} y2={(y + h) * cell} stroke="#fff" strokeOpacity={opacity} strokeWidth={width} />);
  for (let i = 1; i < h; i++) lines.push(<Line key={`r${i}`} x1={x * cell} y1={(y + i) * cell} x2={(x + w) * cell} y2={(y + i) * cell} stroke="#fff" strokeOpacity={opacity} strokeWidth={width} />);
  return lines;
}

// A rectangle's outline: dark and thick, just inside its edge, so two
// rectangles side by side show a clear line between them
const OUTLINE = 3.5;
function Outline({ x, y, w, h, cell, color }) {
  return <Rect x={x * cell + OUTLINE / 2} y={y * cell + OUTLINE / 2} width={w * cell - OUTLINE} height={h * cell - OUTLINE} fill="none" stroke={shade(color, -0.6)} strokeWidth={OUTLINE} />;
}

// drag: { c0, r0, c1, r1, verdict } while drawing (verdict: match.judge's); preview: the CPU's rectangle so
// far (hide: the placed one it grows into); counting: { rect, byRows, shown };
// onDraw(rect) when a drag ends. Tap to place instead: canTap, onTap({ c, r })
// for the square tapped, and tapped (the rectangle shown there, with valid).
export default function Board({ match, width, drag, preview, hide, counting, canDraw, onDrag, onDraw, canTap = false, onTap, tapped = null }) {
  const t = useTheme();
  const PLAYER_COLORS = usePlayerColors(); // (the Wardrobe's looks)
  const skin = useBoardSkin();
  const pattern = useLooks().pattern; // (on your own rectangles)
  const { size, board } = match;
  const { cell, side } = boardLayout(width, size);
  const start = useRef(null);
  const live = useRef({ canDraw, onDrag, onDraw, cell, size, canTap, onTap });
  live.current = { canDraw, onDrag, onDraw, cell, size, canTap, onTap };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => live.current.canDraw || live.current.canTap,
        onMoveShouldSetPanResponder: () => live.current.canDraw,
        onPanResponderTerminationRequest: () => false, // (don't let a scroll steal the drag)
        onPanResponderGrant: (e) => {
          const { cell: px, size: n } = live.current;
          const { c, r } = cellAt(e.nativeEvent.locationX, e.nativeEvent.locationY, px, n);
          start.current = { c0: c, r0: r, x0: e.nativeEvent.locationX, y0: e.nativeEvent.locationY };
          if (live.current.canTap) return; // (a tap: answered on release)
          live.current.onDrag({ c0: c, r0: r, c1: c, r1: r });
        },
        onPanResponderMove: (_, g) => {
          const s = start.current;
          if (!s || live.current.canTap) return;
          const { cell: px, size: n } = live.current;
          const { c, r } = cellAt(s.x0 + g.dx, s.y0 + g.dy, px, n);
          live.current.onDrag({ c0: s.c0, r0: s.r0, c1: c, r1: r });
        },
        onPanResponderRelease: (_, g) => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          if (live.current.canTap) return live.current.onTap({ c: s.c0, r: s.r0 });
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

  const fx = usePlaceEffect(match, useLooks().place);

  const box = (r, key, props) => <Rect key={key} x={r.x * cell} y={r.y * cell} width={r.w * cell} height={r.h * cell} {...props} />;
  const drawing = drag ? dragRect(drag) : null;

  return (
    <View style={[{ width: side, height: side, alignSelf: 'center' }, NO_SELECT]} {...responder.panHandlers} accessibilityLabel={`Board, ${size} by ${size}`}>
      <Svg width={side} height={side} pointerEvents="none">
        <PatternDefs kind={pattern} />
        <Rect x={0} y={0} width={side} height={side} fill={skin.bg} />
        <BoardDecor kind={skin.decor} side={side} cell={cell} />
        {Array.from({ length: size + 1 }, (_, i) => (
          <G key={i}>
            <Line x1={i * cell} y1={0} x2={i * cell} y2={side} stroke={skin.grid} strokeWidth={1} />
            <Line x1={0} y1={i * cell} x2={side} y2={i * cell} stroke={skin.grid} strokeWidth={1} />
          </G>
        ))}
        {board.rects.map((r, i) => {
          if (r === hide) return null;
          const color = PLAYER_COLORS[r.player % PLAYER_COLORS.length];
          const label = r.w * cell >= 34 && r.h * cell >= 22;
          return (
            <G key={`r${i}`}>
              {box(r, 'fill', { fill: color, fillOpacity: r.solved ? 0.85 : 0.5 })}
              {hasPattern(pattern) && match.players[r.player] && !match.players[r.player].cpu ? box(r, 'pattern', { fill: patternFill(pattern) }) : null}
              <SquareLines {...r} cell={cell} />
              <Outline {...r} cell={cell} color={color} />
              {label && r.solved ? (
                <SvgText x={(r.x + r.w / 2) * cell} y={(r.y + r.h / 2) * cell + 6} fill="#fff" fontFamily={FONT} fontSize={Math.min(18, cell * 0.6)} fontWeight="bold" textAnchor="middle">
                  {r.area}
                </SvgText>
              ) : null}
            </G>
          );
        })}
        {fx ? <PlaceEffect {...fx} cell={cell} color={PLAYER_COLORS[fx.rect.player % PLAYER_COLORS.length]} gold={t.gold} /> : null}
        {counting ? <CountingOverlay counting={counting} cell={cell} t={t} /> : null}
        {preview ? box(preview, 'cpu', { fill: PLAYER_COLORS[match.current % PLAYER_COLORS.length], fillOpacity: 0.35, stroke: skin.edge, strokeWidth: 2, strokeDasharray: '6 4' }) : null}
        {tapped ? <Drawing rect={tapped} verdict={{ ok: tapped.valid, fits: tapped.valid, rightSize: true, corner: true }} color={PLAYER_COLORS[match.current % PLAYER_COLORS.length]} cell={cell} side={side} t={t} skin={skin} /> : null}
        {drawing ? <Drawing rect={drawing} verdict={drag.verdict} color={PLAYER_COLORS[match.current % PLAYER_COLORS.length]} cell={cell} side={side} t={t} skin={skin} /> : null}
        <Rect x={1} y={1} width={side - 2} height={side - 2} fill="none" stroke={skin.edge} strokeWidth={2} />
      </Svg>
    </View>
  );
}

// The Wardrobe's placing effect: for a moment after one of your rectangles
// lands, { kind, rect, p } with p going from 0 to 1
const PLACE_FX_MS = 650;
function usePlaceEffect(match, kind) {
  const reduced = useReducedMotion();
  const [fx, setFx] = useState(null);
  const count = useRef(match.board.rects.length);
  const rects = match.board.rects;
  useEffect(() => {
    const before = count.current;
    count.current = rects.length;
    const rect = rects[rects.length - 1];
    const owner = rect && match.players[rect.player];
    if (rects.length !== before + 1 || kind === 'none' || reduced || !owner || owner.cpu) return undefined;
    const start = Date.now();
    let frame = null;
    const step = () => {
      const p = Math.min(1, (Date.now() - start) / PLACE_FX_MS);
      setFx(p < 1 ? { kind, rect, p } : null);
      if (p < 1) frame = requestAnimationFrame(step);
    };
    step();
    return () => {
      cancelAnimationFrame(frame);
      setFx(null);
    };
  }, [rects.length]);
  return fx;
}

function PlaceEffect({ kind, rect, p, cell, color, gold }) {
  const x = rect.x * cell;
  const y = rect.y * cell;
  const w = rect.w * cell;
  const h = rect.h * cell;
  if (kind === 'pop') {
    // a flash that shrinks onto the rectangle
    const grow = (1 - p) * cell * 0.4;
    return <Rect x={x - grow} y={y - grow} width={w + grow * 2} height={h + grow * 2} fill="#fff" fillOpacity={(1 - p) * 0.6} stroke={color} strokeOpacity={1 - p} strokeWidth={3} />;
  }
  if (kind === 'ripple') {
    // two rings spreading out from its edge
    return [0, 0.25].map((lag) => {
      const q = Math.max(0, Math.min(1, (p - lag) / (1 - lag)));
      const out = q * cell * 1.6;
      return <Rect key={lag} x={x - out} y={y - out} width={w + out * 2} height={h + out * 2} rx={out / 2} fill="none" stroke={color} strokeOpacity={(1 - q) * 0.9} strokeWidth={3} />;
    });
  }
  // glow: a golden edge that brightens and fades
  return <Rect x={x} y={y} width={w} height={h} fill={gold} fillOpacity={Math.sin(p * Math.PI) * 0.35} stroke={gold} strokeOpacity={Math.sin(p * Math.PI)} strokeWidth={6} />;
}

// The rectangle being drawn, labelled with its size, as on the web: the
// player's colour when it's right and fits, grey when the size is wrong, red
// when it bumps into another. The label sits above it (the finger is on it),
// or inside its top when there's no room above.
function Drawing({ rect, verdict, color, cell, side, t, skin }) {
  const tint = !verdict.fits ? t.bad : verdict.ok ? color : skin.wrong;
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
      <SvgText x={tx + tw / 2} y={ty + th / 2 + size * 0.35} fill={t.surface} fontFamily={FONT} fontSize={size} fontWeight="900" textAnchor="middle">
        {label}
      </SvgText>
    </G>
  );
}

// Skip-counting: the rows (or columns) counted so far light up, each with its running total
// everySquare: every counted square shows its number (1, 2, 3, then 4, 5, 6 …),
// the last of each row in bold: that's the running total. Without it only
// the running totals show (the board's squares are too small for more).
function CountingOverlay({ counting, cell, t, everySquare = false }) {
  const { rect, byRows, shown, group } = counting;
  const size = everySquare ? Math.min(22, cell * 0.42) : Math.min(16, cell * 0.5);
  const strips = [];
  for (let i = 0; i < shown; i++) {
    const strip = byRows ? { x: rect.x, y: rect.y + i, w: rect.w, h: 1 } : { x: rect.x + i, y: rect.y, w: 1, h: rect.h };
    // the squares along the strip, in counting order (left to right, or top to bottom)
    const squares = Array.from({ length: group }, (_, j) => (byRows ? { x: strip.x + j, y: strip.y } : { x: strip.x, y: strip.y + j }));
    const numbered = everySquare ? squares : squares.slice(-1);
    strips.push(
      <G key={i}>
        <Rect x={strip.x * cell} y={strip.y * cell} width={strip.w * cell} height={strip.h * cell} fill={t.gold} fillOpacity={0.9} />
        <SquareLines {...strip} cell={cell} width={1.5} opacity={0.6} />
        {numbered.map((sq) => {
          const n = i * group + (byRows ? sq.x - strip.x : sq.y - strip.y) + 1;
          const total = n === (i + 1) * group;
          return (
            <SvgText
              key={n}
              x={(sq.x + 0.5) * cell}
              y={(sq.y + 0.5) * cell + size * 0.35}
              fill={t.ink}
              fillOpacity={total ? 1 : 0.7}
              fontFamily={FONT}
              fontSize={total && everySquare ? size * 1.15 : size}
              fontWeight={total ? '900' : '600'}
              textAnchor="middle"
            >
              {n}
            </SvgText>
          );
        })}
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
  const pattern = useLooks().pattern;
  const cell = Math.max(8, Math.floor(Math.min(maxWidth / rect.w, maxHeight / rect.h, 56)));
  const width = cell * rect.w;
  const height = cell * rect.h;
  const at = { ...rect, x: 0, y: 0 };
  return (
    <View style={[{ width, height, alignSelf: 'center' }, NO_SELECT]} accessibilityLabel={`Your rectangle: ${rect.w} squares across and ${rect.h} down`}>
      <Svg width={width} height={height} pointerEvents="none">
        <PatternDefs kind={pattern} />
        <Rect x={0} y={0} width={width} height={height} fill={color} fillOpacity={0.85} />
        {hasPattern(pattern) ? <Rect x={0} y={0} width={width} height={height} fill={patternFill(pattern)} /> : null}
        {counting ? <CountingOverlay counting={{ ...counting, rect: at }} cell={cell} t={t} everySquare /> : null}
        <SquareLines x={0} y={0} w={rect.w} h={rect.h} cell={cell} width={1.5} opacity={0.55} />
        <Outline x={0} y={0} w={rect.w} h={rect.h} cell={cell} color={color} />
      </Svg>
    </View>
  );
}
