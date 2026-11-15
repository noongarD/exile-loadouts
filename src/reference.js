import { artData, artwork, findArtRecords, gemName, itemArtKey } from './game-art.js';
import { normalizeTerms } from './generator.js';
import { gemRoute } from './planner.js';

const sheet = document.getElementById('game-detail');
const detailTitle = document.getElementById('game-detail-title');
const detailBody = document.getElementById('game-detail-body');
const query = document.getElementById('reference-search');
const category = document.getElementById('reference-category');
const results = document.getElementById('reference-results');
const count = document.getElementById('reference-count');
const more = document.getElementById('reference-more');
const pageSize = 24;

export function setupReference({ element, planner }) {
  const records = new Map();
  let visible = false;
  let limit = pageSize;
  let selection = 0;
  const external = (href, label) => element('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label);

  function formatRecord(data, kind, id) {
    const record = data[kind][id];
    if (kind === 'passives' || kind === 'atlas') {
      return { id, name: record[0], category: [record[2], record[3]].filter(Boolean).join(' · '), lines: record[4] };
    }
    if (['cards', 'maps', 'bosses'].includes(kind)) {
      return { id, name: id, category: kind === 'cards' ? record[1] || 'Divination card' : record[1], lines: record.slice(2).filter(Boolean) };
    }
    const group = {
      gems: id.endsWith(' Support') ? 'Support gem' : 'Skill gem',
      equipment: [record[2] && 'Unique', record[2] || record[1]].filter(Boolean).join(' · '),
      currency: record[1], quests: `Act ${record[1]}`, classes: record[1],
    };
    return { id, name: id, category: group[kind], lines: kind === 'currency' ? record.slice(2) : [] };
  }

  async function inspect(kind, name, { base = '', raw = '', className = '', rarity = '' } = {}) {
    const request = ++selection;
    detailTitle.textContent = name;
    detailBody.replaceChildren(element('p', { className: 'muted' }, 'Loading game reference…'));
    if (!sheet.open) sheet.showModal();
    try {
      const [data, gemData] = await Promise.all([artData(kind), kind === 'gems' ? planner() : null]);
      if (request !== selection) return;
      const id = kind === 'gems' ? gemName(data.gems, name) : kind === 'equipment' ? itemArtKey(data.equipment, name, { base, rarity }) : name;
      const record = Object.hasOwn(data[kind], id) ? formatRecord(data, kind, id) : null;
      const gem = gemData?.gems[gemName(gemData.gems, name)];
      const wikiName = record?.name || gem?.name || base || name;
      const description = kind === 'gems' ? data.gems[id]?.[3] : '';
      const lines = record?.lines ?? [];
      const isTree = kind === 'passives' || kind === 'atlas';
      detailTitle.textContent = raw ? name : wikiName;
      const content = [
        element('div', { className: 'detail-art' }, artwork(kind, id, { large: true }),
          gem && !gem.support ? artwork(kind, id, { large: true, active: true, distinct: true }) : null,
          element('div', {}, element('p', { className: 'eyebrow' }, record?.category || (gem ? 'Gem' : 'Equipment')),
            base && base !== name && !record?.category.includes(base) ? element('p', { className: 'muted' }, base) : null,
            gem ? element('p', {}, `Requires level ${gem.level} · ${gem.tags.join(', ')}`) : null)),
        description ? element('p', { className: 'game-stat' }, description) : null,
        ...lines.map(line => element('p', { className: 'game-stat' }, line)),
        gem ? acquisition(gemData, gem.name, className) : null,
        raw ? element('pre', { className: 'guide item-detail' }, raw.trim()) : null,
        isTree ? external(kind === 'atlas' ? 'https://www.pathofexile.com/atlas-skill-tree' : 'https://www.pathofexile.com/passive-skill-tree', 'Official tree ↗') :
          external(`https://www.poewiki.net/wiki/${encodeURIComponent(wikiName.replaceAll(' ', '_'))}`, 'PoE Wiki ↗'),
      ];
      detailBody.replaceChildren(...content.filter(Boolean));
    } catch (error) {
      if (request !== selection) return;
      detailBody.replaceChildren(element('p', { className: 'muted' }, error.message));
      if (raw) detailBody.append(element('pre', { className: 'guide item-detail' }, raw.trim()));
    }
  }

  function acquisition(data, name, preferred) {
    const classPicker = element('select', { 'aria-label': 'Class for gem rewards' }, ...data.classes.map(row =>
      element('option', { value: row.name }, row.name)));
    if (data.classes.some(row => row.name === preferred)) classPicker.value = preferred;
    const list = element('ul', { className: 'gem-route-list' });
    const renderRoutes = () => {
      const lines = [...new Set(gemRoute(data, name, classPicker.value).map(([act, quest, npc, , method]) =>
        `Act ${act} · ${quest} · ${method === 'quest' ? 'Quest reward' : `Buy from ${npc || 'vendor'}`}`))];
      list.replaceChildren(...(lines.length ? lines : ['See the gem’s acquisition method on PoE Wiki.']).map(line => element('li', {}, line)));
    };
    classPicker.addEventListener('change', renderRoutes);
    renderRoutes();
    return element('div', { className: 'reference-route' }, element('label', { className: 'field' }, 'Class for gem rewards', classPicker), list);
  }

  async function draw() {
    if (!visible) return;
    const kind = category.value;
    const term = query.value;
    try {
      if (!records.has(kind)) {
        const data = await artData(kind);
        records.set(kind, Object.keys(data[kind]).map(id => {
          const row = formatRecord(data, kind, id);
          return { ...row, normalized: normalizeTerms(row.name), search: normalizeTerms([row.name, row.category].join(' ')) };
        }));
      }
      if (kind !== category.value || term !== query.value) return;
      const filtered = findArtRecords(records.get(kind), term);
      const shown = filtered.slice(0, limit);
      count.textContent = filtered.length ? `Showing ${shown.length} of ${filtered.length} entries` : 'No matching entries.';
      results.replaceChildren(...shown.map(row => element('button', {
        type: 'button', className: 'reference-card', onclick: () => inspect(kind, row.id), 'aria-label': row.name,
      }, artwork(kind, row.id), element('span', {}, element('strong', {}, row.name), element('small', {}, row.category)))));
      more.hidden = shown.length === filtered.length;
    } catch (error) {
      if (kind === category.value && term === query.value) count.textContent = error.message;
    }
  }

  function open() {
    const content = document.getElementById('reference-content');
    content.hidden = false;
    document.getElementById('reference-open').hidden = true;
    visible = true;
    draw();
  }

  document.getElementById('reference-open').addEventListener('click', () => { open(); query.focus(); });
  document.getElementById('reference-nav').addEventListener('click', open);
  query.addEventListener('input', () => { limit = pageSize; draw(); });
  category.addEventListener('change', () => { limit = pageSize; draw(); });
  more.addEventListener('click', () => { limit += pageSize; draw(); results.children[limit - pageSize]?.focus(); });
  return inspect;
}
