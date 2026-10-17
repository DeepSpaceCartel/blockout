import test from 'node:test';
import assert from 'node:assert';
import * as P from '../src/progress.js';

test('answer bonuses: first try, speedy and streak', () => {
  assert.deepEqual(P.answerBonus({ firstTry: false, ms: 1000, streak: 0 }), { total: 0, parts: [] });
  assert.equal(P.answerBonus({ firstTry: true, ms: 9000, streak: 1 }).total, 2);
  assert.equal(P.answerBonus({ firstTry: true, ms: 4000, streak: 1 }).total, 5);
  assert.equal(P.answerBonus({ firstTry: true, ms: 4000, streak: 3 }).total, 6);
  assert.equal(P.answerBonus({ firstTry: true, ms: 9000, streak: 20 }).total, 2 + 5);
});

// Mark every fact up to size × size as mastered for "You" (skip = keys to leave out).
function master(s, size, skip = new Set()) {
  const key = P.playerKey('You');
  s.facts[key] = s.facts[key] || { name: 'You', facts: {} };
  for (let a = 1; a <= size; a++) {
    for (let b = 1; b <= size; b++) {
      const k = P.factKey(a, b);
      if (!skip.has(k)) s.facts[key].facts[k] = { asked: 3, firstTry: 3, wrong: 0, timeouts: 0, said: [], times: [] };
    }
  }
}

test('shop: buying needs points, prerequisites, and only happens once', () => {
  const s = P.createProgress();
  assert.equal(P.isUnlocked(s, null), true);
  assert.deepEqual(P.buy(s, 'multiplayer'), { ok: false, reason: 'points', missing: 150 });
  s.wallet = 1000;
  assert.deepEqual(P.buy(s, 'players3'), { ok: false, reason: 'requires', requires: 'multiplayer' });
  assert.deepEqual(P.buy(s, 'multiplayer'), { ok: true });
  assert.equal(s.wallet, 850);
  assert.equal(P.isUnlocked(s, 'multiplayer'), true);
  assert.deepEqual(P.buy(s, 'multiplayer'), { ok: false, reason: 'owned' });
  // boards and difficulties come from the Journey, never the wallet
  assert.deepEqual(P.buy(s, 'board8'), { ok: false, reason: 'journey', level: 8 });
  assert.deepEqual(P.buy(s, 'difficulty.hard'), { ok: false, reason: 'journey', level: 9 });
  assert.equal(s.wallet, 850);
  assert.deepEqual(P.buy(s, 'goldenDice'), { ok: false, reason: 'points', missing: 10000 - 850 });
  s.wallet = 10000;
  assert.equal(P.buy(s, 'goldenDice').ok, true);
  assert.equal(s.wallet, 0);
});

test('modes: multiplayer, 3 and 4 players, practice and expert unlock in order', () => {
  const s = P.createProgress();
  s.wallet = 1000;
  assert.equal(P.buy(s, 'players3').reason, 'requires');
  assert.equal(P.buy(s, 'practiceExpert').reason, 'requires');
  assert.equal(P.buy(s, 'multiplayer').ok, true);
  assert.equal(P.buy(s, 'players4').reason, 'requires'); // 3 players comes first
  assert.equal(P.buy(s, 'players3').ok, true);
  assert.equal(P.buy(s, 'players4').ok, true);
  assert.equal(P.buy(s, 'practice').ok, true);
  assert.equal(P.buy(s, 'practiceExpert').ok, true);
  assert.equal(s.wallet, 1000 - 150 - 100 - 100 - 100 - 200);
});

test('daily check-in: once a day, streak grows on consecutive days', () => {
  const s = P.createProgress();
  assert.deepEqual(P.checkIn(s, new Date(2026, 8, 20, 9)), { bonus: 20, streak: 1 });
  assert.equal(P.checkIn(s, new Date(2026, 8, 20, 18)), null);
  assert.deepEqual(P.checkIn(s, new Date(2026, 8, 21, 7)), { bonus: 25, streak: 2 });
  assert.deepEqual(P.checkIn(s, new Date(2026, 8, 22, 7)), { bonus: 30, streak: 3 });
  assert.deepEqual(P.checkIn(s, new Date(2026, 8, 25, 7)), { bonus: 20, streak: 1 });
  assert.equal(s.wallet, 20 + 25 + 30 + 20);
  // across a month boundary
  const t = P.createProgress();
  P.checkIn(t, new Date(2026, 8, 30));
  assert.equal(P.checkIn(t, new Date(2026, 9, 1)).streak, 2);
});

