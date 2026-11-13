const MAX_XML = 8 * 1024 * 1024;
const SETS = [
  ['Tree', 'Spec', 'activeSpec'],
  ['Items', 'ItemSet', 'activeItemSet'],
  ['Skills', 'SkillSet', 'activeSkillSet'],
  ['Config', 'ConfigSet', 'activeConfigSet'],
];
const SET_NAMES = ['tree', 'items', 'skills', 'config'];
export const EQUIPMENT = [
  'Weapon 1', 'Weapon 2', 'Helmet', 'Body Armour', 'Gloves', 'Boots', 'Amulet',
  'Ring 1', 'Ring 2', 'Belt', 'Flask 1', 'Flask 2', 'Flask 3', 'Flask 4', 'Flask 5',
];
export const CONDITIONS = [
  ['Frenzy', 'useFrenzyCharges', 'overrideFrenzyCharges'],
  ['Endurance', 'useEnduranceCharges', 'overrideEnduranceCharges'],
  ['Power', 'usePowerCharges', 'overridePowerCharges'],
  ['Rage', null, 'multiplierRage'],
  ['Fortification', 'buffFortification', 'overrideFortification'],
];
const newXml = () => document.implementation.createDocument(null, 'PathOfBuilding');
const direct = (el, tag) => [...(el?.children ?? [])].filter(child => child.tagName === tag);
const first = (el, tag) => direct(el, tag)[0];
const attr = (el, name) => el?.getAttribute(name) ?? '';
const idOf = el => attr(el, 'id');
const xmlString = el => new XMLSerializer().serializeToString(el);

