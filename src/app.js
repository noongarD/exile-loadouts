import { compilePoB, CONDITIONS, decodePoB, encodePoB, EQUIPMENT, equippedItems, gemGroups, itemIdentity, itemName, originalNotes, readSnapshot, savedMainGroup, sourceOptions, treeDiff } from './pob.js';
import { addSource, fileStem, formatGuide, MAX_STAGES, newProject, newStage, normalizeProject, PHASES, pruneSources, STORAGE } from './project.js';
import { CLASSES, FOCUS_LABELS, normalizeTerms, recommend } from './generator.js';
import { draftRequest, findSkills, firstAcquisition, makeDraft, passivePath } from './planner.js';
import { artwork } from './game-art.js';
import { setupReference } from './reference.js';

const $ = id => document.getElementById(id);
const editor = $('editor-body');
const importDialog = $('import-dialog');
const exportDialog = $('export-dialog');
let project = newProject();
let selected = '';
let tab = 'project';
let pending;
let exported;
let storageAvailable = true;
let buildCatalog;
let buildRequest = 0;
const datasets = new Map();
const draftDialog = $('draft-dialog');
let leaguePageSize = 12;
const snapshots = new Map();
try {
  const saved = localStorage.getItem(STORAGE);
  if (saved) {
    project = normalizeProject(JSON.parse(saved));
    selected = project.defaultId;
  }
} catch {
  storageAvailable = false;
}

function element(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else if (name in node) node[name] = value;
    else node.setAttribute(name, value);
  }
  node.append(...children.filter(child => child != null));
  return node;
}

const button = (label, action, className = 'secondary', props = {}) =>
  element('button', { className, onclick: action, type: 'button', ...props }, label);
const muted = text => element('p', { className: 'muted' }, text);
const grid = (...children) => element('div', { className: 'form-grid' }, ...children);
const actions = (...children) => element('div', { className: 'actions' }, ...children);
const panel = (summary, ...children) => element('details', { className: 'subpanel' }, element('summary', {}, summary), ...children);
const currentStage = () => project.stages.find(stage => stage.id === selected);
const within = (value, min, max) => /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
const inspectGame = setupReference({ element, planner: () => dataset('planner') });

function gemChip(name, className) {
  return element('button', { className: 'gem-chip', type: 'button', onclick: () => inspectGame('gems', name, { className }) },
    artwork('gems', name), element('span', {}, name));
}

function gemChain(gems, className) {
  if (!gems.length) return null;
  return element('div', { className: 'gem-chain', 'aria-label': 'Socket links' }, ...gems.map(name => gemChip(name, className)));
}

function mainGems(stage, snap) {
  const groups = gemGroups(snap);
  const index = stage.edits.main;
  const group = groups[index];
  if (!group) return stage.edits.extraGroups[index - groups.length]?.gems ?? [];
  return [...group.gems.filter(gem => stage.edits.gems[`${index}:${gem.index}`]?.enabled ?? gem.enabled).map(gem => gem.name),
    ...(stage.edits.links?.[index] ?? [])];
}

function status(text = '', error = false, target = $('status')) {
  target.textContent = text;
  target.classList.toggle('error', error);
}

function persist() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(project));
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  updateHeader();
}

function updateHeader() {
  $('project-heading').textContent = project.title.trim() || 'Untitled build';
  $('project-caption').textContent = [project.patch && `Path of Exile ${project.patch}`, storageAvailable ? 'Saved in this browser' : 'Browser storage unavailable. Save a project file.'].filter(Boolean).join(' · ');
  $('export').disabled = !project.stages.length;
  $('workspace-help').hidden = !!project.stages.length;
  document.querySelector('.workspace-grid').hidden = !project.stages.length;
}

function snapshot(stage) {
  const source = stage && project.sources[stage.source];
  if (!source) return null;
  const key = `${stage.source}:${stage.selection.join(',')}`;
  if (!snapshots.has(key)) snapshots.set(key, readSnapshot(source.xml, stage.selection));
  return snapshots.get(key);
}

function comparisons() {
  return project.stages.map((stage, index) => {
    const before = project.stages[index - 1];
    return treeDiff(snapshot(before), snapshot(stage), before?.edits, stage.edits);
  });
}

function field(label, value, update, options = {}) {
  const { multiline, full, placeholder, maxLength = 6000, ...rest } = options;
  const control = element(multiline ? 'textarea' : 'input', {
    value, maxLength, ...(placeholder ? { placeholder } : {}), ...(multiline ? { rows: 2 } : {}), ...rest,
    oninput: event => {
      const input = event.currentTarget;
      if (!input.validity.valid) return;
      update(input.value);
      persist();
    },
  });
  return element('label', { className: `field${full ? ' full' : ''}` }, label, control);
}

function select(label, value, options, update) {
  const control = element('select', { 'aria-label': label, onchange: event => {
    update(event.currentTarget.value);
    persist();
  } }, ...options.map(([value, label]) => element('option', { value }, label)));
  control.value = value;
  return element('label', { className: 'field' }, label, control);
}

function check(label, value, update) {
  return element('label', { className: 'check' }, element('input', { type: 'checkbox', checked: value, onchange: event => {
    update(event.currentTarget.checked);
    persist();
  } }), label);
}

function redrawStages() {
  $('stage-count').textContent = project.stages.length;
  $('add-stage').disabled = project.stages.length >= MAX_STAGES;
  $('stage-list').replaceChildren(...(project.stages.length ? project.stages.map((stage, index) => {
    const b = button('', () => {
      selected = stage.id;
      if (tab === 'project' || tab === 'guide') tab = 'stage';
      render();
    }, 'stage-button', { 'aria-current': String(stage.id === selected) });
    b.append(element('span', { className: 'stage-index' }, String(index + 1).padStart(2, '0')),
      element('span', {}, element('span', { className: 'stage-title' }, stage.title.trim() || 'Untitled stage'),
        element('span', { className: 'stage-meta' }, element('span', { className: `phase-${stage.phase}` }, PHASES[stage.phase]),
          stage.level ? ` · Lv ${stage.level}` : '', stage.id === project.defaultId ? ' · Default' : '')));
    return b;
  }) : [element('p', { className: 'stage-empty' }, 'Import a snapshot or add your first stage.')]));
}