test('achievements are awarded once and pay their reward', () => {
  const s = P.createProgress();
  // right, quick and big, but not first time (a wrong answer, or "Help me count"): none of those
  assert.deepEqual(P.awardAchievements(P.createProgress(), { event: 'answer', correct: true, firstTry: false, ms: 2000, streak: 0, a: 6, b: 12 }), []);
  const first = P.awardAchievements(s, { event: 'answer', correct: true, firstTry: true, ms: 2000, streak: 5, a: 6, b: 6 });
  assert.deepEqual(first.map((a) => a.id).sort(), ['big_block', 'speedy', 'streak5']);
  assert.equal(s.wallet, 15 + 15 + 20);
  assert.deepEqual(P.awardAchievements(s, { event: 'answer', correct: true, firstTry: true, ms: 2000, streak: 5, a: 6, b: 6 }), []);
  const game = P.awardAchievements(s, { event: 'game', games: 1, wonVsCpu: true, humanWon: true, full: true, perfect: false, difficulty: 'easy' });
  assert.deepEqual(game.map((a) => a.id).sort(), ['first_game', 'first_win', 'full_house']);
});

test('lifetime facts keep each order separate and remember wrong answers', () => {
  const s = P.createProgress();
  P.recordAnswer(s, 'Maya', { a: 4, b: 3, firstTry: false, correct: true, wrongAnswers: [11, 13], ms: 6000 });
  P.recordAnswer(s, 'maya ', { a: 4, b: 3, firstTry: false, correct: false, timeout: true });
  P.recordAnswer(s, 'Maya', { a: 3, b: 4, firstTry: true, correct: true, ms: 2000 });
  const f = s.facts.maya.facts['4 × 3'];
  assert.deepEqual(
    { asked: f.asked, firstTry: f.firstTry, right: f.right, wrong: f.wrong, timeouts: f.timeouts, said: f.said, timed: f.timed },
    { asked: 2, firstTry: 0, right: 1, wrong: 2, timeouts: 1, said: [11, 13], timed: 1 }
  );
  assert.equal(P.factStatus(f), 'practice');
  const g = s.facts.maya.facts['3 × 4'];
  assert.deepEqual({ asked: g.asked, firstTry: g.firstTry }, { asked: 1, firstTry: 1 });
  assert.equal(P.factStatus(g), 'learning');
  assert.equal(P.factStatus({ asked: 4, firstTry: 4, wrong: 0, timeouts: 0 }), 'mastered');
  assert.equal(P.factStatus(undefined), 'unseen');
});

test('old saves (both orders merged) are split into both orders once', () => {
  const old = { wallet: 5, facts: { leo: { name: 'Leo', facts: { '3 × 5': { asked: 2, firstTry: 1, right: 2, wrong: 1, timeouts: 0, said: [14], totalMs: 8000, timed: 2 }, '4 × 4': { asked: 1, firstTry: 1, right: 1, wrong: 0, timeouts: 0, said: [], totalMs: 0, timed: 0 } } } } };
  const s = P.normalize(old);
  assert.equal(s.factsOrdered, true);
  assert.deepEqual(s.facts.leo.facts['5 × 3'], s.facts.leo.facts['3 × 5']);
  assert.notEqual(s.facts.leo.facts['5 × 3'].said, s.facts.leo.facts['3 × 5'].said, 'copies, not shared');
  assert.deepEqual(Object.keys(s.facts.leo.facts).sort(), ['3 × 5', '4 × 4', '5 × 3']);
  // already-ordered saves are left alone
  const again = P.normalize(JSON.parse(JSON.stringify({ ...s, facts: { leo: { name: 'Leo', facts: { '3 × 5': s.facts.leo.facts['3 × 5'] } } } })));
  assert.deepEqual(Object.keys(again.facts.leo.facts), ['3 × 5']);
});

