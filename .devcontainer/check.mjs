// Checks that the dev container's Playwright Chromium matches the Playwright in
// package-lock.json. Dependabot bumps the lockfile but not devcontainer.json, and
// a mismatch means every new container downloads Chromium again. Run by CI.
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const locked = JSON.parse(read('../package-lock.json')).packages['node_modules/playwright']?.version;
const pinned = read('./devcontainer.json')
  .match(/"\.\/features\/playwright-chromium":\s*\{\s*"version":\s*"([^"]+)"/)?.[1];

if (!locked || !pinned) {
  console.error(`Couldn't find Playwright's version (package-lock.json: ${locked}, devcontainer.json: ${pinned}).`);
  process.exit(1);
}
if (locked !== pinned) {
  console.error(`package-lock.json has Playwright ${locked}, but .devcontainer/devcontainer.json installs ${pinned}.`);
  console.error(`Set "./features/playwright-chromium": { "version": "${locked}" } in devcontainer.json.`);
  process.exit(1);
}
console.log(`Playwright ${locked}: devcontainer.json matches package-lock.json.`);