function render() {
  updateHeader();
  redrawStages();
  const stage = currentStage();
  if (!stage && ['stage', 'gear', 'skills'].includes(tab)) tab = 'project';
  $('editor-tabs').replaceChildren(...[
    ['project', 'Project'], ['stage', 'Stage'], ['gear', 'Gear'], ['skills', 'Skills & config'], ['guide', 'Guide'],
  ].map(([key, label]) => button(label, () => { tab = key; render(); }, 'quiet', {
    disabled: ['stage', 'gear', 'skills'].includes(key) && !stage, 'aria-pressed': String(tab === key),
  })));
  editor.replaceChildren();
  if (tab === 'project') showProject();
  if (tab === 'stage') showStage(stage);
  if (tab === 'gear') showGear(stage);
  if (tab === 'skills') showSkills(stage);
  if (tab === 'guide') showGuide();
}

function showProject() {
  editor.append(element('h3', {}, 'Build details'), muted('Name your build and describe what the progression is designed to do.'),
    grid(field('Build name', project.title, value => { project.title = value; }, { maxLength: 100 }),
      field('Patch or league', project.patch, value => { project.patch = value; }, { placeholder: '3.30 · Covens of Umbra', maxLength: 50 }),
      field('Overview', project.overview, value => { project.overview = value; }, { multiline: true, full: true, rows: 4, maxLength: 18000,
        placeholder: 'Core mechanic, strengths, weaknesses and who this build is for.' })));
  if (project.leagueNotes.length) editor.append(panel('Covens of Umbra notes', ...project.leagueNotes.map((note, index) =>
    element('div', { className: 'league-result' }, muted(note), button('Remove note', () => {
      project.leagueNotes.splice(index, 1);
      persist();
      render();
    }, 'quiet danger')))));
}

function move(stage, offset) {
  const index = project.stages.indexOf(stage);
  const other = index + offset;
  [project.stages[index], project.stages[other]] = [project.stages[other], project.stages[index]];
  persist();
  render();
}

function insertStage(stage, index = project.stages.length) {
  project.stages.splice(index, 0, stage);
  project.defaultId ||= stage.id;
  selected = stage.id;
  tab = 'stage';
  persist();
  render();
}

function showStage(stage) {
  const index = project.stages.indexOf(stage);
  const snap = snapshot(stage);
  const defaultButton = button('Set as export default', () => {
    project.defaultId = stage.id;
    persist();
    render();
  }, 'secondary', { disabled: project.defaultId === stage.id });
  const change = field => value => {
    stage[field] = value;
    redrawStages();
  };
  const stageFields = [
    ['How to play', 'goal', 'Main skill, gem links and mechanics to use.'],
    ['Swap when', 'swap', 'Gear, level or charge sustain required before switching.'],
    ['Upgrade order', 'priority', 'What to buy or allocate first.'],
    ['Budget', 'budget', 'Estimated cost or a budget range.'],
    ['Calculation assumptions', 'conditions', 'Boss profile, charges, flasks and other active effects.'],
  ];
  editor.append(element('div', { className: 'editor-head' }, element('h3', {}, 'Stage details'),
    actions(button('↑', () => move(stage, -1), 'icon', { disabled: !index, 'aria-label': 'Move stage up' }),
      button('↓', () => move(stage, 1), 'icon', { disabled: index === project.stages.length - 1, 'aria-label': 'Move stage down' }))),
    element('div', { className: 'form-grid three' },
      field('Stage name', stage.title, change('title'), { maxLength: 100 }),
      select('Phase', stage.phase, Object.entries(PHASES), change('phase')),
      field('Level', stage.level, change('level'), { type: 'number', min: 1, max: 100, step: 1 })),
    element('div', { className: 'snapshot-line' }, muted(snap ? project.sources[stage.source].name : 'No PoB snapshot attached'),
      button(snap ? 'Change snapshot' : 'Attach snapshot', () => openImport(true))),
    ...(snap ? [showSets(stage, snap), stageResearch(stage, snap), ...(snap.treeVersion === '3_29' ? [passiveEditor(stage, snap)] : [])] : []),
    grid(...stageFields.map(([label, key, placeholder], i) =>
      field(label, stage[key], value => { stage[key] = value; }, { multiline: true, full: i === 4, placeholder }))),
    element('div', { className: 'editor-footer' }, defaultButton, actions(
      button('Duplicate', () => {
        const copy = structuredClone(stage);
        copy.id = crypto.randomUUID();
        copy.title = `${stage.title} copy`;
        insertStage(copy, index + 1);
      }, 'quiet', { disabled: project.stages.length >= MAX_STAGES }),
      button('Remove stage', () => {
        if (!confirm(`Remove “${stage.title}”?`)) return;
        project.stages.splice(index, 1);
        selected = project.stages[Math.min(index, project.stages.length - 1)]?.id ?? '';
        if (project.defaultId === stage.id) project.defaultId = project.stages[0]?.id ?? '';
        pruneSources(project);
        snapshots.clear();
        persist();
        render();
      }, 'quiet danger'))));
}

function showSets(stage, snap) {
  const prior = project.stages[project.stages.indexOf(stage) - 1];
  const diff = treeDiff(snapshot(prior), snap, prior?.edits, stage.edits);
  const choose = Object.entries(snap.labels).map(([name, labels], index) =>
    select(`${name[0].toUpperCase()}${name.slice(1)} set`, String(stage.selection[index]),
      labels.map((title, i) => [String(i), title]), value => {
        stage.selection[index] = Number(value);
        if (name === 'tree') delete stage.edits.passiveNodes;
        if (name === 'skills') {
          stage.edits.main = savedMainGroup(snapshot(stage), stage.selection);
          stage.edits.gems = {};
          delete stage.edits.links;
        }
        render();
      }));
  return panel('Snapshot sets and passive changes', grid(...choose), muted(diff
    ? `${diff.removed} removed · ${diff.added} added · ${diff.masteryChanges} mastery choices changed${diff.ascendancyChanged ? ' · Ascendancy differs' : ''}. Check the actual refund cost in PoB.`
    : 'Passive changes appear when this and the previous stage have compatible tree versions.'));
}

