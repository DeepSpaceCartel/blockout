// What a game earns, stacked: the same kind of bonus said once with how many
// times and the points added up ("⚡ Speedy ×3 · +9 bonus points"), and the
// stickers on one line. Used for the results screens' summary and to merge
// repeats waiting in the pop-up queue. Pure.

// A note's kind: its title without numbers ("🔥 Streak 4" and "🔥 Streak 5"
// are one kind); every sticker is one kind
export const kindOf = (title) => (title.startsWith('🎁') ? '🎁' : title.replace(/\s*\d+\s*$/, '').replace(/\s+/g, ' ').trim());

const pointsIn = (text) => {
  const m = /\+(\d+)/.exec(text || '');
  return m ? Number(m[1]) : 0;
};

// One more note on a list (a new list): { kind, title, text, count, points, emojis }
export function stack(list, title, text = '') {
  const kind = kindOf(title);
  const sticker = kind === '🎁' ? (title.split(':').pop() || '').trim() : null;
  const at = list.findIndex((n) => n.kind === kind);
  if (at < 0) return [...list, { kind, title: sticker ? '🎁 Stickers' : title.replace(/\s*\d+\s*$/, '').trim() || title, text, count: 1, points: pointsIn(text), emojis: sticker ? [sticker] : [] }];
  const n = list[at];
  const merged = { ...n, count: n.count + 1, points: n.points + pointsIn(text), emojis: sticker ? [...n.emojis, sticker] : n.emojis };
  return [...list.slice(0, at), merged, ...list.slice(at + 1)];
}

// How a stacked note reads: [title, text]
export function words(n) {
  if (n.kind === '🎁') return [`🎁 ${n.count === 1 ? 'Sticker' : 'Stickers'}: ${n.emojis.join(' ')}`, n.count === 1 ? n.text : 'in your album'];
  const title = n.count > 1 ? `${n.title} ×${n.count}` : n.title;
  const text = n.count > 1 && n.points ? n.text.replace(/\+\d+/, `+${n.points}`) : n.text;
  return [title, text];
}
