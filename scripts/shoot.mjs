// Self-critique screenshot loop (brief Section 9). Scrolls /goodlanding through
// the chapter stops and saves stills for review. Requires playwright:
//   npx playwright install chromium
// Usage: node scripts/shoot.mjs  (dev server must be running on :5173)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/goodlanding';
mkdirSync('shots', { recursive: true });

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
await p.goto(URL, { waitUntil: 'networkidle' });
await p.click('.agr-gate').catch(() => {}); // dismiss start gate
await p.waitForTimeout(800);

// one stop per chapter (9) + intro
const stops = [0, 0.06, 0.17, 0.28, 0.4, 0.52, 0.64, 0.76, 0.88, 0.97];
for (const [i, v] of stops.entries()) {
  await p.evaluate((t) => window.scrollTo(0, (document.body.scrollHeight - innerHeight) * t), v);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `shots/${String(i).padStart(2, '0')}.png` });
}
await b.close();
console.log('shoot: wrote shots/00..09.png');