function passiveEditor(stage, snap) {
  const search = element('input', { type: 'search', placeholder: 'e.g. Master Fletcher' });
  const rows = element('div', {});
  const feedback = muted('Choose a passive to add the shortest connected route.');
  const reset = button('Reset added passives', () => {
    delete stage.edits.passiveNodes;
    persist();
    showMatches();
  }, 'quiet');
  const details = panel('Plan a passive path', element('label', { className: 'field' }, 'Search passives', search), feedback, rows, reset);
  let data;
  const baseIds = (snap.tree.getAttribute('nodes') || '').split(',').filter(Boolean);
  function showMatches() {
    if (!data) return;
    const added = stage.edits.passiveNodes ?? [];
    reset.disabled = !added.length;
    feedback.textContent = `${added.length} nodes added to this stage. Check your passive-point budget and mastery choices in PoB.`;
    const term = search.value.trim().toLowerCase();
    const selectedIds = [...baseIds, ...added];
    const matches = term.length >= 2 ? Object.entries(data.graph).filter(([id, node]) => !selectedIds.includes(id) &&
      !node[3] && node[2] == null && !node[4] && node[0].toLowerCase().includes(term)).slice(0, 12) : [];
    rows.replaceChildren(...matches.map(([id, node]) => {
      const path = passivePath(data, selectedIds, id);
      const choice = button(`${node[0]} · ${path.length || 'No path'}${path.length ? ' points' : ''}`, () => {
        stage.edits.passiveNodes = [...added, ...path];
        persist();
        showMatches();
      }, 'quiet', { disabled: !path.length || added.length + path.length > 180 });
      choice.prepend(artwork('passives', id));
      return choice;
    }));
  }
  search.oninput = showMatches;
  details.addEventListener('toggle', async () => {
    if (!details.open) return;
    try { data = await dataset('planner'); showMatches(); }
    catch (error) { feedback.textContent = error.message; }
  });
  return details;
}

function gemRoutes(stage, snap, data) {
  const className = snap.build.getAttribute('className');
  const names = [...new Set([...gemGroups(snap).flatMap((group, index) => group.gems
    .filter(gem => stage.edits.gems[`${index}:${gem.index}`]?.enabled ?? gem.enabled).map(gem => gem.name)),
    ...stage.edits.extraGroups.flatMap(group => group.gems), ...Object.values(stage.edits.links ?? {}).flat()])];
  return names.map(name => {
    const route = firstAcquisition(data, name, className);
    if (!route) return { name, text: `${name} · check the gem’s specific acquisition.` };
    const [act, quest, npc, , method] = route;
    return { name, quest, text: `${name} · Act ${act} · ${quest} · ${method === 'quest' ? 'Quest reward' : `Buy from ${npc || 'vendor'}`}` };
  });
}

const routeList = rows => element('ul', { className: 'gem-route-list' }, ...rows.map(({ name, quest, text }) =>
  element('li', {}, artwork('gems', name), element('span', {}, text), quest ? artwork('quests', quest) : null)));

function stageResearch(stage, snap) {
  const output = element('div', {});
  const details = panel('3.30 gem rewards and tree changes', output);
  details.addEventListener('toggle', async () => {
    if (!details.open || output.dataset.loaded) return;
    output.textContent = 'Loading 3.30 data…';
    try {
      const data = await dataset('planner');
      const changes = snap.treeVersion === '3_29' ? (snap.tree.getAttribute('nodes') || '').split(',')
        .map(id => data.treeChanges[id]).filter(Boolean) : [];
      const lines = gemRoutes(stage, snap, data);
      output.dataset.loaded = 'yes';
      output.replaceChildren(...(changes.length ? [muted(`3.30 changed ${[...new Set(changes.map(change => change.name))].join(', ')} in this tree. Review those nodes before migration.`)] : []),
        routeList(lines),
        button('Add gem route to this stage', () => {
          const newText = ['Gem acquisition', ...lines.map(row => row.text)].join('\n');
          if (!stage.goal.includes(newText)) stage.goal = [stage.goal, newText].filter(Boolean).join('\n\n').slice(0, 6000);
          persist();
          render();
          status('Gem route added to the stage notes.');
        }, 'secondary', { disabled: !lines.length }));
    } catch (error) { output.textContent = error.message; }
  });
  return details;
}

