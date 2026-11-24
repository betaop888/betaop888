// Generates assets/langs-dark.svg and assets/langs-light.svg
// Aggregates bytes by language across all repositories owned by the
// authenticated user (private included). No repository names are used.
//
// Token resolution: PROFILE_STATS_TOKEN env var, otherwise `gh auth token`.
// If no token is available the script exits 0 without writing files, so the
// committed SVGs stay untouched.

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.github.com';
const TOP_N = 6;
const WIDTH = 800;

function getToken() {
  if (process.env.PROFILE_STATS_TOKEN) return process.env.PROFILE_STATS_TOKEN;
  try {
    return execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

async function api(path, token) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'github-profile-stats',
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

const token = getToken();
if (!token) {
  console.log('No token (PROFILE_STATS_TOKEN / gh auth token). Skipping.');
  process.exit(0);
}

const repos = [];
for (let page = 1; ; page++) {
  const batch = await api(
    `/user/repos?per_page=100&page=${page}&affiliation=owner&sort=updated`,
    token
  );
  repos.push(...batch);
  if (batch.length < 100) break;
}

const targets = repos.filter((r) => !r.fork && !r.archived);
console.log(`Repos owned: ${repos.length}, counted (no forks/archives): ${targets.length}`);

const bytes = new Map();
await Promise.all(
  targets.map(async (r) => {
    try {
      const langs = await api(`/repos/${r.full_name}/languages`, token);
      for (const [lang, size] of Object.entries(langs)) {
        bytes.set(lang, (bytes.get(lang) ?? 0) + size);
      }
    } catch (e) {
      console.warn(`skip repo: ${e.message}`);
    }
  })
);

const sorted = [...bytes.entries()].sort((a, b) => b[1] - a[1]);
const total = sorted.reduce((s, [, v]) => s + v, 0);
if (total === 0) {
  console.log('No language data. Skipping.');
  process.exit(0);
}

const top = sorted.slice(0, TOP_N);
const rest = sorted.slice(TOP_N);
const restBytes = rest.reduce((s, [, v]) => s + v, 0);
const rows = [...top.map(([n, v]) => [n, v]), ...(restBytes ? [['Other', restBytes]] : [])];

const pct = (v) => (v / total) * 100;
const fmt = (p) => p.toFixed(1);

console.log(
  rows.map(([n, v]) => `${n} ${fmt(pct(v))}%`).join(' · ')
);

const THEMES = {
  dark: {
    file: 'langs-dark.svg',
    bg: '#101623',
    stroke: '#1f2a3a',
    name: '#dfe7f2',
    pct: '#93a1b8',
    track: '#1c2635',
    fill: '#6ea8ff',
    accent: '#6ea8ff',
    caption: '#7c8aa0',
  },
  light: {
    file: 'langs-light.svg',
    bg: '#ffffff',
    stroke: '#dde4ee',
    name: '#182335',
    pct: '#55647a',
    track: '#e6ebf3',
    fill: '#3f74d6',
    accent: '#3f74d6',
    caption: '#6b7a90',
  },
};

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, 'Cascadia Code', 'SF Mono', Consolas, monospace";

const PAD = 40;
const NAME_X = 40;
const BAR_X = 252;
const BAR_W = 368;
const PCT_X = WIDTH - 40;
const ROW_H = 46;
const FIRST_BASE = 128;
const height = FIRST_BASE + (rows.length - 1) * ROW_H + 40;

for (const [theme, c] of Object.entries(THEMES)) {
  const parts = [];
  parts.push(`<svg width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Доли языков в коде по всем репозиториям">`);
  parts.push(`<style>.barfill{transform-box:fill-box;transform-origin:left center;animation:grow .9s cubic-bezier(.2,.7,.2,1) both}@keyframes grow{from{transform:scaleX(0)}}@media (prefers-reduced-motion: reduce){.barfill{animation:none}}</style>`);
  parts.push(`<rect width="${WIDTH}" height="${height}" rx="22" fill="${c.bg}"/>`);
  parts.push(`<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="21.5" stroke="${c.stroke}"/>`);
  parts.push(`<text x="${PAD}" y="60" fill="${c.accent}" font-family="${MONO}" font-size="13" letter-spacing="2.5">СТЕК</text>`);
  parts.push(`<text x="${PCT_X}" y="60" fill="${c.caption}" font-family="${FONT}" font-size="13" text-anchor="end">по байтам кода, все репозитории</text>`);
  parts.push(`<rect x="${PAD}" y="82" width="${WIDTH - PAD * 2}" height="1" fill="${c.stroke}"/>`);

  rows.forEach(([name, v], i) => {
    const y = FIRST_BASE + i * ROW_H;
    const p = pct(v);
    const w = Math.max(4, (p / 100) * BAR_W);
    const opacity = 1 - i * 0.09;
    parts.push(`<text x="${NAME_X}" y="${y}" fill="${c.name}" font-family="${FONT}" font-size="16">${name}</text>`);
    parts.push(`<rect x="${BAR_X}" y="${y - 14}" width="${BAR_W}" height="10" rx="5" fill="${c.track}"/>`);
    parts.push(`<rect class="barfill" style="animation-delay:${(i * 0.07).toFixed(2)}s" x="${BAR_X}" y="${y - 14}" width="${w.toFixed(1)}" height="10" rx="5" fill="${c.fill}" opacity="${opacity.toFixed(2)}"/>`);
    parts.push(`<text x="${PCT_X}" y="${y}" fill="${c.pct}" font-family="${MONO}" font-size="16" text-anchor="end">${fmt(p)}%</text>`);
  });

  parts.push('</svg>');
  writeFileSync(join(ROOT, 'assets', THEMES[theme].file), parts.join('\n') + '\n');
}

console.log('Wrote assets/langs-dark.svg and assets/langs-light.svg');