export function parsePoB(xml) {
  if (xml.length > MAX_XML || /<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error('Use a PoB XML export under 8 MB without a document type.');
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (root.tagName === 'PathOfBuilding2' || /^0_/.test(attr(first(root, 'Build'), 'targetVersion'))) {
    throw new Error('Exile Loadouts supports Path of Exile 1 builds.');
  }
  if (root.tagName !== 'PathOfBuilding' || root.querySelector('parsererror') ||
      !first(root, 'Build') || !first(root, 'Tree')) {
    throw new Error('This does not look like a Path of Building export.');
  }
  return doc;
}

async function transform(bytes, stream, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) throw new Error('This PoB export exceeds the size limit.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function decodePoB(value) {
  const input = value.trim();
  if (/^https?:\/\//i.test(input)) {
    throw new Error('Open the link in a new tab and copy its build code into this field.');
  }
  let xml = input;
  if (!xml.startsWith('<')) {
    const code = input.replace(/\s/g, '');
    if (!/^[A-Za-z0-9_+/-]+={0,2}$/.test(code) || code.length > MAX_XML) {
      throw new Error('Paste a Path of Building export code or choose an XML file.');
    }
    try {
      const bytes = Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
      xml = new TextDecoder('utf-8', { fatal: true }).decode(
        await transform(bytes, new DecompressionStream('deflate'), MAX_XML),
      );
    } catch (error) {
      if (error.message.includes('size limit')) throw error;
      throw new Error('Could not decode this build code. Copy a fresh export from Path of Building.');
    }
  }
  parsePoB(xml);
  return xml;
}

export async function encodePoB(xml) {
  const bytes = await transform(new TextEncoder().encode(xml), new CompressionStream('deflate'), MAX_XML);
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(chunks.join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readSections(root) {
  const fallback = newXml();
  return SETS.map(([tag, childTag, activeKey], index) => {
    const section = first(root, tag);
    const sets = direct(section, childTag);
    if (!sets.length) {
      const legacy = fallback.createElement(childTag);
      for (const name of ['treeVersion', 'classId', 'ascendClassId', 'secondaryAscendClassId', 'nodes', 'masteryEffects', 'clusterHashFormatVersion', 'useSecondWeaponSet']) {
        if (section?.hasAttribute(name)) legacy.setAttribute(name, attr(section, name));
      }
      const keep = [['URL', 'Sockets', 'Overrides'], ['Slot', 'SocketIdURL'], ['Skill'], ['Input', 'Placeholder', 'CustomModifierBlock']];
      for (const child of section?.children ?? []) {
        if (keep[index].includes(child.tagName)) legacy.append(fallback.importNode(child, true));
      }
      sets.push(legacy);
    }
    const activeId = attr(section, activeKey);
    const found = index === 0 ? Number(activeId || 1) - 1 : sets.findIndex(set => idOf(set) === activeId);
    return { sets, active: found >= 0 && found < sets.length ? found : 0 };
  });
}

const links = set => attr(set, 'title').match(/\{([a-z\d,]+)\}/i)?.[1].split(',') ?? [];

export function sourceOptions(xml) {
  const root = parsePoB(xml).documentElement;
  const [tree, ...others] = readSections(root);
  return tree.sets.map((spec, index) => {
    const rawTitle = attr(spec, 'title');
    const selection = [index, ...others.map(section => {
      if (index === tree.active) return section.active;
      const match = section.sets.findIndex(set =>
        (rawTitle && attr(set, 'title') === rawTitle) || links(spec).some(link => links(set).includes(link)));
      return match >= 0 ? match : section.active;
    })];
    return {
      title: rawTitle.replace(/\{[a-z\d,]+\}/gi, '').trim() || (tree.sets.length === 1 ? 'Imported build' : `Tree ${index + 1}`),
      selection,
      active: index === tree.active,
      level: index === tree.active ? Number(attr(first(root, 'Build'), 'level')) || null : null,
    };
  });
}

export function originalNotes(xml) {
  return first(parsePoB(xml).documentElement, 'Notes')?.textContent.trim() || '';
}

export function readSnapshot(xml, selection) {
  const root = parsePoB(xml).documentElement;
  const sections = readSections(root);
  const indexes = selection ?? sections.map(section => section.active);
  const [tree, items, skills, config] = sections.map((section, index) => section.sets[indexes[index]]);
  if (!tree || !items || !skills || !config) throw new Error('A selected PoB set is missing.');
  return {
    root, build: first(root, 'Build'), tree, items, skills, config,
    itemLibrary: direct(first(root, 'Items'), 'Item'),
    itemSets: sections[1].sets,
    classKey: attr(tree, 'classId') || attr(first(root, 'Build'), 'className'),
    treeVersion: attr(tree, 'treeVersion'),
    labels: Object.fromEntries(SET_NAMES.map((name, i) => [name, sections[i].sets.map((set, j) =>
      attr(set, 'title') || `Set ${j + 1}`)])),
  };
}

function addElement(doc, parent, tag, attributes = {}, body) {
  const element = doc.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  if (body !== undefined) element.textContent = body;
  parent.append(element);
  return element;
}

function patchInput(doc, config, name, kind, value) {
  direct(config, 'Input').filter(input => attr(input, 'name') === name).forEach(input => input.remove());
  if (value !== null) addElement(doc, config, 'Input', { name, [kind]: value });
}

function applyConfig(doc, config, changes) {
  if (changes.enemy) patchInput(doc, config, 'enemyIsBoss', 'string', changes.enemy);
  if (changes.penalty) patchInput(doc, config, 'resistancePenalty', 'number', changes.penalty);
  for (const [label, toggle, amount] of CONDITIONS) {
    const value = changes[label];
    if (value === undefined || value === '') continue;
    if (toggle) patchInput(doc, config, toggle, 'boolean', value !== '0');
    patchInput(doc, config, amount, 'number', value === 'max' || (toggle && value === '0') ? null : value);
  }
}

function remapItemRefs(node, ids) {
  for (const el of [node, ...node.querySelectorAll('[itemId], [source]')]) {
    const id = attr(el, 'itemId');
    if (id && id !== '0') {
      if (!ids.has(id)) throw new Error(`An equipment or jewel slot refers to missing item ${id}.`);
      el.setAttribute('itemId', ids.get(id));
    }
    const source = attr(el, 'source').match(/^Item:(\d+):(.*)$/s);
    if (source && ids.has(source[1])) el.setAttribute('source', `Item:${ids.get(source[1])}:${source[2]}`);
  }
}

export function itemName(raw) {
  const lines = raw.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const rarity = lines.findIndex(line => /^Rarity: /i.test(line));
  return lines.slice(rarity + 1).find(line => !/^-+$/.test(line)) || 'Custom item';
}

function writeItems(doc, itemSection, stageItems, additions, register) {
  for (const entry of additions) {
    if (!entry.raw.trim()) {
      if (entry.equipped) throw new Error('An equipped override needs an equipment slot and copied item text.');
      continue;
    }
    if (!/^Rarity: (Normal|Magic|Rare|Unique|Relic)\s*$/im.test(entry.raw)) {
      throw new Error(`Paste English item text for ${entry.name || entry.slot || 'the gear alternative'}.`);
    }
    if (entry.equipped && !EQUIPMENT.includes(entry.slot)) {
      throw new Error('Choose an equipment slot for each equipped override.');
    }
    const id = register(addElement(doc, itemSection, 'Item', {}, `\n${entry.raw.trim()}\n`));
    if (entry.slot && entry.equipped) {
      const slot = direct(stageItems, 'Slot').find(slot => attr(slot, 'name') === entry.slot)
        ?? addElement(doc, stageItems, 'Slot', { name: entry.slot, active: !entry.slot.startsWith('Flask') });
      slot.setAttribute('itemId', id);
      slot.removeAttribute('itemPbURL');
    }
  }
}

export function loadoutName(stage, index) {
  return `${String(index + 1).padStart(2, '0')}  ${stage.title.trim().replace(/[{}\r\n^]/g, ' ').replace(/\s+/g, ' ').slice(0, 80) || 'Untitled stage'}`;
}

function editSkills(doc, skills, edits) {
  const groups = direct(skills, 'Skill').filter(group => !attr(group, 'source'));
  for (const [index, values] of Object.entries(edits.gems ?? {})) {
    const [groupIndex, gemIndex] = index.split(':').map(Number);
    const gem = direct(groups[groupIndex], 'Gem')[gemIndex];
    if (!gem) continue;
    for (const key of ['level', 'quality']) if (values[key] !== undefined) gem.setAttribute(key, values[key]);
    if (values.enabled !== undefined) gem.setAttribute('enabled', values.enabled);
  }
  for (const custom of edits.extraGroups ?? []) {
    const group = addElement(doc, skills, 'Skill', { slot: custom.slot, enabled: true, mainActiveSkill: 1 });
    for (const name of custom.gems) {
      addElement(doc, group, 'Gem', { nameSpec: name, level: custom.level, quality: custom.quality, enabled: true, count: 1 });
    }
    groups.push(group);
  }
  const main = groups[edits.main];
  if (main) skills.prepend(main);
}

export function compilePoB(project, notes) {
  if (!project.stages.length) throw new Error('Add at least one stage.');
  const snapshots = project.stages.map((stage, index) => {
    if (!project.sources[stage.source]) throw new Error(`Import a PoB snapshot for ${loadoutName(stage, index)}.`);
    return readSnapshot(project.sources[stage.source].xml, stage.selection);
  });
  const initial = Math.max(0, project.stages.findIndex(stage => stage.id === project.defaultId));
  const base = snapshots[initial];
  if (snapshots.some(snapshot => snapshot.classKey !== base.classKey)) {
    throw new Error('Keep one base class per project. You can use different ascendancies of that class.');
  }
  const doc = newXml();
  const root = doc.documentElement;
  const build = doc.importNode(base.build, true);
  direct(build, 'PlayerStat').forEach(stat => stat.remove());
  direct(build, 'MinionStat').forEach(stat => stat.remove());
  build.removeAttribute('mainSkillIndex');
  const spectres = new Set(direct(build, 'Spectre').map(idOf));
  for (const snapshot of snapshots) {
    for (const spectre of direct(snapshot.build, 'Spectre')) {
      if (spectres.has(idOf(spectre))) continue;
      build.append(doc.importNode(spectre, true));
      spectres.add(idOf(spectre));
    }
  }
  build.setAttribute('mainSocketGroup', '1');
  build.setAttribute('characterLevelAutoMode', 'false');
  build.setAttribute('viewMode', 'NOTES');
  const level = Number(project.stages[initial].level);
  if (Number.isInteger(level) && level >= 1 && level <= 100) build.setAttribute('level', level);
  root.append(build);
  addElement(doc, root, 'Notes', {}, notes);
  const containers = SETS.map(([tag, , active]) => {
    const section = first(base.root, tag);
    const output = section ? doc.importNode(section, false) : doc.createElement(tag);
    output.setAttribute(active, initial + 1);
    root.append(output);
    return output;
  });
  const [, itemSection] = containers;
  const registered = new Map();
  const libraries = new Map();
  const auxiliary = new Map();
  let nextAuxiliaryId = project.stages.length + 1;
  function register(item) {
    item.removeAttribute('id');
    const key = xmlString(item);
    let id = registered.get(key);
    if (!id) {
      id = String(registered.size + 1);
      registered.set(key, id);
      item.setAttribute('id', id);
      itemSection.prepend(item);
    } else {
      item.remove();
    }
    return id;
  }
  project.stages.forEach((stage, index) => {
    const snapshot = snapshots[index];
    const label = loadoutName(stage, index);
    const title = project.stages.length === 1 ? label : `${label} {L${index + 1}}`;
    if (!libraries.has(stage.source)) {
      libraries.set(stage.source, new Map(snapshot.itemLibrary.map(item => [idOf(item), register(doc.importNode(item, true))])));
    }
    const ids = libraries.get(stage.source);
    const copies = SET_NAMES.map((name, section) => {
      const copy = doc.importNode(snapshot[name], true);
      copy.setAttribute('title', title);
      if (section > 0) copy.setAttribute('id', index + 1);
      remapItemRefs(copy, ids);
      containers[section].append(copy);
      return copy;
    });
    const [, items, skills, config] = copies;
    writeItems(doc, itemSection, items, stage.alternatives ?? [], register);
    for (const gem of skills.querySelectorAll('Gem')) {
      for (const field of ['skillMinionItemSet', 'skillMinionItemSetCalcs']) {
        const oldId = attr(gem, field);
        if (!oldId || oldId === '0') continue;
        const oldSet = snapshot.itemSets.find(set => idOf(set) === oldId);
        if (!oldSet) {
          gem.removeAttribute(field);
          continue;
        }
        const key = `${stage.source}:${oldId}`;
        if (!auxiliary.has(key)) {
          const copy = doc.importNode(oldSet, true);
          const id = nextAuxiliaryId++;
          copy.setAttribute('id', id);
          copy.setAttribute('title', `Minion gear ${id - project.stages.length} · ${attr(oldSet, 'title') || 'Imported'}`);
          remapItemRefs(copy, ids);
          auxiliary.set(key, copy);
        }
        gem.setAttribute(field, idOf(auxiliary.get(key)));
      }
    }
    editSkills(doc, skills, stage.edits ?? {});
    applyConfig(doc, config, stage.config ?? {});
  });
  itemSection.append(...auxiliary.values());
  for (const tag of ['Import', 'Party']) {
    const section = first(base.root, tag);
    if (section) root.append(doc.importNode(section, true));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlString(doc)}\n`;
}

export function gemGroups(snapshot) {
  return direct(snapshot.skills, 'Skill').filter(group => !attr(group, 'source')).map(group => ({
    label: attr(group, 'label'), slot: attr(group, 'slot'),
    gems: direct(group, 'Gem').filter(gem => attr(gem, 'nameSpec') || attr(gem, 'skillId')).map(gem => ({
      index: direct(group, 'Gem').indexOf(gem),
      name: attr(gem, 'nameSpec') || attr(gem, 'skillId'),
      level: attr(gem, 'level'), quality: attr(gem, 'quality'),
      enabled: attr(gem, 'enabled') !== 'false',
    })),
  }));
}

export function equippedItems(snapshot) {
  const catalog = new Map(snapshot.itemLibrary.map(item => [idOf(item), itemName(item.textContent)]));
  return direct(snapshot.items, 'Slot').map(slot => ({ slot: attr(slot, 'name'), name: catalog.get(attr(slot, 'itemId')) }))
    .filter(entry => entry.name);
}

export function savedMainGroup(snapshot, selection) {
  const groups = direct(snapshot.skills, 'Skill');
  const section = first(snapshot.root, 'Skills');
  const active = !selection || idOf(snapshot.skills) === attr(section, 'activeSkillSet');
  const index = active ? Number(attr(snapshot.build, 'mainSocketGroup') || 1) - 1 : 0;
  return Math.max(0, groups.filter(group => !attr(group, 'source')).indexOf(groups[index]));
}

export function treeDiff(before, after) {
  if (!before || before.treeVersion !== after?.treeVersion || before.classKey !== after.classKey) return null;
  const nodes = snap => new Set(attr(snap.tree, 'nodes').match(/\d+/g) ?? []);
  const previous = nodes(before);
  const current = nodes(after);
  if (!previous.size || !current.size) return null;
  const mastery = snap => new Map([...attr(snap.tree, 'masteryEffects').matchAll(/\{(\d+),(\d+)\}/g)].map(([, id, value]) => [id, value]));
  const nextMastery = mastery(after);
  return {
    removed: [...previous].filter(id => !current.has(id)).length,
    added: [...current].filter(id => !previous.has(id)).length,
    masteryChanges: [...mastery(before)].filter(([id, value]) => nextMastery.has(id) && nextMastery.get(id) !== value).length,
    ascendancyChanged: ['ascendClassId', 'secondaryAscendClassId'].some(name => attr(before.tree, name) !== attr(after.tree, name)),
  };
}