function showGear(stage) {
  const snap = snapshot(stage);
  const equipped = snap ? equippedItems(snap) : [];
  for (const entry of stage.alternatives.filter(item => item.equipped && item.slot && item.raw.trim())) {
    const override = { ...itemIdentity(entry.raw), slot: entry.slot, raw: entry.raw };
    const i = equipped.findIndex(item => item.slot === entry.slot);
    if (i === -1) equipped.push(override);
    else equipped[i] = override;
  }
  editor.append(element('h3', {}, 'Gear and alternatives'),
    muted('Add shopping notes or paste an English item copied from the game or PoB. Item text is included in the exported item library.'),
    element('div', { className: 'equipment-grid', 'aria-label': 'Equipment' }, ...(equipped.length ? equipped.map(entry =>
      element('button', { type: 'button', className: `equipment-tile rarity-${entry.rarity}`, onclick: () => inspectGame('equipment', entry.name, entry) },
        artwork('equipment', entry.name, { base: entry.base, rarity: entry.rarity, large: true }), element('span', {},
          element('small', {}, entry.slot), element('strong', {}, entry.name),
          entry.base !== entry.name ? element('small', {}, entry.base) : null))) : [muted('No equipment to show.')])),
    element('div', { className: 'alternative-head' }, element('h4', {}, 'Alternative items'), button('+ Add item', () => {
      stage.alternatives.push({ slot: '', name: '', raw: '', why: '', equipped: false });
      persist();
      render();
      editor.querySelectorAll('.alternative').item(stage.alternatives.length - 1)?.setAttribute('open', '');
    }, 'secondary', { disabled: stage.alternatives.length >= 50 })));
  if (!stage.alternatives.length) editor.append(muted('Add a cheaper item, a higher-budget upgrade or a gear override.'));
  for (const [index, entry] of stage.alternatives.entries()) {
    const details = panel(entry.name || (entry.raw ? itemName(entry.raw) : `Item ${index + 1}`),
      grid(select('Equipment slot', entry.slot, [['', 'Choose slot'], ...EQUIPMENT.map(slot => [slot, slot])], value => { entry.slot = value; }),
        field('Display name', entry.name, value => { entry.name = value; }, { maxLength: 140, placeholder: 'Rare belt with life and resistances' }),
        field('Why use it?', entry.why, value => { entry.why = value; }, { multiline: true, full: true, maxLength: 1200 }),
        field('Item text (optional)', entry.raw, value => { entry.raw = value; }, { multiline: true, full: true, maxLength: 18000, placeholder: 'Rarity: RARE' })),
      element('div', { className: 'editor-footer' },
        check('Equip in this stage', entry.equipped, value => { entry.equipped = value; }),
        button('Remove item', () => { stage.alternatives.splice(index, 1); persist(); render(); }, 'quiet danger')));
    const identity = entry.raw ? itemIdentity(entry.raw) : { name: entry.name };
    if (identity.name) details.querySelector('summary').prepend(artwork('equipment', identity.name, identity));
    details.classList.add('alternative');
    editor.append(details);
  }
}

function showSkills(stage) {
  const snap = snapshot(stage);
  const groups = snap ? gemGroups(snap) : [];
  const edits = stage.edits;
  const className = snap?.build.getAttribute('className');
  const names = groups.map(group => group.label || group.gems.map(gem => gem.name).join(' + ') || group.slot || 'Unnamed group');
  names.push(...edits.extraGroups.map(group => group.gems.join(' + ')));
  editor.append(element('h3', {}, 'Skills and configuration'), muted('Edit socket groups and set combat assumptions for this stage. Path of Building calculates the results after import.'));
  const linksPreview = element('div', {});
  const refreshLinks = () => {
    const chain = snap && gemChain(mainGems(stage, snap), className);
    linksPreview.replaceChildren(...(chain ? [chain] : []));
  };
  if (names.length) editor.append(select('Main skill group', String(edits.main), names.map((name, index) => [String(index), name]), value => {
    edits.main = Number(value);
    refreshLinks();
  }), linksPreview);
  refreshLinks();
  for (const [index, group] of groups.entries()) {
    const links = edits.links?.[index] ?? [];
    const capacity = Math.max(0, 6 - group.gems.length);
    const groupPanel = panel(`${group.slot ? `${group.slot} · ` : ''}${group.label || group.gems[0]?.name || 'Socket group'}`,
      ...group.gems.map(gem => {
        const key = `${index}:${gem.index}`;
        const change = (field, value) => {
          const edit = edits.gems[key] ??= {};
          if (value === '') delete edit[field];
          else edit[field] = value;
          if (field === 'enabled' && index === edits.main) refreshLinks();
        };
        const edit = edits.gems[key] || {};
        return element('div', { className: 'gem-row' }, gemChip(gem.name, className),
          field('Level', edit.level ?? gem.level, value => change('level', value), { type: 'number', min: 1, max: 100 }),
          field('Quality', edit.quality ?? gem.quality, value => change('quality', value), { type: 'number', min: 0, max: 100 }),
          check('Active', edit.enabled ?? gem.enabled, value => change('enabled', value)));
      }), ...(capacity ? [field('Additional support gems', links.join(', '), value => {
        (edits.links ??= {})[index] = value.split(',').map(name => name.trim()).filter(Boolean).slice(0, capacity);
        if (index === edits.main) refreshLinks();
      }, { placeholder: 'e.g. Mirage Archer, Added Cold Damage', maxLength: 500 })] : []));
    if (group.gems.length) groupPanel.querySelector('summary').prepend(artwork('gems', group.gems[0].name));
    editor.append(groupPanel);
  }
  const extras = edits.extraGroups.map((group, index) =>
    element('div', { className: 'snapshot-line' }, `${group.slot} · ${group.gems.join(' + ')} (${group.level}/${group.quality})`,
      button('Remove group', () => {
        edits.extraGroups.splice(index, 1);
        if (edits.main >= groups.length + index) edits.main = edits.main === groups.length + index ? 0 : edits.main - 1;
        persist();
        render();
      }, 'quiet danger')));
  let slot = EQUIPMENT[0];
  let gemText = '';
  let level = '1';
  let quality = '0';
  editor.append(panel('Add socket group', ...extras, grid(select('Slot', slot, EQUIPMENT.map(slot => [slot, slot]), value => { slot = value; }),
    field('Gem names, separated by commas', '', value => { gemText = value; }, { placeholder: 'Flicker Strike, Multistrike' }),
    field('Starting gem level', level, value => { level = value; }, { type: 'number', min: 1, max: 100 }),
    field('Starting gem quality', quality, value => { quality = value; }, { type: 'number', min: 0, max: 100 })),
    element('div', { className: 'editor-footer' }, button('Add socket group', () => {
      const gems = gemText.split(',').map(gem => gem.trim()).filter(Boolean);
      if (!gems.length || gems.length > 6 || !within(level, 1, 100) || !within(quality, 0, 100)) {
        return status('Enter one to six gem names, a level and quality.', true);
      }
      edits.extraGroups.push({ slot, gems, level, quality });
      persist();
      render();
      status('Socket group added.');
    }, 'secondary', { disabled: edits.extraGroups.length >= 30 }))));
  editor.append(panel('Combat configuration', muted('Leave a field blank to inherit the snapshot. For charges and Fortification, use 0 to turn them off or “max” to use the build limit.'),
    grid(select('Enemy', stage.config.enemy || '', [['', 'From snapshot'], ['None', 'Normal enemy'], ['Boss', 'Standard boss'], ['Pinnacle', 'Guardian / Pinnacle'], ['Uber', 'Uber Pinnacle']],
      value => { stage.config.enemy = value; }),
    select('Resistance penalty', stage.config.penalty || '', [['', 'From snapshot'], ['0', 'None'], ['-30', 'After Act 5'], ['-60', 'After Act 10']],
      value => { stage.config.penalty = value; }),
    ...CONDITIONS.map(([label, toggle]) => field(label, stage.config[label] || '', value => {
      stage.config[label] = value.toLowerCase();
    }, { placeholder: toggle ? 'From snapshot · 0 or max' : 'From snapshot · 0–999', pattern: toggle ? '(?:[0-9]{1,3}|[mM][aA][xX])' : '[0-9]{1,3}' })))));
}

