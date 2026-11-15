import { normalizeTerms } from './generator.js';

const files = { game: 'game-icons', tree: 'tree-icons', league: 'league-icons', atlas: 'atlas-items' };
const sources = new Map();
const referenceKinds = {
  gems: 'game', equipment: 'game', currency: 'game', quests: 'game',
  classes: 'tree', passives: 'tree', atlas: 'tree',
  maps: 'atlas', cards: 'atlas', bosses: 'atlas',
  fates: 'league', viscera: 'league', threads: 'league', topics: 'league',
};
const allowedHosts = new Set(['web.poecdn.com', 'www.poewiki.net', 'cdn.poedb.tw']);

export function artData(kind) {
  const source = referenceKinds[kind];
  if (!sources.has(source)) {
    sources.set(source, fetch(new URL(`../data/${files[source]}.json`, import.meta.url)).then(response => {
      if (!response.ok) throw new Error('Could not load game artwork.');
      return response.json();
    }).catch(error => {
      sources.delete(source);
      throw error;
    }));
  }
  return sources.get(source);
}

export function gemName(gems, name) {
  return [name, `${name} Support`, name.replace(/ Support$/i, '')].find(key => Object.hasOwn(gems, key)) || name;
}

export function itemArtKey(equipment, name, { base, rarity } = {}) {
  const exact = [name, base].find(key => key && Object.hasOwn(equipment, key));
  if (exact || rarity !== 'magic') return exact || name;
  const spaced = ` ${name} `;
  return Object.keys(equipment).reduce((match, key) =>
    !equipment[key][2] && key.length > match.length && spaced.includes(` ${key} `) ? key : match, '') || name;
}

export function recordArt(data, kind, name, options = {}) {
  const records = data[kind];
  if (!records) return null;
  const key = kind === 'gems' ? gemName(records, name) : kind === 'equipment' ? itemArtKey(records, name, options) : name;
  if (!Object.hasOwn(records, key)) return null;
  const record = records[key];
  if (kind === 'gems') {
    const [inventory, active, colour] = record;
    const urls = options.active ? (options.distinct ? [active] : [active, inventory]) : [inventory, active];
    return { urls, colour };
  }
  if (referenceKinds[kind] === 'tree') {
    const crop = record[kind === 'classes' ? 0 : 1];
    return crop ? { crop, sheet: data.sheets[crop[0]] } : null;
  }
  return { urls: [Array.isArray(record) ? record[0] : record] };
}

function trustedImage(value) {
  if (!value) return null;
  const url = new URL(value);
  return url.protocol === 'https:' && allowedHosts.has(url.hostname) ? url.href : null;
}

export function artwork(kind, key, options = {}) {
  const el = document.createElement('span');
  el.className = `game-art art-${kind}${options.large ? ' art-large' : ''}`;
  el.setAttribute('aria-hidden', 'true');
  if (!key) return el;
  el.dataset.art = key;
  artData(kind).then(data => {
    const art = recordArt(data, kind, key, options);
    if (!art) return;
    if (art.colour) el.classList.add(`gem-${art.colour}`);
    if (art.sheet) {
      const [, x, y, w, h] = art.crop;
      const [image, width, height] = art.sheet;
      const url = trustedImage(image);
      if (!url) return;
      const sprite = document.createElement('span');
      sprite.className = 'game-sprite';
      sprite.style.backgroundImage = `url("${url}")`;
      sprite.style.backgroundSize = `${width / w * 100}% ${height / h * 100}%`;
      sprite.style.backgroundPosition = `${(x / (width - w) || 0) * 100}% ${(y / (height - h) || 0) * 100}%`;
      sprite.style.setProperty('--sprite-aspect', w / h);
      el.append(sprite);
      return;
    }
    const urls = [...new Set(art.urls.map(trustedImage).filter(Boolean))];
    if (!urls.length) return;
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => {
      urls.shift();
      if (urls.length) img.src = urls[0];
      else img.remove();
    });
    img.src = urls[0];
    el.append(img);
  }).catch(() => {});
  return el;
}

export function findArtRecords(records, query) {
  const whole = normalizeTerms(query);
  const words = whole.split(' ').filter(Boolean);
  return records.filter(record => words.every(word => record.search.includes(word))).sort((a, b) => {
    const priority = row => row.normalized === whole ? 0 : row.normalized.startsWith(whole) ? 1 : 2;
    return priority(a) - priority(b) || a.name.localeCompare(b.name);
  });
}
