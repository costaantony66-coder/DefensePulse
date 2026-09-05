// scripts/fetch-feeds.mjs
//
// Récupère tous les flux RSS listés dans feeds.config.json et écrit un
// instantané statique dans data/latest.json. Ce script est exécuté par
// .github/workflows/update-feeds.yml, jamais par le téléphone de
// l'utilisateur : c'est ce qui rend l'app "hyper automatisée" et rapide,
// et évite toute dépendance à un service tiers (rss2json, clé d'API, etc.)
//
// Robustesse : si un flux est temporairement injoignable, on conserve les
// derniers articles connus pour cette source (issus de l'ancien
// data/latest.json) plutôt que de faire disparaître toute la catégorie.

import Parser from 'rss-parser';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '..', 'feeds.config.json');
const DATA_DIR = path.join(__dirname, '..', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'latest.json');

const MAX_ITEMS_PER_FEED = 40;
const MAX_TOTAL_ITEMS = 300;

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DefensePulseBot/1.0)' },
});

function stripHtml(html = '') {
  return html
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/<\/(p|div|li|br|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8217;/g, '’')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function loadPrevious() {
  try {
    const raw = await readFile(OUTPUT_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fetchOneFeed(source, previousItemsByKey) {
  try {
    const feed = await parser.parseURL(source.url);
    const items = (feed.items || [])
      .slice(0, MAX_ITEMS_PER_FEED)
      .map(item => ({
        title: (item.title || '').trim(),
        link: item.link || item.guid || '',
        pubDate: item.isoDate || item.pubDate || new Date().toISOString(),
        description: stripHtml(
          item.contentSnippet || item.content || item.summary || item.description || ''
        ),
        sourceKey: source.key,
      }))
      .filter(i => i.link && i.title);
    console.log(`  OK  ${source.label} — ${items.length} article(s)`);
    return items;
  } catch (err) {
    const fallback = previousItemsByKey.get(source.key) || [];
    console.warn(`  ECHEC ${source.label} (${err.message}) — conservation de ${fallback.length} article(s) précédent(s)`);
    return fallback;
  }
}

async function main() {
  if (!existsSync(DATA_DIR)) await mkdir(DATA_DIR, { recursive: true });

  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf-8'));
  const previous = await loadPrevious();

  const previousItemsByKey = new Map();
  if (previous?.items) {
    for (const source of config) {
      previousItemsByKey.set(source.key, previous.items.filter(i => i.sourceKey === source.key));
    }
  }

  console.log(`Synchronisation de ${config.length} source(s)...`);
  const results = await Promise.all(config.map(source => fetchOneFeed(source, previousItemsByKey)));
  let items = results.flat();

  // Déduplication par lien (au cas où une source republierait un article)
  const seen = new Set();
  items = items.filter(i => {
    if (seen.has(i.link)) return false;
    seen.add(i.link);
    return true;
  });

  items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  items = items.slice(0, MAX_TOTAL_ITEMS);

  const output = {
    generatedAt: new Date().toISOString(),
    sources: config.map(({ key, label, url }) => ({ key, label, url })),
    items,
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf-8');
  console.log(`\n${items.length} article(s) écrit(s) dans data/latest.json`);
}

main().catch(err => {
  console.error('Erreur fatale du script de synchronisation :', err);
  process.exit(1);
});