function showGuide() {
  editor.append(element('div', { className: 'editor-head' }, element('h3', {}, 'Guide preview'),
    button('Download Markdown', () => downloadGuide(), 'secondary')), muted('The same guide is written to the Notes tab of your PoB export.'),
  element('pre', { className: 'guide' }, formatGuide(project, { markdown: true, diffs: comparisons() })));
}

function openImport(replace = false) {
  pending = undefined;
  $('import-code').value = '';
  $('pob-file').value = '';
  $('keep-notes').checked = false;
  $('import-options').hidden = true;
  $('replace-snapshot').hidden = !currentStage();
  $('replace-snapshot').className = replace ? 'primary' : 'secondary';
  $('append-snapshot').className = replace ? 'secondary' : 'primary';
  status('', false, $('import-error'));
  importDialog.showModal();
}

async function readImport(value, name = 'Pasted PoB export') {
  const read = $('read-import');
  read.disabled = true;
  $('import-options').hidden = true;
  pending = undefined;
  status('Reading build…', false, $('import-error'));
  try {
    const xml = await decodePoB(value);
    const options = sourceOptions(xml);
    pending = { xml, options, name, notes: originalNotes(xml) };
    const control = $('import-selection');
    control.replaceChildren(...options.map((option, index) => element('option', { value: String(index) },
      `${option.title}${option.active ? ' (active)' : ''}`)));
    if (options.length > 1) control.append(element('option', { value: 'all' }, `All ${options.length} snapshots`));
    control.value = String(Math.max(0, options.findIndex(option => option.active)));
    $('append-snapshot').disabled = project.stages.length >= MAX_STAGES;
    $('replace-snapshot').disabled = false;
    $('include-notes').hidden = !pending.notes;
    $('import-options').hidden = false;
    status('Snapshot ready.', false, $('import-error'));
  } catch (error) {
    status(error.message, true, $('import-error'));
  } finally {
    read.disabled = false;
  }
}

$('import-selection').onchange = event => {
  $('replace-snapshot').disabled = event.currentTarget.value === 'all';
};

function applyImport(replace) {
  if (!pending) return;
  const choice = $('import-selection').value;
  const all = choice === 'all';
  const stage = currentStage();
  if (replace && (all || !stage)) return status('Choose a single snapshot to attach to the current stage.', true, $('import-error'));
  const options = all ? pending.options : [pending.options[Number(choice)]];
  if (!replace && project.stages.length + options.length > MAX_STAGES) return status(`A project can have up to ${MAX_STAGES} stages.`, true, $('import-error'));
  const id = addSource(project, pending.name, pending.xml);
  const incoming = options.map(option => newStage(id, option, pending.xml,
    option.title.replace(/^\d{2}\s+/, '')));
  if ($('keep-notes').checked && pending.notes) {
    project.overview = [project.overview, pending.notes].filter(Boolean).join('\n\n').slice(0, 18000);
  }
  if (replace) {
    const [replacement] = incoming;
    if (!stage.level) stage.level = replacement.level;
    stage.source = replacement.source;
    stage.selection = replacement.selection;
    stage.edits = replacement.edits;
  } else {
    project.stages.push(...incoming);
    selected = (all ? incoming.find((_, index) => options[index].active) : incoming[0])?.id ?? incoming[0].id;
    project.defaultId ||= selected;
  }
  tab = 'stage';
  pruneSources(project);
  snapshots.clear();
  persist();
  render();
  importDialog.close();
  $('workspace').scrollIntoView();
  status(replace ? 'Snapshot attached.' : `${incoming.length} ${incoming.length === 1 ? 'stage' : 'stages'} imported.`);
}

function download(text, filename, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = element('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadGuide(text = formatGuide(project, { markdown: true, diffs: comparisons() })) {
  download(text, `${fileStem(project.title)}-guide.md`, 'text/markdown;charset=utf-8');
}

function replaceProject(next, nextTab) {
  project = next;
  selected = project.defaultId;
  tab = nextTab;
  snapshots.clear();
  persist();
  render();
}

function mayReplace() {
  return !(project.stages.length || project.overview || project.patch || project.title !== 'Untitled build')
    || confirm('Replace the current workspace? Save a project file first if you want to keep it.');
}

for (const node of document.querySelectorAll('[data-close]')) node.addEventListener('click', () => $(node.dataset.close).close());
$('hero-import').onclick = () => openImport();
$('import-stage').onclick = () => openImport();
$('read-import').onclick = () => readImport($('import-code').value);
$('pob-file').onchange = async event => {
  const file = event.currentTarget.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) return status('Choose a PoB file under 8 MB.', true, $('import-error'));
  await readImport(await file.text(), file.name);
};
$('append-snapshot').onclick = () => applyImport(false);
$('replace-snapshot').onclick = () => applyImport(true);
$('add-stage').onclick = () => insertStage(newStage('', null, null));
$('new-project').onclick = () => {
  if (mayReplace()) { replaceProject(newProject(), 'project'); status('New workspace created.'); }
};
$('project-file').onchange = async event => {
  const file = event.currentTarget.files[0];
  event.currentTarget.value = '';
  if (!file || !mayReplace()) return;
  try {
    if (file.size > 24 * 1024 * 1024) throw new Error('Choose a project file under 24 MB.');
    replaceProject(normalizeProject(JSON.parse(await file.text())), 'project');
    status('Project opened.');
  } catch (error) {
    status(error.message, true);
  }
};
$('save-project').onclick = () => download(JSON.stringify(project, null, 2), `${fileStem(project.title)}.json`, 'application/json');
async function fetchBuildFile(filename) {
  const response = await fetch(new URL(`../builds/${filename}`, import.meta.url));
  if (!response.ok) throw new Error('The build could not be loaded. Try again in a moment.');
  return response.json();
}

