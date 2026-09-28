// Fails the build if a dev tool (e.g. the Console Ninja VS Code extension) has
// injected script into index.html. That code must never ship.
import { readFileSync } from 'node:fs';

const html = readFileSync('src/index.html', 'utf8');
const markers = ['console-ninja', '_triedToInstallGlobalErrorHandler', '(0, eval)'];
const found = markers.filter((m) => html.includes(m));

if (found.length) {
  console.error(`src/index.html contains injected dev-tool code (${found.join(', ')}). Restore it from git.`);
  process.exit(1);
}
