import { compilePoB, CONDITIONS, decodePoB, encodePoB, EQUIPMENT, equippedItems, gemGroups, itemName, originalNotes, readSnapshot, savedMainGroup, sourceOptions, treeDiff } from './pob.js';
import { addSource, fileStem, formatGuide, MAX_STAGES, newProject, newStage, normalizeProject, PHASES, pruneSources, STORAGE } from './project.js';

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
}

function snapshot(stage) {
  const source = stage && project.sources[stage.source];
  if (!source) return null;
  const key = `${stage.source}:${stage.selection.join(',')}`;
  if (!snapshots.has(key)) snapshots.set(key, readSnapshot(source.xml, stage.selection));
  return snapshots.get(key);
}

function comparisons() {
  return project.stages.map((stage, index) => treeDiff(snapshot(project.stages[index - 1]), snapshot(stage)));
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
    ...(snap ? [showSets(stage, snap)] : []),
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
  const before = snapshot(project.stages[project.stages.indexOf(stage) - 1]);
  const diff = treeDiff(before, snap);
  const choose = Object.entries(snap.labels).map(([name, labels], index) =>
    select(`${name[0].toUpperCase()}${name.slice(1)} set`, String(stage.selection[index]),
      labels.map((title, i) => [String(i), title]), value => {
        stage.selection[index] = Number(value);
        if (name === 'skills') {
          stage.edits.main = savedMainGroup(snapshot(stage), stage.selection);
          stage.edits.gems = {};
        }
        render();
      }));
  return panel('Snapshot sets and passive changes', grid(...choose), muted(diff
    ? `${diff.removed} removed · ${diff.added} added · ${diff.masteryChanges} mastery choices changed${diff.ascendancyChanged ? ' · Ascendancy differs' : ''}. Check the actual refund cost in PoB.`
    : 'Passive changes appear when this and the previous stage have compatible tree versions.'));
}

function showGear(stage) {
  const snap = snapshot(stage);
  const equipped = snap ? equippedItems(snap) : [];
  editor.append(element('h3', {}, 'Gear and alternatives'),
    muted('Add shopping notes or paste an English item copied from the game or PoB. Item text is included in the exported item library.'),
    panel('Equipment from the snapshot', ...(equipped.length ? equipped.map(entry =>
      element('div', { className: 'gear-row' }, element('span', { className: 'muted' }, entry.slot), entry.name)) : [muted('No equipment to show.')])),
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
    details.classList.add('alternative');
    editor.append(details);
  }
}

function showSkills(stage) {
  const snap = snapshot(stage);
  const groups = snap ? gemGroups(snap) : [];
  const edits = stage.edits;
  const names = groups.map(group => group.label || group.gems.map(gem => gem.name).join(' + ') || group.slot || 'Unnamed group');
  names.push(...edits.extraGroups.map(group => group.gems.join(' + ')));
  editor.append(element('h3', {}, 'Skills and configuration'), muted('Edit socket groups and set combat assumptions for this stage. Path of Building calculates the results after import.'));
  if (names.length) editor.append(select('Main skill group', String(edits.main), names.map((name, index) => [String(index), name]), value => { edits.main = Number(value); }));
  for (const [index, group] of groups.entries()) {
    editor.append(panel(`${group.slot ? `${group.slot} · ` : ''}${group.label || group.gems[0]?.name || 'Socket group'}`,
      ...group.gems.map(gem => {
        const key = `${index}:${gem.index}`;
        const change = (field, value) => {
          const edit = edits.gems[key] ??= {};
          if (value === '') delete edit[field];
          else edit[field] = value;
        };
        const edit = edits.gems[key] || {};
        return element('div', { className: 'gem-row' }, element('span', {}, gem.name),
          field('Level', edit.level ?? gem.level, value => change('level', value), { type: 'number', min: 1, max: 100 }),
          field('Quality', edit.quality ?? gem.quality, value => change('quality', value), { type: 'number', min: 0, max: 100 }),
          check('Active', edit.enabled ?? gem.enabled, value => change('enabled', value)));
      })));
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
$('demo').onclick = async () => {
  if (!mayReplace()) return;
  $('demo').disabled = true;
  try {
    const response = await fetch(new URL('../examples/flicker-strike.json', import.meta.url));
    if (!response.ok) throw new Error('The example could not be loaded.');
    replaceProject(normalizeProject(await response.json()), 'stage');
    $('workspace').scrollIntoView();
    status('Flicker Strike example loaded.');
  } catch (error) {
    status(error.message, true);
  } finally {
    $('demo').disabled = false;
  }
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
