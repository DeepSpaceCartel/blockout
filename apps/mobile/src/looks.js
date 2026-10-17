// The Wardrobe's looks in the app: which ones are worn (a context, so every
// screen can read them), and how each is drawn here. What a look is and who
// owns it is shared with the web game (@blockout/progress/cosmetics, /wardrobe);
// the colours are the web game's (dice-skins.css, wardrobe.css, render.js).
import { createContext, useContext } from 'react';
import { Circle, Defs, Line, Path, Pattern, Rect } from 'react-native-svg';
import * as Wardrobe from '@blockout/progress/wardrobe';
import * as Cosmetics from '@blockout/progress/cosmetics';
import { useTheme } from './theme';

// The looks being worn ({ dice, pips, roll, colors, … , title })
export const DEFAULT_LOOKS = { ...Object.fromEntries(Cosmetics.CATEGORIES.map((c) => [c.id, c.options[0].id])), title: 'none' };
export const Looks = createContext(DEFAULT_LOOKS);
export const useLooks = () => useContext(Looks);
export const useLook = (categoryId) => Wardrobe.look(useLooks(), categoryId);

// The players' colours (the Player colors look)
export const usePlayerColors = () => Wardrobe.playerColors(useLooks());

// Dice: face (two shades, top-left to bottom-right), edge, dots and number
const DICE_SKINS = {
  wood: { face: ['#d09b5a', '#b98244'], edge: '#6b4420', pip: '#3b240f' },
  candy: { face: ['#ffffff', '#ffb3c7'], edge: '#d6336c', pip: '#a61e4d' },
  glass: { face: ['#e4f2ff', '#b8dcff'], edge: '#3c82c8', pip: '#1d5fa0' },
  neon: { face: ['#1c1838', '#120f24'], edge: '#3cf2ff', pip: '#ff4fd8', num: '#3cf2ff' },
  galaxy: { face: ['#6a4bc4', '#0d0b26'], edge: '#8f7cff', pip: '#ffffff' },
  golden: { face: ['#fff3b0', '#d99a1c'], edge: '#9a6a0c', pip: '#4a3200' },
  pumpkin: { face: ['#ffb04a', '#c85a00'], edge: '#7a3500', pip: '#2b1200' },
};
// (a die's skin: these dice and dots, in theme t)
export function diceSkin(t, diceId, pipsId) {
  const base = DICE_SKINS[diceId] || { face: [t.surface, t.surface], edge: t.edge, pip: t.ink };
  const pips = Cosmetics.option('pips', pipsId);
  return { id: DICE_SKINS[diceId] ? diceId : 'classic', ...base, num: base.num || base.pip, glyph: (pips && pips.glyph) || null };
}
export function useDiceSkin() {
  const looks = useLooks();
  return diceSkin(useTheme(), looks.dice, looks.pips);
}

// Keypads: keys, ✓ and ⌫ ({ bg, edge, ink }), and corner rounding
const KEYPAD_SKINS = {
  candy: {
    key: { bg: '#ffc4d6', edge: '#d6336c', ink: '#7a1340' },
    check: { bg: '#9fe4b9', edge: '#d6336c', ink: '#0f4d2a' },
    back: { bg: '#ffb38b', edge: '#d6336c', ink: '#6b2400' },
    radius: 16,
  },
  retro: {
    key: { bg: '#dbd6c6', edge: '#5c5747', ink: '#2a271f' },
    check: { bg: '#e5943a', edge: '#5c5747', ink: '#2a1500' },
    back: { bg: '#6c6756', edge: '#5c5747', ink: '#ffffff' },
    radius: 6,
    mono: true,
  },
  neon: {
    key: { bg: '#120f24', edge: '#3cf2ff', ink: '#3cf2ff' },
    check: { bg: '#0e1d14', edge: '#7dff9a', ink: '#7dff9a' },
    back: { bg: '#22101d', edge: '#ff4fd8', ink: '#ff4fd8' },
    radius: 12,
  },
};
export const keypadSkin = (t, id) =>
  KEYPAD_SKINS[id] || {
    key: { bg: t.surface, edge: t.line, ink: t.ink },
    check: { bg: t.good, edge: t.line, ink: '#fff' },
    back: { bg: t.surface, edge: t.line, ink: t.ink },
    radius: 12,
  };
export const useKeypadSkin = () => keypadSkin(useTheme(), useLooks().keypad);

