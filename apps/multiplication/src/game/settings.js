// Settings: part of the multiplication game (split from the old js/game.js).

import { CPU_STEP_MS, DEFAULT_SETTINGS, SETTINGS_KEY } from './base.js';
import { game } from './play.js';

let settings;

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (saved) return { ...DEFAULT_SETTINGS, ...saved };
  } catch (_) {
    // storage unavailable or corrupt: fall back to defaults
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (_) {
    // not fatal: settings just won't persist
  }
}

function cpuStep() {
  return CPU_STEP_MS[(game || settings).cpuSpeed] || CPU_STEP_MS.normal;
}

// What this part does when the page loads (main.js runs every part in order)
export function run() {
  settings = loadSettings();
}

export { cpuStep, saveSettings, settings };
