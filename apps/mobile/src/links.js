// Links into the app: a one-time code (a teacher's or a grown-up's), a
// class roster to join, or a live class to play in. The web game's links
// (https://…/#code=ABCD2345, #roster=ABC123, #class=ABCD) work, and so do the
// app's own: blockout://code/ABCD2345, or in Expo Go exp://…/--/code/ABCD2345. Pure.

// { kind: 'code' | 'roster' | 'class', code } or null
export function parseLink(url) {
  if (!url) return null;
  const m =
    /#(code|roster)=([A-Za-z0-9]+)$/.exec(url) ||
    /#(class)=([A-Za-z]{4})(?:&play=[0-9a-f]+)?$/.exec(url) || // (a teacher's play link is for the web game)
    /(?:^blockout:\/\/|\/--\/)(code|roster|class)\/([A-Za-z0-9]+)\/?(?:[?#].*)?$/.exec(url);
  return m ? { kind: m[1], code: m[2].toUpperCase() } : null;
}

// A code's link to share: the web game's, so it opens on any phone or computer
export const codeLink = (server, code) => `${server}/#code=${code}`;

// A code as people read it: ABCD 2345
export const spaced = (code) => code.replace(/(.{4})/, '$1 ');
