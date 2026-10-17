import test from 'node:test';
import assert from 'node:assert';
import * as Progress from '../src/progress.js';
import * as Settings from '../src/settings.js';

test('every choice but the default (and the theme) is a Shop item', () => {
  assert.equal(Settings.unlockFor('theme', 'dark'), null);
  assert.equal(Settings.unlockFor('cpuSpeed', 'normal'), null);
  assert.equal(Settings.unlockFor('showProgress', 'false'), null, 'stored as a boolean, compared as text');
  assert.equal(Settings.unlockFor('cpuSteps', 'instant'), 'cpuInstant');
  assert.equal(Settings.unlockFor('answerTime', '10'), 'answerTime10');
  assert.equal(Settings.unlockFor('placeMode', 'auto'), 'placeAuto');
  for (const s of Settings.SETTINGS) {
    for (const o of s.options) {
      const id = Settings.unlockFor(s.key, o.value);
      if (id) assert.ok(Progress.shopItem(id), `${s.key}=${o.value} needs ${id}, a Shop item`);
    }
  }
});

test('choices that are not unlocked go back to the default; settings that are gone go', () => {
  const state = Progress.createProgress();
  const out = Settings.enforce({ cpuSpeed: 'fast', theme: 'dark', showProgress: true }, state);
  assert.equal(out.cpuSpeed, 'normal');
  assert.equal(out.theme, 'dark');
  assert.equal(out.showProgress, false);
  state.unlocks.push('cpuSpeed', 'showProgress', 'placeAuto');
  assert.equal(Settings.enforce({ cpuSpeed: 'fast', showProgress: true }, state).cpuSpeed, 'fast');
  assert.equal(Settings.enforce({ showProgress: true }, state).showProgress, true);
  // the corner rule, real dice, "only roll what fits" and click to place are gone
  const old = Settings.enforce({ firstInCorner: true, diceMode: 'real', fitRolls: 'never', placeMode: 'click', cosmetics: { dice: 'gold' } }, state);
  assert.deepEqual([old.firstInCorner, old.diceMode, old.fitRolls, old.placeMode], [undefined, undefined, undefined, 'draw']);
  assert.ok(!('diceMode' in old));
  assert.deepEqual(old.cosmetics, { dice: 'gold' }, 'anything else is kept');
  assert.equal(Settings.enforce({ placeMode: 'auto' }, state).placeMode, 'auto');
});

test('every setting has a label, choices, and a default among them', () => {
  for (const s of Settings.SETTINGS) {
    assert.ok(s.label && s.options.length >= 2, s.key);
    assert.ok(s.options.some((o) => String(o.value) === String(Settings.DEFAULT_SETTINGS[s.key])), `${s.key}'s default is a choice`);
  }
  const show = Settings.showsTime({ timesMastered: 'time', timesLearning: 'icon', timesPractice: 'icon' });
  assert.equal(show('mastered'), true);
  assert.equal(show('learning'), false);
});