test('practice picks favour the exact order that needs work, within the table size', () => {
  const s = P.createProgress();
  // 6 × 5 needs practice; every other 1..6 fact, including 5 × 6, is mastered
  for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) {
    const weak = a === 6 && b === 5;
    for (let i = 0; i < 4; i++) P.recordAnswer(s, 'Maya', { a, b, firstTry: !weak, correct: true, wrongAnswers: weak ? [35] : [] });
  }
  const facts = s.facts.maya.facts;
  let weakHits = 0;
  let flippedHits = 0;
  for (let round = 0; round < 200; round++) {
    const picks = P.pickPracticeFacts(facts, 6, 5);
    assert.equal(picks.length, 5);
    const keys = picks.map(([a, b]) => P.factKey(a, b));
    assert.equal(new Set(keys).size, 5, 'no repeats within a round');
    for (const [a, b] of picks) assert.ok(a >= 1 && b >= 1 && a <= 6 && b <= 6);
    if (keys.includes('6 × 5')) weakHits++;
    if (keys.includes('5 × 6')) flippedHits++;
  }
  assert.ok(weakHits > 150, `6 × 5 should come up in most rounds (was ${weakHits}/200)`);
  assert.ok(flippedHits < weakHits / 3, `5 × 6 is mastered and should come up much less (${flippedHits})`);
});

test('practice with no history uses unseen facts; tiny tables repeat', () => {
  const picks = P.pickPracticeFacts({}, 12, 20);
  assert.equal(picks.length, 20);
  assert.ok(picks.some(([a, b]) => a > 6 || b > 6), 'goes up to the table size');
  assert.equal(P.pickPracticeFacts({}, 1, 3).length, 3); // only 1 × 1 exists
});

test('best time per fact, with the average as a fallback for old saves', () => {
  const s = P.createProgress();
  P.recordAnswer(s, 'Leo', { a: 2, b: 3, firstTry: true, correct: true, ms: 4000 });
  P.recordAnswer(s, 'Leo', { a: 2, b: 3, firstTry: true, correct: true, ms: 2500 });
  P.recordAnswer(s, 'Leo', { a: 3, b: 2, firstTry: true, correct: true, ms: 1000 }); // the other order
  assert.equal(P.factBestMs(s.facts.leo.facts['2 × 3']), 2500);
  assert.equal(P.factBestMs(s.facts.leo.facts['3 × 2']), 1000);
  assert.equal(P.factBestMs({ timed: 2, totalMs: 7000 }), 3500);
  assert.equal(P.factBestMs({ timed: 0, totalMs: 0 }), null);
});

test('times-table line achievements need both orders: learner then master', () => {
  const s = P.createProgress();
  const answer = (a, b) => {
    P.recordAnswer(s, 'Leo', { a, b, firstTry: true, correct: true, ms: 3000 });
    return P.awardAchievements(s, { event: 'answer', correct: true, firstTry: true, ms: 3000, streak: 0, a, b, facts: s.facts.leo.facts, size: 6 }).map((x) => x.id);
  };
  // ×3 on Easy: 3 × 1 … 3 × 6 alone isn't enough …
  for (let m = 1; m <= 6; m++) assert.ok(!answer(3, m).includes('table3_learn'));
  // … the other order 1 × 3 … 6 × 3 completes it
  let got = [];
  for (let m = 1; m <= 6; m++) got.push(...answer(m, 3));
  assert.ok(got.includes('table3_learn'));
  // Mastered: 3 first-try answers on every fact in both orders
  got = [];
  for (let round = 0; round < 2; round++) for (let m = 1; m <= 6; m++) got.push(...answer(3, m), ...answer(m, 3));
  assert.ok(got.includes('table3_master'));
  assert.ok(!P.ACHIEVEMENTS.find((a) => a.id === 'table7_learn').check({ event: 'answer', facts: s.facts.leo.facts, size: 6 }));
  assert.equal(P.ACHIEVEMENTS.filter((a) => a.group === 'Times tables').length, 24);
});

