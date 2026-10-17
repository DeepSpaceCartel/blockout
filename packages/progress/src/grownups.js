// What teachers and grown-ups see, for every client (the web game, the phone
// app): how a child's activity and homework read, which homework a child can
// be given and the goal it makes, whose homework you can take off, and how
// codes and planned tournaments read. The data comes from the server
// (apps/server/src/accounts.js); this is only how it's shown. Pure.
import * as Progress from './progress.js';
import { DIFFICULTY_NAMES } from './setup.js';

// The Times Table's statuses, best first, as named on every grown-up screen
export const STATUS_ORDER = [
  ['mastered', 'Mastered'],
  ['learning', 'Learning'],
  ['practice', 'Needs practice'],
  ['unseen', 'Not seen yet'],
];

export const FORMAT_NAMES = { knockout: 'Knockout', double: 'Double elimination', roundrobin: 'Round robin', swiss: 'Swiss', koth: 'King of the hill' };

export const ROLE = {
  student: { emoji: '🎒', label: 'Student' },
  teacher: { emoji: '🍎', label: 'Teacher' },
  parent: { emoji: '👪', label: 'Parent' },
};

// "just now", "5 min ago", "yesterday", "3 days ago" ('not yet' for never)
export function ago(t, now = Date.now()) {
  if (!t) return 'not yet';
  const mins = Math.round((now - t) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

// A day as 'YYYY-MM-DD' (in the device's time zone)
export const dayString = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const shortDay = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
export const niceTime = (t) => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// One thing a child played, in a line
export function activityText(e) {
  const diff = e.difficulty ? `${DIFFICULTY_NAMES[e.difficulty] || e.difficulty} ` : '';
  if (e.kind === 'practice') return `📝 ${diff}practice, ${e.count} questions${e.expert ? ' (Expert)' : ''}`;
  if (e.kind === 'class') return e.type === 'tournament' ? `🏆 Class tournament game${e.won ? ' (won)' : ''}` : e.type === 'pairs' ? `🤝 Class pairs game${e.won ? ' (won)' : ''}` : `🏫 Class game${e.rank ? ` (${e.rank}${['st', 'nd', 'rd'][e.rank - 1] || 'th'})` : ''}`;
  return `🎲 ${diff}${e.size}×${e.size} ${e.mode === 'multi' ? 'game at home' : e.won ? 'game, beat the CPU' : 'game vs the CPU'}`;
}

// A roster's or a child card's homework: { done, total, late }
export const homeworkCount = (hw) => (hw.total ? `${hw.done} of ${hw.total}${hw.late ? ` · ${hw.late} late` : ''}` : '—');
export const kidHomework = (hw) => (hw.total ? `📚 ${hw.done} of ${hw.total} homework done${hw.late ? ` · ${hw.late} late` : ''}` : '📚 No homework');

// The facts to practise, shortened for a roster row
export const needsPracticeShort = (list, max = 4) => (list.length ? list.slice(0, max).join(', ') + (list.length > max ? '…' : '') : '—');

// ---- setting homework: only what the child (or every child in a class) can
// already play. options: { practice, difficulties, boards, tables } from the server.

export function homeworkKinds(options) {
  const kinds = [];
  if (options.practice && options.tables.length) kinds.push(['master', 'Master a times table']);
  if (options.practice) kinds.push(['practice', 'Finish practice rounds']);
  kinds.push(['win', 'Beat the CPU on a board'], ['games', 'Play games']);
  return kinds;
}

export const HOMEWORK_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10];

// The form's choices and where each starts: { kinds, tables, boards, difficulties, start }
export function homeworkChoices(options) {
  return {
    kinds: homeworkKinds(options),
    tables: options.tables,
    boards: options.boards,
    difficulties: [['any', 'Any difficulty'], ...options.difficulties.map((d) => [d, DIFFICULTY_NAMES[d]])],
    start: {
      type: homeworkKinds(options)[0][0],
      table: options.tables.includes(7) ? 7 : options.tables[options.tables.length - 1],
      rounds: 3,
      games: 3,
      size: options.boards.includes(8) ? 8 : options.boards[options.boards.length - 1],
      difficulty: 'any',
    },
  };
}

// Which of the form's fields a kind of homework uses
export const homeworkFields = (type) => ({ table: type === 'master', rounds: type === 'practice', games: type === 'games', size: type === 'win', difficulty: type === 'practice' || type === 'win' });

// The goal the form makes: v = { type, table, rounds, games, size, difficulty }
export function goalFrom(v) {
  if (v.type === 'master') return { type: 'master', table: Number(v.table) };
  if (v.type === 'practice') return { type: 'practice', rounds: Number(v.rounds), difficulty: v.difficulty };
  if (v.type === 'win') return { type: 'win', size: Number(v.size), difficulty: v.difficulty };
  return { type: 'games', games: Number(v.games) };
}

export const homeworkNote = (who) => `Only what ${who} has unlocked, so it can be played straight away. More kinds of homework show up as they unlock practice, times tables, difficulties and boards.`;
export const homeworkSet = (goal) => ['📚 Homework set', Progress.describeGoal(goal)];

// Can this teacher or parent take this homework off? Your own, and a
// teacher only one set for this student alone (a class's comes off the class)
export const canRemove = (h, me) => h.fromName === me.name && h.from === (me.role === 'teacher' ? 'teacher' : 'parent') && (me.role === 'parent' || !h.classId);

// A class's homework row: "due Tue, Oct 14 · 3 of 20 done"
export const classHomeworkLine = (a, niceDay) => `${a.due ? `due ${niceDay(a.due)} · ` : ''}${a.done} of ${a.of} done`;

// ---- codes and planned tournaments

// A teacher code someone made: where it's got to
export const inviteState = (i) => (i.usedAt ? `used by ${i.usedBy}` : i.expired ? 'expired' : `waiting, until ${shortDay(i.expiresAt)}`);

// A teacher code on the admin page: who used it, else whether it ran out (day: how a date reads there)
export const adminCodeState = (i, day) => (i.usedBy ? `${i.usedBy} (${day(i.usedAt)})` : i.expired ? 'expired' : 'not yet');

// A planned tournament: "Fri, Oct 17, 2:00 PM · Knockout · 8×8 · whole school"
export const scheduleLine = (s) => `${niceTime(s.startsAt)} · ${FORMAT_NAMES[s.settings.format]} · ${s.settings.size}×${s.settings.size} · ${s.scope === 'school' ? 'whole school' : s.className}`;

// The planned tournaments for a class: its own and the school's
export const schedulesFor = (list, classId) => list.filter((s) => s.scope === 'school' || s.classId === classId);

export const SCHEDULE_SIZES = [6, 8, 10, 12];
export const SCHEDULE_DIFFICULTIES = ['easy', 'medium', 'hard'];
