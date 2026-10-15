// A Vite plugin for every Blockout game's page: before anything paints, apply the
// saved light/dark theme (so it doesn't flash light first), and put the shared
// icon sprite at the top of <body> (icons are <svg class="icon"><use href="#i-name">).
//   // vite.config.js
//   import { blockoutPage } from '@blockout/ui/vite';
//   export default { plugins: [blockoutPage()] };
//
// The theme script is its own file (theme.js next to index.html), loaded as a
// plain blocking <script> in <head>: the server's Content Security Policy allows
// no inline scripts.
import fs from 'node:fs';

const THEME_FILE = 'theme.js';
const THEME = `try {
  var saved = JSON.parse(localStorage.getItem('blockout.settings')) || {};
  if (saved.theme === 'light' || saved.theme === 'dark') document.documentElement.dataset.theme = saved.theme;
} catch (e) {}
`;

export function blockoutPage() {
  const sprite = fs.readFileSync(new URL('./icons.svg', import.meta.url), 'utf8').trim();
  let base = '/';
  return {
    name: 'blockout-page',
    configResolved(config) {
      base = config.base;
    },
    // vite dev: serve the theme script from memory
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url.split('?')[0] !== `${base}${THEME_FILE}`) return next();
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.end(THEME);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: THEME_FILE, source: THEME });
    },
    transformIndexHtml: {
      // after Vite's own processing, so it leaves the classic (non-module) script alone
      order: 'post',
      handler: (html) =>
        html.replace('</head>', `  <script src="${base}${THEME_FILE}"></script>\n  </head>`).replace(/<body([^>]*)>/, `<body$1>\n${sprite}`),
    },
  };
}