test('practice can be limited to chosen times tables', () => {
  for (let round = 0; round < 100; round++) {
    const picks = P.pickPracticeFacts({}, 8, 10, Math.random, [3, 7]);
    assert.equal(picks.length, 10);
    for (const [a, b] of picks) assert.ok([a, b].includes(3) || [a, b].includes(7), `${a} × ${b} is not a 3 or 7 fact`);
  }
  // one table on Easy has only 6 facts, so a 10-question round repeats some
  const threes = P.pickPracticeFacts({}, 6, 10, Math.random, [3]);
  assert.equal(threes.length, 10);
  assert.ok(threes.every(([a, b]) => a === 3 || b === 3));
  // tables beyond the table size are ignored; none left means the whole table (36 ordered facts)
  const all = P.pickPracticeFacts({}, 6, 36, Math.random, [9]);
  assert.equal(new Set(all.map(([a, b]) => P.factKey(a, b))).size, 36);
});

test('old timer unlock becomes the 30 s and 10 s unlocks', () => {
  const s = P.normalize({ unlocks: ['answerTime', 'cpuSpeed'] });
  assert.deepEqual(s.unlocks.sort(), ['answerTime10', 'answerTime30', 'cpuSpeed']);
  // now a chain: 30 s, then 10 s, then 5 s
  assert.equal(P.shopItem('answerTime10').requires, 'answerTime30');
  assert.equal(P.shopItem('answerTime5').requires, 'answerTime10');
});

test('skill trees: only the next step in a chain shows; the rest are hidden', () => {
  const s = P.createProgress();
  s.wallet = 5000;
  assert.equal(P.isHidden(s, 'answerTime10'), true);
  assert.equal(P.isHidden(s, 'answerTime30'), false);
  assert.equal(P.nextInChain(s, 'answerTime5'), 'answerTime30');
  P.buy(s, 'answerTime30');
  assert.equal(P.isHidden(s, 'answerTime10'), false);
  assert.equal(P.isHidden(s, 'answerTime5'), true);
  // Journey unlocks stay hidden until their level is reached
  assert.equal(P.isHidden(s, 'board8'), true);
  assert.equal(P.isHidden(P.normalize({ ...s, journey: { level: 8 } }), 'board8'), false);
});

test('Times Table readiness: most facts mastered and none needing practice', () => {
  const s = P.createProgress();
  assert.deepEqual(P.tableReady(s, 6), { ok: false, size: 6, mastered: 0, need: 27, total: 36, practice: 0 });
  // 26 of 36 mastered: not yet
  const skip = new Set();
  for (let b = 1; b <= 6; b++) skip.add(P.factKey(6, b));
  for (let b = 1; b <= 4; b++) skip.add(P.factKey(5, b));
  master(s, 6, skip);
  assert.equal(P.tableReady(s, 6).mastered, 26);
  assert.equal(P.tableReady(s, 6).ok, false);
  // 27: yes, unless something needs practice
  master(s, 6, new Set([...skip].slice(1)));
  assert.equal(P.tableReady(s, 6).ok, true);
  s.facts[P.playerKey('You')].facts[P.factKey(6, 6)] = { asked: 4, firstTry: 1, wrong: 3, timeouts: 0, said: [], times: [] };
  assert.equal(P.tableReady(s, 6).ok, false);
});

test('practice: 5 questions come with it; 10, 20 and each times table are bought in order', () => {
  const s = P.createProgress();
  s.wallet = 5000;
  assert.equal(P.isHidden(s, 'table1'), true); // needs Practice mode first
  P.buy(s, 'practice');
  assert.equal(P.isUnlocked(s, 'practice10'), false);
  assert.equal(P.buy(s, 'practice20').reason, 'requires');
  assert.equal(P.buy(s, 'practice10').ok, true);
  assert.equal(P.buy(s, 'practice20').ok, true);
  assert.equal(P.isHidden(s, 'table1'), false);
  assert.equal(P.buy(s, 'table2').reason, 'requires');
  for (let n = 1; n <= 12; n++) assert.equal(P.buy(s, `table${n}`).ok, true, `table${n}`);
  // players who bought Practice before keep 10, 20 and every table
  const old = P.normalize({ unlocks: ['practice'] });
  for (const id of ['practice10', 'practice20', 'table1', 'table12']) assert.ok(P.isUnlocked(old, id), id);
  // and a new save that buys it later doesn't get them free
  const later = P.normalize({ ...P.normalize(null), unlocks: ['practice'] });
  assert.equal(P.isUnlocked(later, 'table1'), false);
});

