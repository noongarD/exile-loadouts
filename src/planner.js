import { normalizeProject } from './project.js';
import { normalizeTerms, parseRequest } from './generator.js';

export const LEAGUE = '3.30 · Covens of Umbra';
const source = 'campaign';
const starts = {
  Scion: ['Spectral Throw', 'Shaper'], Marauder: ['Ground Slam', 'Heart of the Warrior'],
  Ranger: ['Galvanic Arrow', 'Revenge of the Hunted'], Witch: ['Fireball', 'Heart and Soul'],
  Duelist: ['Spectral Throw', 'Bravery'], Templar: ['Rolling Magma', 'Discipline and Training'], Shadow: ['Cobra Lash', 'Blood Siphon'],
};
const weapons = [
  ['Bows', 'Short Bow', 'G-G-G', ['Short Bow', 'Grove Bow', 'Thicket Bow']],
  ['Claws', 'Nailed Fist', 'G-G-R', ['Nailed Fist', "Cat's Paw", 'Imperial Claw']],
  ['Daggers', 'Glass Shank', 'G-G-B', ['Glass Shank', 'Poignard', 'Ambusher']],
  ['Wands', 'Driftwood Wand', 'B-B-G', ['Driftwood Wand', 'Engraved Wand', 'Imbued Wand']],
  ['Two Hand Axes', 'Stone Axe', 'R-R-G', ['Stone Axe', 'Woodsplitter', 'Despot Axe']],
  ['One Hand Axes', 'Rusted Hatchet', 'R-R-G', ['Rusted Hatchet', 'Jade Hatchet', 'Siege Axe']],
  ['Two Hand Maces', 'Driftwood Maul', 'R-R-G', ['Driftwood Maul', 'Brass Maul', 'Coronal Maul']],
  ['One Hand Maces', 'Driftwood Club', 'R-R-B', ['Driftwood Club', 'Stone Hammer', 'Gavel']],
  ['Two Hand Swords', 'Corroded Blade', 'R-G-G', ['Corroded Blade', 'Etched Greatsword', 'Exquisite Blade']],
  ['One Hand Swords', 'Rusted Sword', 'R-G-G', ['Rusted Sword', 'Broad Sword', 'Eternal Sword']],
  ['Staves', 'Gnarled Branch', 'B-R-B', ['Gnarled Branch', 'Coiled Staff', 'Judgement Staff']],
  ['Sceptres', 'Driftwood Sceptre', 'B-R-B', ['Driftwood Sceptre', 'Bronze Sceptre', 'Void Sceptre']],
];

const routeKey = name => name.toLowerCase().replace(/ support$/, '');

export function gemRoute(data, name, className) {
  return (data.routes[routeKey(name)] ?? []).filter(row => !row[3] || row[3].split(',').includes(className));
}

export function firstAcquisition(data, name, className) {
  return gemRoute(data, name, className).sort((a, b) => a[0] - b[0] || (a[4] === 'quest' ? -1 : 1) - (b[4] === 'quest' ? -1 : 1))[0];
}

function routeNote(data, gem, className) {
  const route = firstAcquisition(data, gem.name, className);
  if (!route) return `${gem.name} · check its specific acquisition and equip at level ${gem.level}+.`;
  const [act, quest, npc, , method] = route;
  return `${gem.name} · Act ${act}, ${quest} · ${method === 'quest' ? 'quest reward' : `buy from ${npc || 'vendor'}`} · level ${gem.level}+.`;
}

export function findSkills(data, query) {
  const words = normalizeTerms(query).split(' ').filter(Boolean);
  return Object.values(data.gems).filter(gem => !gem.support && words.every(word => normalizeTerms(gem.name).includes(word)))
    .sort((a, b) => Number(Boolean(b.pob)) - Number(Boolean(a.pob)) || a.name.localeCompare(b.name));
}

