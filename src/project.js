import { CONDITIONS, EQUIPMENT, itemName, loadoutName, parsePoB, readSnapshot, savedMainGroup } from './pob.js';

export const STORAGE = 'exile-loadouts-v1';
export const MAX_STAGES = 40;
export const PHASES = { leveling: 'Leveling', transition: 'Transition', endgame: 'Endgame' };
const COLORS = { leveling: '^x8EBEEB', transition: '^xE4AC60', endgame: '^x79DCC5' };
const FIELD_NAMES = ['goal', 'swap', 'priority', 'budget', 'conditions'];
const id = () => crypto.randomUUID();
const str = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : '';
const numberText = (value, min, max) => /^\d+$/.test(String(value)) && Number(value) >= min && Number(value) <= max ? String(value) : '';
const plain = value => value.trim().replace(/\^x[\da-f]{6}|\^\d/gi, '');
const object = value => value && typeof value === 'object' && !Array.isArray(value);

export const newProject = () => ({
  version: 1, title: 'Untitled build', patch: '', overview: '', leagueNotes: [], sources: {}, stages: [], defaultId: '',
});

export function newStage(source, option, xml, title = option?.title || 'New stage') {
  return {
    id: id(), title, phase: 'leveling', source, selection: option?.selection ?? [0, 0, 0, 0],
    level: option?.level ? String(option.level) : '',
    goal: '', swap: '', priority: '', budget: '', conditions: '',
    alternatives: [], config: {},
    edits: { main: option ? savedMainGroup(readSnapshot(xml, option.selection), option.selection) : 0, gems: {}, extraGroups: [] },
  };
}

export function addSource(project, name, xml) {
  const existing = Object.keys(project.sources).find(key => project.sources[key].xml === xml);
  if (existing) return existing;
  const key = id();
  project.sources[key] = { name, xml };
  return key;
}

export function normalizeProject(data) {
  if (!object(data) || data.version !== 1 || !Array.isArray(data.stages) || !object(data.sources) ||
      data.stages.length > MAX_STAGES || Object.keys(data.sources).length > MAX_STAGES) {
    throw new Error('Choose an Exile Loadouts project JSON file.');
  }
  const project = newProject();
  project.title = str(data.title, 100);
  project.patch = str(data.patch, 50);
  if (typeof data.ascendancy === 'string') project.ascendancy = str(data.ascendancy, 60);
  project.overview = str(data.overview, 18000);
  if (Array.isArray(data.leagueNotes)) project.leagueNotes = data.leagueNotes.slice(0, 25).map(note => str(note, 1200)).filter(Boolean);
  const sources = new Map();
  for (const [key, source] of Object.entries(data.sources)) {
    if (!object(source) || typeof source.xml !== 'string') throw new Error('A snapshot in this project is invalid.');
    parsePoB(source.xml);
    sources.set(key, addSource(project, str(source.name, 150) || 'Imported snapshot', source.xml));
  }
  for (const candidate of data.stages) {
    if (!object(candidate)) throw new Error('A stage in this project is invalid.');
    const source = sources.get(candidate.source);
    const stage = newStage(source ?? '', null, null, str(candidate.title, 100));
    stage.phase = Object.hasOwn(PHASES, candidate.phase) ? candidate.phase : 'leveling';
    stage.level = numberText(candidate.level, 1, 100);
    for (const field of FIELD_NAMES) stage[field] = str(candidate[field], 6000);
    if (source) {
      if (!Array.isArray(candidate.selection) || candidate.selection.length !== 4 || !candidate.selection.every(Number.isInteger)) {
        throw new Error('A snapshot set selection in this project is invalid.');
      }
      stage.selection = candidate.selection;
      readSnapshot(project.sources[source].xml, stage.selection);
    }
    if (Array.isArray(candidate.alternatives)) {
      stage.alternatives = candidate.alternatives.slice(0, 50).filter(object).map(entry => ({
        slot: EQUIPMENT.includes(entry.slot) ? entry.slot : '', name: str(entry.name, 140), raw: str(entry.raw, 18000),
        equipped: entry.equipped === true, why: str(entry.why, 1200),
      }));
    }
    if (object(candidate.config)) {
      const settings = candidate.config;
      if (['None', 'Boss', 'Pinnacle', 'Uber'].includes(settings.enemy)) stage.config.enemy = settings.enemy;
      if (['0', '-30', '-60'].includes(settings.penalty)) stage.config.penalty = settings.penalty;
      for (const [label, toggle] of CONDITIONS) {
        stage.config[label] = toggle && settings[label] === 'max' ? 'max' : numberText(settings[label], 0, 999);
      }
    }
    if (object(candidate.edits)) {
      const { main, gems, extraGroups } = candidate.edits;
      stage.edits.main = Number.isInteger(main) && main >= 0 ? main : 0;
      if (Array.isArray(candidate.edits.passiveNodes)) stage.edits.passiveNodes = [...new Set(candidate.edits.passiveNodes
        .map(String).filter(key => /^\d{1,5}$/.test(key)))].slice(0, 180);
      if (object(candidate.edits.links)) stage.edits.links = Object.fromEntries(Object.entries(candidate.edits.links).slice(0, 30)
        .filter(([key, names]) => /^\d+$/.test(key) && Array.isArray(names))
        .map(([key, names]) => [key, names.slice(0, 5).map(name => str(name, 100).trim()).filter(Boolean)]));
      if (object(gems)) {
        for (const [key, gem] of Object.entries(gems).slice(0, 300)) {
          if (!/^\d+:\d+$/.test(key) || !object(gem)) continue;
          const patch = {};
          for (const [field, min] of [['level', 1], ['quality', 0]]) {
            const value = numberText(gem[field], min, 100);
            if (value) patch[field] = value;
          }
          if (typeof gem.enabled === 'boolean') patch.enabled = gem.enabled;
          stage.edits.gems[key] = patch;
        }
      }
      if (Array.isArray(extraGroups)) stage.edits.extraGroups = extraGroups.slice(0, 30).filter(group =>
        object(group) && EQUIPMENT.includes(group.slot) && Array.isArray(group.gems)).map(group => ({
        slot: group.slot, gems: group.gems.slice(0, 6).map(gem => str(gem, 100).trim()).filter(Boolean),
        level: numberText(group.level, 1, 100) || '1', quality: numberText(group.quality, 0, 100) || '0',
      })).filter(group => group.gems.length);
    }
    project.stages.push(stage);
    if (candidate.id === data.defaultId) project.defaultId = stage.id;
  }
  project.defaultId ||= project.stages[0]?.id || '';
  return project;
}

