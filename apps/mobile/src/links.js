// Links into the app: a one-time code (a teacher's or a grown-up's) or a
// class to join. The web game's links (https://…/#code=ABCD2345,
// #roster=ABC123) work, and so do the app's own: blockout://code/ABCD2345,
// or in Expo Go exp://…/--/code/ABCD2345. Pure.

// { kind: 'code' | 'roster', code } or null
export function parseLink(url) {
  if (!url) return null;
  const m = /#(code|roster)=([A-Za-z0-9]+)$/.exec(url) || /(?:^blockout:\/\/|\/--\/)(code|roster)\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/.exec(url);
  return m ? { kind: m[1], code: m[2].toUpperCase() } : null;
}

// A code's link to share: the web game's, so it opens on any phone or computer
export const codeLink = (server, code) => `${server}/#code=${code}`;

// A code as people read it: ABCD 2345
export const spaced = (code) => code.replace(/(.{4})/, '$1 ');