test('best-score tiers: one game can unlock several at once, each only once', () => {
  const s = P.createProgress();
  const game = (bestScore) => P.awardAchievements(s, { event: 'game', games: 1, bestScore }).map((a) => a.id).filter((id) => id.startsWith('score'));
  assert.deepEqual(game(49), []);
  assert.deepEqual(game(160), ['score50', 'score100', 'score150']);
  assert.deepEqual(game(160), []);
  assert.deepEqual(game(420), ['score250', 'score400']);
  assert.equal(P.ACHIEVEMENTS.filter((a) => a.group === 'Scores').length, 5);
});

test('fact speed tiers: mastered plus best time under 10, 5 and 1 seconds, per fact and order', () => {
  assert.equal(P.ACHIEVEMENTS.filter((a) => a.group === 'Fact speed').length, 144 * 3);
  const s = P.createProgress();
  const answer = (a, b, ms) => {
    P.recordAnswer(s, 'Leo', { a, b, firstTry: true, correct: true, ms });
    return P.awardAchievements(s, { event: 'answer', correct: true, firstTry: true, ms, streak: 0, a, b, facts: s.facts.leo.facts, size: 12 })
      .map((x) => x.id).filter((id) => id.startsWith('fact_'));
  };
  // not mastered yet after 1-2 answers, even if fast
  assert.deepEqual(answer(7, 8, 4000), []);
  assert.deepEqual(answer(7, 8, 6000), []);
  // third first-try answer → mastered, best 4 s → 10 s and 5 s tiers
  assert.deepEqual(answer(7, 8, 9000).sort(), ['fact_7x8_10', 'fact_7x8_5']);
  assert.deepEqual(answer(7, 8, 800), ['fact_7x8_1']);
  // 8 × 7 is a different fact
  assert.deepEqual(answer(8, 7, 500), []);
});

test('normalize fills in missing fields', () => {
  const s = P.normalize({ wallet: 42, unlocks: ['cpuSpeed'] });
  assert.equal(s.wallet, 42);
  assert.deepEqual(s.unlocks, ['cpuSpeed']);
  assert.deepEqual(s.checkIn, { last: null, streak: 0 });
  assert.deepEqual(s.journey, { level: 1 });
  assert.deepEqual(P.normalize(null), P.createProgress());
});

test('boards: only 6×6 is free; players from before keep 12×12', () => {
  const fresh = P.createProgress();
  assert.equal(P.isUnlocked(fresh, 'board12'), false);
  for (const id of ['board8', 'board10', 'board12', 'board24']) assert.ok(P.shopItem(id), id);
  // an older save that has played a game gets 12×12
  const veteran = P.normalize({ wallet: 5, counters: { games: 3 } });
  assert.equal(P.isUnlocked(veteran, 'board12'), true);
  // an older save that never played doesn't
  assert.equal(P.isUnlocked(P.normalize({ wallet: 20 }), 'board12'), false);
  // and it only happens once: a new save that plays later still has to buy it
  const later = P.normalize({ ...P.normalize(null), counters: { games: 4 } });
  assert.equal(P.isUnlocked(later, 'board12'), false);
});

test('help me count: finding it, learning from it, and doing without it', () => {
  const s = P.createProgress();
  const ids = (list) => list.map((a) => a.id);
  assert.deepEqual(ids(P.awardAchievements(s, { event: 'help' })), ['help_first']);
  P.noteHelp(s, 6, 7);
  // the same question, answered after the help, isn't first try: nothing yet
  assert.equal(P.learnedAfterHelp(s, 6, 7, false), false);
  // another fact doesn't count
  assert.equal(P.learnedAfterHelp(s, 7, 6, true), false);
  // later, right first time: got it
  assert.equal(P.learnedAfterHelp(s, 6, 7, true), true);
  assert.ok(ids(P.awardAchievements(s, { event: 'answer', correct: true, firstTry: true, a: 6, b: 7, ms: 9000, streak: 1, learned: true })).includes('help_learned'));
  assert.equal(P.learnedAfterHelp(s, 6, 7, true), false); // only once per help
  assert.ok(ids(P.awardAchievements(s, { event: 'game', games: 1, noHelp: true })).includes('help_none'));
});

