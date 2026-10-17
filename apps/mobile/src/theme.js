// The web game's colours (packages/ui/src/css/tokens.css), light and dark.
import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

const light = {
  bg: '#f6f1e7',
  paper: '#fffdf8',
  surface: '#ffffff',
  soft: '#f3eee4',
  ink: '#2b2a33',
  muted: '#6d6a75',
  line: '#ddd5c6',
  edge: '#2b2a33',
  accent: '#e4572e',
  accentButton: '#c4421c',
  accentInk: '#ffffff',
  accentSoft: '#fff1ec',
  good: '#2a9d5c',
  goodInk: '#1d6e41',
  goodBg: '#e6f6ec',
  bad: '#b0342a',
  badBg: '#fbe9e7',
  gold: '#e0a800',
  goldBg: '#fff6d6',
  goldInk: '#8a5a00',
  boardBg: '#ffffff',
  boardGrid: '#d9d2c3',
  boardEdge: '#2b2a33',
  boardWrong: '#8a8578',
};

const dark = {
  ...light,
  bg: '#16151b',
  paper: '#211f27',
  surface: '#2a2731',
  soft: '#322e3a',
  ink: '#ece9f2',
  muted: '#a8a3b4',
  line: '#3f3a49',
  edge: '#57525f',
  accent: '#ef6a44',
  accentButton: '#c94a26',
  accentSoft: '#3b2620',
  good: '#34a466',
  goodInk: '#86dba9',
  goodBg: '#1d3528',
  bad: '#e26c5e',
  badBg: '#3d2320',
  gold: '#f2c14e',
  goldBg: '#342c1c',
  goldInk: '#f0c96a',
  boardBg: '#1d1b22',
  boardGrid: '#3a3643',
  boardEdge: '#57525f',
  boardWrong: '#8f8a99',
};

// Players' colours: the Wardrobe's Classic set
export const PLAYER_COLORS = ['#e4572e', '#2e86de', '#2a9d5c', '#8e5bd6'];

// The Theme setting: 'auto' follows the device, 'light' or 'dark' forces one
export const ThemeSetting = createContext('auto');

export function useTheme() {
  const device = useColorScheme();
  const setting = useContext(ThemeSetting);
  return (setting === 'auto' ? device : setting) === 'dark' ? dark : light;
}