export function draftRequest(data, description, choice) {
  const request = parseRequest(description, data.gems);
  const skill = data.gems[request.skill?.key];
  const classes = request.classes.filter(hit => !hit.negative);
  const inferred = classes.find(hit => data.classes.some(row => row.ascendancies.some(asc => asc.name === hit.key)))?.key || classes[0]?.key;
  const recommended = skill?.tags.includes('Bow') ? 'Ranger' : skill?.tags.includes('Minion') ? 'Witch' :
    skill?.tags.includes('Spell') ? 'Witch' : skill?.tags.includes('Melee') ? 'Duelist' : '';
  return { query: skill?.name ?? '', choice: choice || inferred || recommended, description };
}

function pathTo(graph, allocated, predicate, allow) {
  const candidates = [...allocated];
  const previous = new Map(candidates.map(key => [key, '']));
  for (const key of candidates) {
    if (!allocated.has(key) && predicate(graph[key])) {
      const path = [];
      for (let step = key; !allocated.has(step); step = previous.get(step)) path.push(step);
      return path.reverse();
    }
    for (const next of graph[key][1]) {
      if (!previous.has(next) && graph[next] && allow(graph[next])) {
        candidates.push(next);
        previous.set(next, key);
      }
    }
  }
  return [];
}

export function passivePath(data, allocated, target) {
  const graph = data.graph;
  const base = new Set(allocated.filter(key => graph[key] && !graph[key][3]));
  return pathTo(graph, base, node => node === graph[target], node => node[2] == null && !node[3] && !node[4]);
}

const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, token => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[token]);
const attributes = fields => Object.entries(fields).map(([k, v]) => `${k}="${escapeXml(v)}"`).join(' ');

function chooseWeapon(gem, className, index) {
  if (/punch|concoction/i.test(gem.name) || !gem.tags.includes('Attack')) return null;
  const wanted = gem.tags.includes('Bow') ? ['Bows'] : gem.weapons;
  const preferred = { Marauder: 'Two Hand Axes', Duelist: 'Two Hand Swords', Witch: 'Wands', Shadow: 'Claws', Templar: 'Sceptres' }[className];
  const weapon = weapons.find(([type]) => type === preferred && wanted.includes(type)) || weapons.find(([type]) => wanted.includes(type)) ||
    (wanted.length ? null : weapons.find(([type]) => type === preferred) || weapons[8]);
  return weapon && { name: weapon[3][index], sockets: weapon[2] };
}