test('practice: finishing a longer round earns more than in proportion (doubled on Expert)', () => {
  assert.equal(P.practiceFinishBonus(5), 0);
  assert.equal(P.practiceFinishBonus(10), 15);
  assert.equal(P.practiceFinishBonus(20), 40);
  assert.ok(P.practiceFinishBonus(20) > 2 * P.practiceFinishBonus(10));
  assert.equal(P.practiceFinishBonus(20, true), 80);
});

test('expert practice timers: their own chain after Expert (30 s, then 10 s, then 5 s)', () => {
  const s = P.createProgress();
  s.wallet = 5000;
  assert.equal(P.buy(s, 'practiceTimer30').reason, 'requires'); // needs Expert first
  P.buy(s, 'practice');
  P.buy(s, 'practiceExpert');
  assert.equal(P.isHidden(s, 'practiceTimer30'), false);
  assert.equal(P.isHidden(s, 'practiceTimer10'), true);
  assert.equal(P.buy(s, 'practiceTimer30').ok, true);
  assert.equal(P.buy(s, 'practiceTimer5').reason, 'requires');
  assert.equal(P.buy(s, 'practiceTimer10').ok, true);
  assert.equal(P.buy(s, 'practiceTimer5').ok, true);
  // Expert players who had the game timers keep the same lengths in practice
  const old = P.normalize({ unlocks: ['practice', 'practiceExpert', 'answerTime30', 'answerTime10'] });
  assert.ok(P.isUnlocked(old, 'practiceTimer30') && P.isUnlocked(old, 'practiceTimer10'));
  assert.equal(P.isUnlocked(old, 'practiceTimer5'), false);
});

test('timer bonus: all of it for an instant answer, none when time runs out; shorter timers pay more', () => {
  assert.equal(P.timerBonus(30, 1), 2);
  assert.equal(P.timerBonus(10, 1), 4);
  assert.equal(P.timerBonus(5, 1), 6);
  for (const secs of [30, 10, 5]) assert.equal(P.timerBonus(secs, 0), 0);
  // quicker is better
  assert.ok(P.timerBonus(5, 0.9) > P.timerBonus(5, 0.1));
  // at the same answer time (1.5 s, 3 s), a shorter timer earns at least as much
  for (const s of [1.5, 3]) {
    const at = (secs) => P.timerBonus(secs, 1 - s / secs);
    assert.ok(at(5) >= at(10) && at(10) >= at(30), `answer in ${s} s`);
  }
  // only first-try answers get it, as its own bonus part
  const b = P.answerBonus({ firstTry: true, ms: 2000, streak: 1, timer: { secs: 10, left: 0.8 } });
  assert.ok(b.parts.some((p) => p.label === 'timer 10 s' && p.points === 4));
  assert.equal(P.answerBonus({ firstTry: false, ms: 2000, streak: 0, timer: { secs: 10, left: 0.8 } }).total, 0);
});

test('board finishing bonus: nothing on 6×6, growing faster than the board; custom sizes round down', () => {
  assert.equal(P.boardFinishBonus(6), 0);
  assert.deepEqual([8, 10, 12, 16, 20, 24].map(P.boardFinishBonus), [5, 10, 20, 40, 70, 100]);
  assert.equal(P.boardFinishBonus(14), 20); // custom: the biggest standard board it reaches
  assert.equal(P.boardFinishBonus(30), 100);
});

