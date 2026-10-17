// Small DOM helpers shared by the games (the look itself is in ./css).

export const $ = (id) => document.getElementById(id);

// make('div', 'card', 'Hello') -> <div class="card">Hello</div>
export function make(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// A Lucide icon from the sprite (see icons.svg), e.g. icon('lock')
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}