export function makeDraft(data, { className, ascendancy = '', skillName, notes = '' }) {
  const gem = data.gems[skillName];
  const classIndex = data.classes.findIndex(row => row.name === className);
  const classData = data.classes[classIndex];
  const ascendIndex = classData?.ascendancies.findIndex(row => row.name === ascendancy) ?? -1;
  if (classIndex < 0 || (ascendancy && ascendIndex < 0)) throw new Error('Choose an ascendancy that belongs to this class.');
  if (!gem || gem.support) throw new Error('Select an active skill for the draft.');
  if (!gem.pob) throw new Error(`${gem.name} is in the 3.30 client data. Export requires a PoB version that supports it.`);
  const [starter, firstNotable] = starts[className];
  const fallback = data.gems[starter];
  if (!fallback?.pob) throw new Error('The campaign data could not be loaded.');
  const acquisition = firstAcquisition(data, gem.name, className);
  const opening = gem.level <= 12 && acquisition?.[0] === 1 && !/flicker|concoction/i.test(gem.name) ? gem : fallback;
  const mid = gem.level <= 38 && acquisition?.[0] <= 4 ? gem : opening;
  const root = Object.keys(data.graph).find(key => data.graph[key][2] === classIndex);
  if (!root) throw new Error('The class start is missing from the PoB graph.');
  const allocated = new Set([root]);
  const regular = node => node[2] == null && !node[3] && !node[4];
  const anyLife = node => /maximum life|life and|and life/i.test(node[0]);
  const schemes = [
    { title: 'Act 1 · First links', phase: 'leveling', level: '12', skill: opening, target: node => node[0] === firstNotable, limit: 11 },
    { title: 'Campaign · Core skill', phase: 'leveling', level: '40', skill: mid, target: anyLife, limit: 16 },
    { title: 'Early maps · Prototype', phase: 'transition', level: '70', skill: gem, target: anyLife, limit: 23 },
  ];
  const treeSets = [], itemSets = [], skillSets = [], configSets = [], items = [];
  const stages = schemes.map(({ title, phase, level, skill, target, limit }, index) => {
    const number = index + 1;
    const path = pathTo(data.graph, allocated, target, regular);
    path.slice(0, Math.max(0, limit - allocated.size)).forEach(key => allocated.add(key));
    const nodes = new Set(allocated);
    const labId = index > 0 && ascendIndex >= 0 ? ascendIndex + 1 : 0;
    const labRoot = labId && Object.keys(data.graph).find(key => data.graph[key][3] === classData.ascendancies[ascendIndex].id &&
      data.graph[key][1].includes(root));
    if (labRoot) nodes.add(labRoot);
    treeSets.push(`<Spec ${attributes({ title, treeVersion: '3_29', classId: classIndex, ascendClassId: labId, secondaryAscendClassId: 0, nodes: [...nodes].join(',') })}/>`);
    const weapon = chooseWeapon(skill, className, index);
    const shield = /shield|concoction/i.test(skill.name);
    const slots = [];
    for (const [slot, name, sockets] of [
      ['Weapon 1', shield && /concoction/i.test(skill.name) ? null : weapon?.name, weapon?.sockets],
      ['Weapon 2', shield ? 'Goathide Buckler' : null, 'G-G-R'],
      ['Body Armour', ['Simple Robe', 'Silken Vest', 'Destroyer Regalia'][index], 'B-G-R'],
    ]) {
      if (!name) continue;
      items.push(`<Item id="${items.length + 1}">\nRarity: NORMAL\n${escapeXml(name)}\n--------\nQuality: 0\nSockets: ${sockets}\n</Item>`);
      slots.push(`<Slot name="${slot}" itemId="${items.length}"/>`);
    }
    itemSets.push(`<ItemSet ${attributes({ id: number, title })}>${slots.join('')}</ItemSet>`);
    const fields = { nameSpec: skill.name, gemId: skill.pob.id, variantId: skill.pob.variant, skillId: skill.pob.effect, level: 1,
      quality: 0, enabled: true, count: 1, enableGlobal1: true, enableGlobal2: true };
    skillSets.push(`<SkillSet ${attributes({ id: number, title })}><Skill slot="Body Armour" enabled="true" mainActiveSkill="1"><Gem ${attributes(fields)}/></Skill></SkillSet>`);
    configSets.push(`<ConfigSet ${attributes({ id: number, title })}><Input name="resistancePenalty" number="${[0, -30, -60][index]}"/></ConfigSet>`);
    const priority = index === 2 ? 'Finish the passive tree and labs. Add compatible links, life, capped elemental resistances and a sustainable resource setup.'
      : 'Equip linked drops and level the gem when your attributes allow it. Spend the remaining passive points for your damage type and defence.';
    return { title, phase, level, id: `draft-${number}`, source, selection: [index, index, index, index],
      goal: `Use ${skill.name}. ${routeNote(data, skill, className)}`, priority,
      swap: skill === gem && index ? `Switch when the gem and any required weapon or other enabling gear can be equipped.` : '',
      conditions: index === 2 ? 'Check hit chance, resource sustain, enemy type and temporary effects in PoB before comparing damage.' : '' };
  });
  const build = attributes({ className, ascendClassName: 'None', level: 12, characterLevelAutoMode: false, targetVersion: '3_0', mainSocketGroup: 1 });
  const xml = `<PathOfBuilding><Build ${build}/><Tree activeSpec="1">${treeSets.join('')}</Tree><Items activeItemSet="1">${items.join('')}${itemSets.join('')}</Items><Skills activeSkillSet="1">${skillSets.join('')}</Skills><Config activeConfigSet="1">${configSets.join('')}</Config></PathOfBuilding>`;
  return normalizeProject({ version: 1, title: `${gem.name} ${ascendancy || className}`, patch: LEAGUE, ascendancy,
    overview: ['Custom draft. The tree is partially allocated and skill groups use level 1 gems. Fill in links and build-specific gear before relying on performance. Simulation data targets PoB tree 3.29.',
      routeNote(data, gem, className), notes.trim()].filter(Boolean).join('\n\n'), defaultId: stages[0].id,
    stages, sources: { [source]: { xml, name: 'Custom campaign and early maps draft' } } });
}