async function catalog() {
  buildCatalog ??= fetchBuildFile('catalog.json').catch(error => {
    buildCatalog = undefined;
    throw error;
  });
  return buildCatalog;
}

function dataset(name) {
  if (!datasets.has(name)) datasets.set(name, fetch(new URL(`../data/${name}.json`, import.meta.url))
    .then(response => {
      if (!response.ok) throw new Error(`Could not load the ${name} data.`);
      return response.json();
    }).catch(error => {
      datasets.delete(name);
      throw error;
    }));
  return datasets.get(name);
}

let draftData;
let draftNote = '';

function populateDraftAscendancies(value = '') {
  const current = draftData.classes.find(row => row.name === $('draft-class').value);
  $('draft-ascendancy').replaceChildren(element('option', { value: '' }, 'Choose later'),
    ...current.ascendancies.map(row => element('option', { value: row.name }, row.name)));
  if (current.ascendancies.some(row => row.name === value)) $('draft-ascendancy').value = value;
}

function drawDraftSkills() {
  const field = $('draft-skill');
  const previous = field.value;
  const query = $('draft-search').value;
  const matching = findSkills(draftData, query);
  field.replaceChildren(...matching.map(gem => element('option', { value: gem.name, disabled: !gem.pob },
    gem.pob ? gem.name : `${gem.name} · requires a PoB update`)));
  const exact = matching.find(gem => gem.name.toLowerCase() === query.trim().toLowerCase());
  field.value = exact?.name ?? (matching.some(gem => gem.name === previous && gem.pob) ? previous : (query ? matching.find(gem => gem.pob)?.name : '')) ?? '';
  updateDraftSkillStatus();
}

function updateDraftSkillStatus() {
  const skill = draftData.gems[$('draft-skill').value];
  $('draft-skill-status').textContent = skill?.pob ? `${skill.name} requires level ${skill.level}+.` :
    skill ? `${skill.name} requires a PoB update to export.` : 'Select an active skill supported by PoB 2.67.2.';
  $('draft-create').disabled = !skill?.pob;
  $('draft-art').replaceChildren(artwork('classes', $('draft-ascendancy').value || $('draft-class').value),
    ...(skill ? [artwork('gems', skill.name, { active: true })] : []));
}

async function openDraft({ description = '' } = {}) {
  if (!draftDialog.open) draftDialog.showModal();
  $('draft-create').disabled = true;
  try {
    draftData = await dataset('planner');
    draftNote = description;
    const { query, choice } = draftRequest(draftData, description, $('build-class').value);
    $('draft-class').replaceChildren(...draftData.classes.map(row => element('option', { value: row.name }, row.name)));
    const match = draftData.classes.find(row => row.name === choice || row.ascendancies.some(asc => asc.name === choice));
    if (match) $('draft-class').value = match.name;
    populateDraftAscendancies(choice);
    $('draft-search').value = query;
    $('draft-skill').value = '';
    drawDraftSkills();
    status('', false, $('draft-status'));
  } catch (error) { status(error.message, true, $('draft-status')); }
}

function attachLeagueNote(name, note, source) {
  if (!project.stages.length) {
    status('Open or create a build before adding a league note.', true, $('league-status'));
    return;
  }
  const line = `${name} · ${note || 'Review its tier, effect and activation conditions.'} ${source}`;
  if (project.leagueNotes.includes(line)) {
    status('This note is already in your build.', false, $('league-status'));
    return;
  }
  if (project.leagueNotes.length >= 25) {
    status('Your build already has 25 league notes.', true, $('league-status'));
    return;
  }
  project.leagueNotes.push(line);
  persist();
  if (tab === 'guide') render();
  status(`${name} added to the build guide.`, false, $('league-status'));
}

async function drawLeague() {
  const query = $('league-search').value.toLowerCase().trim();
  const category = $('league-category').value;
  const output = $('league-results');
  try {
    const data = await dataset('covens');
    if (category !== $('league-category').value || query !== $('league-search').value.toLowerCase().trim()) return;
    const records = category === 'threads' ? data.threads.map(name => ({ name, source: data.topics.find(topic => topic.id === 'threads').source })) : data[category];
    const rows = records.filter(item => `${item.name} ${item.text || ''} ${(item.tags || []).join(' ')}`.toLowerCase().includes(query));
    status(rows.length ? `${rows.length} entries` : 'No league entries match that search.', false, $('league-status'));
    output.replaceChildren(...rows.slice(0, leaguePageSize).map(item => {
      const note = item.text || data.highlights[item.name];
      return element('article', { className: 'league-result' }, element('div', { className: 'icon-heading' },
        artwork(category, category === 'topics' ? item.id : item.name), element('h3', {}, item.name)), note && muted(note),
        actions(button('Add to build notes', () => attachLeagueNote(item.name, note, item.source), 'quiet'),
          element('a', { href: item.source, target: '_blank', rel: 'noopener noreferrer' }, 'Source ↗')));
    }));
    $('league-more').hidden = rows.length <= leaguePageSize;
  } catch (error) { status(error.message, true, $('league-status')); }
}