test('expert practice timers are unlocked separately for each difficulty', () => {
  const s = P.createProgress();
  s.wallet = 5000;
  for (const id of ['practice', 'practiceExpert', 'practiceTimer30', 'practiceTimer10', 'practiceTimer5']) assert.equal(P.buy(s, id).ok, true, id);
  // mastering Easy's 5 s doesn't give Medium's
  assert.equal(P.practiceTimerId(5, 'medium'), 'practiceTimer5.medium');
  assert.equal(P.isUnlocked(s, 'practiceTimer5.medium'), false);
  assert.equal(P.buy(s, 'practiceTimer30.medium').reason, 'requires'); // needs Medium's Expert first
  s.unlocks.push('difficulty.medium');
  // Expert itself is unlocked for each difficulty
  assert.equal(P.practiceExpertId('medium'), 'practiceExpert.medium');
  assert.equal(P.isUnlocked(s, 'practiceExpert.medium'), false);
  assert.equal(P.isHidden(s, 'practiceTimer30.medium'), true);
  assert.equal(P.buy(s, 'practiceExpert.medium').ok, true);
  assert.equal(P.isHidden(s, 'practiceTimer30.medium'), false);
  assert.equal(P.isHidden(s, 'practiceTimer10.medium'), true);
  assert.equal(P.buy(s, 'practiceTimer30.medium').ok, true);
  assert.equal(P.buy(s, 'practiceTimer5.medium').reason, 'requires');
});

test('practice lengths are unlocked separately for each difficulty', () => {
  const s = P.createProgress();
  s.wallet = 5000;
  for (const id of ['practice', 'practice10', 'practice20']) assert.equal(P.buy(s, id).ok, true, id);
  assert.equal(P.practiceCountId(5, 'hard'), null); // 5 always comes with Practice mode
  assert.equal(P.practiceCountId(20, 'medium'), 'practice20.medium');
  assert.equal(P.isUnlocked(s, 'practice10.medium'), false);
  assert.equal(P.buy(s, 'practice10.medium').reason, 'requires'); // needs Medium first
  s.unlocks.push('difficulty.medium');
  assert.equal(P.buy(s, 'practice20.medium').reason, 'requires');
  assert.equal(P.buy(s, 'practice10.medium').ok, true);
  assert.equal(P.buy(s, 'practice20.medium').ok, true);
  assert.match(P.shopItem('practice20.hard').name, /\(Hard\)/);
});

test('placing rectangles: Click first, then Auto; old owners keep both', () => {
  const s = P.createProgress();
  s.wallet = 500;
  assert.equal(P.isHidden(s, 'placeAuto'), true);
  assert.equal(P.buy(s, 'placeAuto').reason, 'requires');
  assert.equal(P.buy(s, 'placeMode').ok, true);
  assert.equal(P.buy(s, 'placeAuto').ok, true);
  const old = P.normalize({ unlocks: ['placeMode'] });
  assert.equal(P.isUnlocked(old, 'placeAuto'), true);
  const fresh = P.normalize({ ...P.normalize(null), unlocks: ['placeMode'] });
  assert.equal(P.isUnlocked(fresh, 'placeAuto'), false);
});

test('single player Expert and its timers are unlocked for each difficulty; old Settings timers carry over', () => {
  const s = P.createProgress();
  s.wallet = 5000;
  assert.equal(P.isHidden(s, 'gameExpert'), false); // Easy's Expert is the first step
  assert.equal(P.isHidden(s, 'gameTimer30'), true);
  assert.equal(P.buy(s, 'gameExpert').ok, true);
  assert.equal(P.buy(s, 'gameTimer10').reason, 'requires');
  assert.equal(P.buy(s, 'gameTimer30').ok, true);
  assert.equal(P.isUnlocked(s, P.gameExpertId('medium')), false); // Medium is separate
  assert.equal(P.shopItem(P.gameTimerId(30, 'medium')).requires, 'gameExpert.medium');
  // someone who owned the Settings timers keeps them for single player, on Easy
  const old = P.normalize({ unlocks: ['answerTime30', 'answerTime10'] });
  for (const id of ['gameExpert', 'gameTimer30', 'gameTimer10']) assert.ok(P.isUnlocked(old, id), id);
  assert.equal(P.isUnlocked(old, 'gameTimer5'), false);
});