export function pruneSources(project) {
  const used = new Set(project.stages.map(stage => stage.source));
  for (const key of Object.keys(project.sources)) if (!used.has(key)) delete project.sources[key];
}

export function formatGuide(project, { markdown = false, diffs = [] } = {}) {
  const title = plain(project.title) || 'Untitled build';
  const text = [markdown ? `# ${title}` : `^x79DCC5${title}^7`];
  if (project.patch.trim()) text.push(`Path of Exile ${plain(project.patch)}`);
  if (project.overview.trim()) text.push('', plain(project.overview));
  if (project.leagueNotes?.length) {
    text.push('', markdown ? '## Covens of Umbra notes' : '^xE4AC60Covens of Umbra notes^7',
      ...project.leagueNotes.map(note => `- ${plain(note)}`));
  }
  if (project.stages.length && !markdown) text.push('', 'Use Loadouts to switch the tree, items, skills and configuration together. Set your character level for the stage.');
  for (const [index, stage] of project.stages.entries()) {
    const label = loadoutName(stage, index);
    const phase = `${PHASES[stage.phase]}${stage.level ? ` · Level ${stage.level}` : ''}`;
    text.push('', markdown ? `## ${label}` : `${COLORS[stage.phase]}${label}^7`, phase);
    for (const [field, prefix] of [['goal', 'Play'], ['swap', 'Swap when'], ['priority', 'Upgrade order'], ['budget', 'Budget'], ['conditions', 'Calculation assumptions']]) {
      if (stage[field].trim()) text.push(`- ${prefix} — ${plain(stage[field])}`);
    }
    const diff = diffs[index];
    if (diff) text.push(`- Passive tree vs previous stage — ${diff.removed} removed, ${diff.added} added${diff.masteryChanges ? `, ${diff.masteryChanges} mastery choices changed` : ''}${diff.ascendancyChanged ? ', ascendancy differs' : ''}. Confirm actual refund cost in PoB.`);
    if (stage.edits?.passiveNodes?.length) text.push(`- Custom path — ${stage.edits.passiveNodes.length} passive nodes added in the web editor.`);
    for (const entry of stage.alternatives) {
      text.push(`- ${entry.slot || 'Gear'} ${entry.equipped ? 'override' : 'alternative'} — ${plain(entry.name || itemName(entry.raw))}${entry.why.trim() ? `. ${plain(entry.why)}` : ''}`);
    }
  }
  return text.join('\n').trim();
}

export function fileStem(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'exile-loadouts';
}