$('draft-open').onclick = () => openDraft({ description: $('build-prompt').value });
$('draft-class').onchange = () => { populateDraftAscendancies(); updateDraftSkillStatus(); };
$('draft-ascendancy').onchange = updateDraftSkillStatus;
$('draft-search').oninput = drawDraftSkills;
$('draft-skill').onchange = updateDraftSkillStatus;
$('draft-form').onsubmit = event => {
  event.preventDefault();
  try {
    const next = makeDraft(draftData, { className: $('draft-class').value, ascendancy: $('draft-ascendancy').value,
      skillName: $('draft-skill').value, notes: draftNote });
    if (!mayReplace()) return;
    replaceProject(next, 'stage');
    draftDialog.close();
    $('workspace').scrollIntoView({ block: 'start' });
    status('Draft created. Refine the tree, links and gear before comparing performance.');
  } catch (error) { status(error.message, true, $('draft-status')); }
};
for (const id of ['league-category', 'league-search']) $(id).oninput = () => { leaguePageSize = 12; drawLeague(); };
$('league-more').onclick = () => { leaguePageSize += 12; drawLeague(); };
drawLeague();

async function loadGeneratedProject(template, focus) {
  const data = await fetchBuildFile(template.file);
  data.defaultId = data.stages[template.profiles[focus]].id;
  return normalizeProject(data);
}

async function showGeneratedBuild(template, focus, reason, requested = focus, budgetFocus = '', hints = [], alternatives = []) {
  const results = $('build-results');
  const request = ++buildRequest;
  results.hidden = false;
  results.replaceChildren(muted('Preparing your build…'));
  try {
    const [generated, data] = await Promise.all([loadGeneratedProject(template, focus), dataset('planner')]);
    if (request !== buildRequest) return;
    const initial = generated.stages.find(stage => stage.id === generated.defaultId);
    const firstStage = generated.stages[0];
    const firstSnapshot = readSnapshot(generated.sources[firstStage.source].xml, firstStage.selection);
    const initialSnapshot = readSnapshot(generated.sources[initial.source].xml, initial.selection);
    const routes = gemRoutes(firstStage, firstSnapshot, data);
    const treeVersion = initialSnapshot.treeVersion;
    const link = template.links[focus];
    const profileLabel = link ? 'Open on pobb.in ↗' : 'Original guide PoB ↗';
    const feedback = element('p', { className: 'feedback', role: 'status' });
    const openEditor = button('Edit this build', () => {
      if (!mayReplace()) return;
      replaceProject(structuredClone(generated), 'stage');
      $('workspace').scrollIntoView({ block: 'start' });
      status('Build loaded into the editor.');
    });
    const copy = button('Copy PoB code', async () => {
      try {
        const diffs = generated.stages.map((stage, index) => {
          const read = entry => entry && readSnapshot(generated.sources[entry.source].xml, entry.selection);
          return treeDiff(read(generated.stages[index - 1]), read(stage));
        });
        const xml = compilePoB(generated, formatGuide(generated, { diffs }));
        await navigator.clipboard.writeText(await encodePoB(xml));
        status('PoB import code copied.', false, feedback);
      } catch (error) {
        status(error.message, true, feedback);
      }
    }, 'quiet');
    const title = element('h2', { id: 'result-title', tabIndex: -1 }, template.title);
    results.replaceChildren(element('article', { className: 'panel generated-card', 'aria-labelledby': 'result-title' },
      element('p', { className: 'eyebrow' }, `${reason} · ${template.className} / ${template.ascendancy}`),
      artwork('classes', template.ascendancy, { large: true }),
      element('div', { className: 'icon-heading' }, artwork('gems', template.skill, { active: true, large: true }), title), muted(template.summary),
      ...(hints.length ? [element('p', { className: 'match-hints' }, `Matched on ${[...new Set(hints)].join(' · ')}`)] : []),
      ...(template.firstTip && template.firstTip !== template.summary ? [element('p', { className: 'first-tip' }, template.firstTip)] : []),
      element('div', { className: 'result-meta' }, `${FOCUS_LABELS[focus]} · Opens at ${initial.title} · ${generated.stages.length} loadouts`),
      gemChain(mainGems(initial, initialSnapshot), template.className),
      ...(budgetFocus && Object.hasOwn(template.profiles, budgetFocus) ? [muted(`Your budget preference opens the lower-investment stage. The ${FOCUS_LABELS[budgetFocus].toLowerCase()} loadout is also included.`)] : []),
      ...(requested !== focus ? [muted(`The catalog has no dedicated ${FOCUS_LABELS[requested].toLowerCase()} loadout for this build. It opens on ${FOCUS_LABELS[focus].toLowerCase()}.`)] : []),
      element('ol', { className: 'result-stages', 'aria-label': 'Build progression' }, ...generated.stages.map(stage =>
        element('li', { className: `phase-${stage.phase}` }, stage.title))),
      element('details', { className: 'subpanel first-loadout' }, element('summary', {}, `Start here · ${firstStage.title}`),
        firstStage.goal && muted(firstStage.goal), firstStage.priority && muted(firstStage.priority),
        routes.length ? panel('Where to get the gems', routeList(routes)) : null,
        button('Open the first loadout in the editor', () => {
          if (!mayReplace()) return;
          replaceProject(structuredClone(generated), 'stage');
          selected = project.stages[0].id;
          render();
          $('workspace').scrollIntoView({ block: 'start' });
        }, 'secondary')),
      actions((link || template.reference) && element('a', { className: 'button primary', href: link || template.reference, target: '_blank', rel: 'noopener noreferrer' }, profileLabel), openEditor, copy),
      feedback,
      element('p', { className: 'muted credit' }, 'Build reference by ',
        element('a', { href: template.guide, target: '_blank', rel: 'noopener noreferrer' }, template.author),
        treeVersion ? ` · PoB tree ${treeVersion.replaceAll('_', '.')}` : ''),
      ...(alternatives.length ? [element('div', { className: 'related-builds' }, muted('Other matches'),
        actions(...alternatives.map(other => button(other.title, () => showGeneratedBuild(other, other.defaultFocus, 'Other match'), 'secondary'))))] : [])));
    results.scrollIntoView({ block: 'nearest' });
    title.focus({ preventScroll: true });
  } catch (error) {
    if (request === buildRequest) results.replaceChildren(element('p', { role: 'alert', className: 'error' }, error.message));
  }
}