test('difficulties after Hard: Journey levels, each with its own unlocks', () => {
  assert.deepEqual(['tricky', 'master', 'legend'].map((d) => P.shopItem(`difficulty.${d}`).journey), [14, 16, 17]);
  // Master's dice weighting counts only Tricky's facts
  const t = P.createProgress();
  const ready = P.tableReady(t, { faces: [3, 4], share: 0.75 });
  assert.deepEqual([ready.total, ready.need, ready.ok], [4, 3, false]);
  // each difficulty has its own Expert, timers and question counts
  for (const d of ['tricky', 'master', 'legend']) {
    assert.equal(P.shopItem(P.gameExpertId(d)).requires, `difficulty.${d}`);
    assert.equal(P.shopItem(P.practiceExpertId(d)).requires, `difficulty.${d}`);
    assert.ok(P.shopItem(P.practiceCountId(20, d)));
    assert.ok(P.shopItem(P.practiceTimerId(5, d)));
  }
});

test('practice sets for Tricky and Legend', () => {
  const tricky = P.practiceSet('tricky');
  assert.equal(tricky.pairs.length, 49);
  const legend = P.practiceSet('legend');
  assert.deepEqual(legend.tables, [2, 3, 4, 5, 6, 7, 8, 9]);
  const picks = P.pickPracticeFacts({}, legend, 10, Math.random, [7]);
  assert.equal(picks.length, 10);
  for (const [a, b] of picks) assert.ok(a >= 11 && a <= 19 && b === 7, `${a} × ${b}`);
});

test('IDDQD unlocks everything, and turning it off takes back only what it gave', () => {
  const s = P.createProgress();
  s.unlocks.push('practice', 'board8');
  assert.equal(P.cheatOn(s, 'iddqd'), true);
  assert.equal(P.cheatOn(s, 'iddqd'), false); // already on
  for (const item of P.SHOP) assert.ok(P.isUnlocked(s, item.id), item.id);
  assert.deepEqual(P.activeCheats(s), ['iddqd']);
  // survives a save
  const saved = P.normalize(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(P.activeCheats(saved), ['iddqd']);
  assert.equal(P.cheatOff(saved, 'iddqd'), true);
  assert.deepEqual(saved.unlocks.sort(), ['board8', 'practice']);
  assert.deepEqual(P.activeCheats(saved), []);
  assert.equal(P.cheatOn(saved, 'idkfa'), false); // not a code
});

test('cheat codes: Cheater once, plus a secret achievement for each code', () => {
  const s = P.createProgress();
  assert.deepEqual(P.awardAchievements(s, { event: 'cheat', code: 'iddqd' }).map((a) => a.id), ['cheater', 'cheat_iddqd']);
  assert.deepEqual(P.awardAchievements(s, { event: 'cheat', code: 'iddqd' }), []);
  assert.deepEqual(P.awardAchievements(s, { event: 'cheat', code: 'fivemoreminutesmom' }).map((a) => a.id), ['cheat_fivemoreminutesmom']);
  for (const code of Object.keys(P.CHEAT_CODES)) assert.ok(P.ACHIEVEMENTS.find((a) => a.id === `cheat_${code}` && a.hidden), code);
});

test('FIVEMOREMINUTESMOM makes every timer 5 minutes, and no timer stays no timer', () => {
  const s = P.createProgress();
  assert.equal(P.timerLength(s, 10), 10);
  P.cheatOn(s, 'fivemoreminutesmom');
  assert.deepEqual([P.timerLength(s, 5), P.timerLength(s, 30), P.timerLength(s, 0)], [300, 300, 0]);
  P.cheatOff(s, 'fivemoreminutesmom');
  assert.equal(P.timerLength(s, 5), 5);
});

test('homework options: only what the player has unlocked; a class gets what everyone has', () => {
  const fresh = P.availableOptions(null);
  assert.deepEqual(fresh, { practice: false, difficulties: ['easy'], boards: [6], tables: [] });
  const a = P.createProgress();
  a.unlocks = ['practice', 'table1', 'table2', 'table3', 'difficulty.medium', 'board8', 'board10'];
  const b = P.createProgress();
  b.unlocks = ['practice', 'table1', 'table2', 'board8'];
  assert.deepEqual(P.availableOptions(a), { practice: true, difficulties: ['easy', 'medium'], boards: [6, 8, 10], tables: [1, 2, 3] });
  assert.deepEqual(P.sharedOptions([P.availableOptions(a), P.availableOptions(b)]), { practice: true, difficulties: ['easy'], boards: [6, 8], tables: [1, 2] });
  assert.deepEqual(P.sharedOptions([]), fresh);
});