// Boards: colours plus a little decoration. Graph paper follows the theme.
const BOARD_SKINS = {
  notebook: { bg: '#fdfdf6', grid: '#b9d3ea', edge: '#2b2a33', fade: 'rgba(253, 253, 246, 0.65)', decor: 'notebook' },
  chalkboard: { bg: '#2f4f3a', grid: 'rgba(255, 255, 255, 0.16)', edge: '#1b3024', fade: 'rgba(47, 79, 58, 0.7)', wrong: '#c9d6cc', decor: 'chalk' },
  beach: { bg: '#f4e1b0', grid: 'rgba(150, 110, 50, 0.25)', edge: '#b58a4a', fade: 'rgba(244, 225, 176, 0.65)', decor: 'sand' },
  space: { bg: '#10143a', grid: 'rgba(255, 255, 255, 0.12)', edge: '#3a3f7a', fade: 'rgba(16, 20, 58, 0.7)', wrong: '#aab0e0', decor: 'stars' },
  snow: { bg: '#eef6ff', grid: '#c8dcf0', edge: '#7a9cc0', fade: 'rgba(238, 246, 255, 0.65)', decor: 'flakes' },
};
export const boardSkin = (t, id) => ({ bg: t.boardBg, grid: t.boardGrid, edge: t.boardEdge, wrong: t.boardWrong, decor: null, ...BOARD_SKINS[id] });
export const useBoardSkin = () => boardSkin(useTheme(), useLooks().board);

// Repeatable pseudo-random numbers, so the decoration stays put
function decorRandom(seed) {
  let a = seed;
  return () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
}

// A board's decoration under the grid (the web's drawBoardDecor, for a side × side board)
export function BoardDecor({ kind, side, cell }) {
  if (kind === 'notebook') return <Line x1={cell * 0.5} y1={0} x2={cell * 0.5} y2={side} stroke="rgba(230, 110, 110, 0.7)" strokeWidth={2} />;
  if (!kind) return null;
  const r = decorRandom(7);
  // (the web board is about 600 px; fewer specks on a smaller one)
  const count = Math.round((kind === 'sand' ? 260 : kind === 'chalk' ? 40 : 90) * Math.min(1, side / 600) ** 2) + 10;
  const dots = [];
  for (let i = 0; i < count; i++) {
    const x = r() * side;
    const y = r() * side;
    const size = kind === 'chalk' ? 6 + r() * 14 : 0.6 + r() * (kind === 'flakes' ? 2.2 : 1.6);
    const fill =
      kind === 'stars' ? `rgba(255, 255, 255, ${(0.35 + r() * 0.6).toFixed(2)})` :
      kind === 'flakes' ? 'rgba(160, 190, 225, 0.6)' :
      kind === 'sand' ? 'rgba(160, 120, 60, 0.35)' : 'rgba(255, 255, 255, 0.05)';
    dots.push(<Circle key={i} cx={x} cy={y} r={size} fill={fill} />);
  }
  return dots;
}

// Rectangle patterns: light marks over your own rectangles. <PatternDefs />
// goes once in the Svg; fill a rectangle with patternFill(kind).
const MARK = 'rgba(255, 255, 255, 0.35)';
const TILES = {
  stripes: <Path d="M-4 20 L20 -4 M-4 4 L4 -4 M12 20 L20 12" stroke={MARK} strokeWidth={3} />,
  dots: [<Circle key="a" cx={4} cy={4} r={2.5} fill={MARK} />, <Circle key="b" cx={12} cy={12} r={2.5} fill={MARK} />],
  bricks: [<Rect key="a" x={0} y={0.75} width={16} height={7.5} fill="none" stroke={MARK} strokeWidth={1.5} />, <Line key="b" x1={8} y1={8} x2={8} y2={16} stroke={MARK} strokeWidth={1.5} />],
  checker: [<Rect key="a" x={0} y={0} width={8} height={8} fill={MARK} />, <Rect key="b" x={8} y={8} width={8} height={8} fill={MARK} />],
  wood: <Path d="M0 4 C5 2 11 6 16 4 M0 11 C5 13 11 9 16 11" fill="none" stroke={MARK} strokeWidth={1.5} />,
};
export const hasPattern = (kind) => Boolean(TILES[kind]);
export const patternFill = (kind) => `url(#pattern-${kind})`;
export function PatternDefs({ kind }) {
  if (!TILES[kind]) return null;
  return (
    <Defs>
      <Pattern id={`pattern-${kind}`} patternUnits="userSpaceOnUse" x={0} y={0} width={16} height={16}>
        {TILES[kind]}
      </Pattern>
    </Defs>
  );
}