const DIFFICULTY = { easy: 'Good first build', medium: 'Some setup', advanced: 'More setup' };

function showBuildChoices(templates, heading, message, draftAction, browse = false) {
  buildRequest++;
  const results = $('build-results');
  const cards = element('div', { className: 'catalog-grid' });
  const search = element('input', { type: 'search', placeholder: 'e.g. minions, Deadeye or Sunder' });
  const difficulty = element('select', {}, element('option', { value: '' }, 'Any difficulty'),
    ...Object.entries(DIFFICULTY).map(([value, label]) => element('option', { value }, label)));
  const count = element('p', { className: 'muted catalog-count', role: 'status' });
  function drawCards() {
    const words = normalizeTerms(search.value).split(' ').filter(Boolean);
    const visible = templates.filter(template => {
      const body = normalizeTerms([template.title, template.className, template.ascendancy, ...template.aliases, ...template.styles].join(' '));
      return (!difficulty.value || template.beginner === difficulty.value) && words.every(word => body.includes(word));
    });
    count.textContent = `${visible.length} of ${templates.length} builds`;
    cards.replaceChildren(...visible.map(template => element('article', { className: 'panel catalog-card' },
      artwork('classes', template.ascendancy, { large: true }),
      element('p', { className: 'eyebrow' }, [template.ascendancy, DIFFICULTY[template.beginner]].filter(Boolean).join(' · ')),
      element('div', { className: 'icon-heading' }, artwork('gems', template.skill, { active: true }), element('h3', {}, template.title)), muted(template.summary),
      button('Generate this build', () => showGeneratedBuild(template, template.defaultFocus, 'Selected build')))));
    if (browse && !visible.length) cards.append(muted('Try a different skill, class or difficulty.'));
  }
  search.addEventListener('input', drawCards);
  difficulty.addEventListener('change', drawCards);
  drawCards();
  const title = element('h2', { tabIndex: -1 }, heading);
  results.hidden = false;
  results.replaceChildren(title, ...(message ? [muted(message)] : []),
    ...(draftAction ? [button('Make a custom draft', draftAction)] : []),
    ...(browse ? [element('div', { className: 'form-grid catalog-filters' },
      element('label', { className: 'field' }, 'Search builds', search),
      element('label', { className: 'field' }, 'Difficulty', difficulty)),
      count] : []), cards,
    ...(browse ? [element('p', { className: 'muted credit' }, 'Softcore Trade. Popular skill selections informed by the early Covens ladder on November 14, 2026. ',
      element('a', { href: 'https://poe.ninja/poe1/builds/covens', target: '_blank', rel: 'noopener noreferrer' }, 'Covens ladder ↗'))] : []));
  results.scrollIntoView({ block: 'nearest' });
  title.focus({ preventScroll: true });
}

for (const [className, ascendancies] of Object.entries(CLASSES)) {
  const group = element('optgroup', { label: className }, element('option', { value: className }, `Any ${className}`),
    ...ascendancies.map(name => element('option', { value: name }, name)));
  $('build-class').append(group);
}
$('build-request').onsubmit = async event => {
  event.preventDefault();
  const trigger = $('generate');
  trigger.disabled = true;
  try {
    const templates = await catalog();
    const description = $('build-prompt').value;
    const choice = $('build-class').value;
    const data = await dataset('planner');
    const result = recommend(templates, { description, choice, focus: $('build-focus').value, playstyle: $('build-style').value, gems: data.gems });
    if (result.kind === 'match') await showGeneratedBuild(result.template, result.profile, result.reason, result.preference, result.budgetFocus, result.hints, result.alternatives);
    else {
      showBuildChoices(result.suggestions ?? [], 'No matching build', result.message, result.allowDraft === false ? null : () => openDraft({ description }));
    }
  } catch (error) {
    showBuildChoices([], 'Build generator unavailable', error.message);
  } finally {
    trigger.disabled = false;
  }
};
$('show-templates').onclick = async () => {
  try {
    showBuildChoices(await catalog(), 'Build library', 'Choose a skill or filter for a good first build.', null, true);
  } catch (error) {
    showBuildChoices([], 'Build generator unavailable', error.message);
  }
};
for (const chip of document.querySelectorAll('[data-prompt]')) chip.onclick = () => {
  $('build-prompt').value = chip.dataset.prompt;
  $('build-class').value = '';
  $('build-focus').value = '';
  $('build-style').value = '';
  $('build-request').requestSubmit();
};
$('export').onclick = async () => {
  $('export').disabled = true;
  try {
    const diffs = comparisons();
    const xml = compilePoB(project, formatGuide(project, { diffs }));
    exported = { xml, guide: formatGuide(project, { markdown: true, diffs }) };
    $('export-code').value = await encodePoB(xml);
    status('', false, $('export-status'));
    exportDialog.showModal();
  } catch (error) {
    status(error.message, true);
  } finally {
    updateHeader();
  }
};
$('copy-code').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('export-code').value);
    status('Build code copied.', false, $('export-status'));
  } catch {
    $('export-code').select();
    status('Use your keyboard shortcut to copy the selected code.', false, $('export-status'));
  }
};
$('download-xml').onclick = () => download(exported.xml, `${fileStem(project.title)}.xml`, 'application/xml;charset=utf-8');
$('download-guide').onclick = () => downloadGuide(exported.guide);
render();
