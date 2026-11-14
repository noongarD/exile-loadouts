import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { inflateSync, deflateSync } from 'node:zlib';

const fixture = new URL('../examples/flicker-strike.json', import.meta.url);
const example = JSON.parse(await readFile(fixture, 'utf8'));
const desktopXml = process.env.POB_VERIFY_XML;

test('exports the demo with linked loadouts and a persistent editable project', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Budget Flicker' }).click();
  await page.getByRole('button', { name: 'Edit this build' }).click();
  await expect(page.locator('#stage-list button')).toHaveCount(8);
  await expect(page.getByRole('button', { name: /Rakiata · Budget endgame/ })).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect(page.locator('pre')).toContainText('Upgrade order');
  await expect(page.locator('pre')).toContainText('Passive tree vs previous stage');
  await page.getByRole('button', { name: 'Export build' }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
  const code = await page.getByLabel('Path of Building code').inputValue();
  const xml = inflateSync(Buffer.from(code, 'base64url')).toString('utf8');
  const result = await page.evaluate(xml => {
    const root = new DOMParser().parseFromString(xml, 'text/xml');
    return {
      counts: ['Tree > Spec', 'Items > ItemSet', 'Skills > SkillSet', 'Config > ConfigSet'].map(selector => root.querySelectorAll(selector).length),
      active: ['activeSpec', 'activeItemSet', 'activeSkillSet', 'activeConfigSet'].map(attr => root.querySelector(`[${attr}]`).getAttribute(attr)),
      notes: root.querySelector('Notes').textContent,
      items: [...root.querySelectorAll('Items > Item')].map(item => item.getAttribute('id')),
      references: [...root.querySelectorAll('[itemId]')].map(node => node.getAttribute('itemId')),
    };
  }, xml);
  expect(result.counts).toEqual([8, 8, 8, 8]);
  expect(result.active).toEqual(['6', '6', '6', '6']);
  expect(result.notes).toContain('^x79DCC506  Rakiata');
  expect(result.notes).toContain('Rare Tower Shield');
  expect(result.references.every(id => id === '0' || result.items.includes(id))).toBeTruthy();
  if (desktopXml) await (await import('node:fs/promises')).writeFile(desktopXml, xml);
  await page.getByRole('button', { name: 'Close' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Flicker Strike Slayer' })).toBeVisible();
  await expect(page.locator('#stage-list button')).toHaveCount(8);
  expect(errors).toEqual([]);
});

test('imports pasted code, edits a build and reopens its JSON backup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Import PoB', exact: true }).click();
  await page.getByLabel('Build code or XML').fill('invalid export');
  await page.getByRole('button', { name: 'Read build' }).click();
  await expect(page.locator('#import-error')).toContainText('Could not decode');
  const code = deflateSync(example.sources.flicker.xml).toString('base64url');
  await page.getByLabel('Build code or XML').fill(code);
  await page.getByRole('button', { name: 'Read build' }).click();
  await page.getByRole('button', { name: 'Add to progression' }).click();
  await expect(page.locator('#stage-list button')).toHaveCount(1);
  await page.getByLabel('Stage name').fill('Custom stage');
  await page.getByLabel('Phase').selectOption('endgame');
  await page.getByLabel('Level', { exact: true }).fill('96');
  await page.getByLabel('Swap when').fill('Get a six-link chest.');
  await page.getByRole('button', { name: 'Skills & config' }).click();
  await page.locator('summary').filter({ hasText: 'Flicker Strike' }).first().click();
  await page.getByLabel('Quality', { exact: true }).first().fill('23');
  await page.getByText('Combat configuration', { exact: true }).click();
  await page.getByLabel('Enemy', { exact: true }).selectOption('Uber');
  await page.getByLabel('Power', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await page.getByRole('button', { name: '+ Add item' }).click();
  await page.getByLabel('Display name').fill('Rare belt with chaos resistance');
  await page.getByLabel('Equipment slot').selectOption('Belt');
  await page.getByRole('button', { name: 'Export build' }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
  const xml = inflateSync(Buffer.from(await page.getByLabel('Path of Building code').inputValue(), 'base64url')).toString('utf8');
  expect(xml).toContain('level="96"');
  expect(xml).toMatch(/nameSpec="Flicker Strike"[^>]*quality="23"|quality="23"[^>]*nameSpec="Flicker Strike"/);
  expect(xml).toContain('name="enemyIsBoss" string="Uber"');
  expect(xml).toContain('name="usePowerCharges" boolean="false"');
  expect(xml).toContain('Rare belt with chaos resistance');
  await page.getByRole('button', { name: 'Close' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save project' }).click(),
  ]);
  const downloadPath = await download.path();
  expect(JSON.parse(await readFile(downloadPath, 'utf8')).stages[0].title).toBe('Custom stage');
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.locator('#stage-list button')).toHaveCount(0);
  await page.locator('#project-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: await readFile(downloadPath) });
  await expect(page.locator('#stage-list button')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Custom stage/ })).toBeVisible();
});

test('remaps independent snapshots and gear references without merging unrelated item IDs', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { compilePoB, sourceOptions } = await import('/src/pob.js');
    const xml = (item, skill) => `<PathOfBuilding><Build className="Duelist" level="90"/>
      <Tree><Spec classId="4" treeVersion="3_29" nodes="50986"><Sockets><Socket nodeId="3" itemId="1"/></Sockets></Spec></Tree>
      <Items><Item id="1">Rarity: RARE&#10;${item}&#10;Viridian Jewel</Item><ItemSet id="1" title="Main"><Slot name="Ring 1" itemId="1"/></ItemSet>
      <ItemSet id="2" title="Minions"><Slot name="Ring 2" itemId="1"/></ItemSet></Items>
      <Skills><SkillSet id="1"><Skill><Gem nameSpec="${skill}" skillMinionItemSet="2"/></Skill><Skill source="Item:1:${item}"/></SkillSet></Skills>
      <Config><ConfigSet id="1"/></Config></PathOfBuilding>`;
    const sources = { one: { xml: xml('First', 'Raise Spectre') }, two: { xml: xml('Second', 'Summon Skeletons') } };
    const stages = Object.entries(sources).map(([source, data], index) => ({
      source, title: `Stage ${index + 1}`, id: source, selection: sourceOptions(data.xml)[0].selection, edits: { main: 0 },
    }));
    const output = new DOMParser().parseFromString(compilePoB({ sources, stages, defaultId: 'one' }, 'Notes'), 'text/xml');
    return {
      items: [...output.querySelectorAll('Item')].map(el => el.id || el.getAttribute('id')).sort(),
      slots: [...output.querySelectorAll('ItemSet > Slot')].map(el => el.getAttribute('itemId')),
      jewels: [...output.querySelectorAll('Socket')].map(el => el.getAttribute('itemId')),
      granted: [...output.querySelectorAll('Skill[source]')].map(el => el.getAttribute('source')),
      minions: [...output.querySelectorAll('Gem')].map(el => el.getAttribute('skillMinionItemSet')),
    };
  });
  expect(result).toEqual({ items: ['1', '2'], slots: ['1', '2', '1', '2'], jewels: ['1', '2'], granted: ['Item:1:First', 'Item:2:Second'], minions: ['3', '4'] });
});

test('fits the progression editor on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Budget Flicker' }).click();
  await page.getByRole('button', { name: 'Edit this build' }).click();
  await expect(page.locator('#stage-list button')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.getByRole('button', { name: 'Export build' }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
});

test('generates a PoB from a description or a class without a prior import', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  const result = page.locator('#build-results');
  const generate = page.getByRole('button', { name: 'Generate build', exact: true });
  await page.getByLabel('Describe your build').fill('Chcę Flicker Strike pod przeżywalność');
  await generate.click();
  await expect(result.getByRole('heading', { name: 'Flicker Strike Slayer' })).toBeVisible();
  await expect(result).toContainText('Opens at The Surrender · Defence');
  await expect(result.getByRole('link', { name: 'Open on pobb.in' })).toHaveAttribute('href', /^https:\/\/pobb\.in\/[A-Za-z0-9_-]{12}$/);
  await result.getByRole('button', { name: 'Copy PoB code' }).click();
  await expect(result).toContainText('PoB import code copied.');
  const code = await page.evaluate(() => navigator.clipboard.readText());
  expect(inflateSync(Buffer.from(code, 'base64url')).toString('utf8')).toContain('activeSpec="8"');
  await page.getByLabel('Describe your build').clear();
  await page.locator('#builder-preferences > summary').click();
  await page.getByLabel('Class or ascendancy').selectOption('Deadeye');
  await generate.click();
  await expect(result.getByRole('heading', { name: 'Lightning Arrow Deadeye' })).toBeVisible();
  await page.getByLabel('Describe your build').fill('Tornado Shot');
  await generate.click();
  await expect(result).toContainText('No template for tornado shot');
  await expect(result.getByRole('link', { name: 'Open on pobb.in' })).toHaveCount(0);
});

test('includes a bossing loadout when prioritizing a budget start', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Describe your build').fill('cheap Witch minions for bossing');
  await page.getByRole('button', { name: 'Generate build', exact: true }).click();
  const result = page.locator('#build-results');
  await expect(result).toContainText('Poison Summon Raging Spirit Necromancer');
  await expect(result).toContainText('Opens at Atlas · Early endgame');
  await expect(result).toContainText('The bossing loadout is also included.');
  await page.locator('#builder-preferences > summary').click();
  await page.getByLabel('Priority').selectOption('bossing');
  await page.getByRole('button', { name: 'Generate build', exact: true }).click();
  await expect(result).toContainText('Opens at Endgame · Poison SRS');
});

test('creates an exportable draft for a skill outside the catalog', async ({ page }) => {
  await page.goto('/');
  await page.locator('#builder-preferences > summary').click();
  await page.getByLabel('Class or ascendancy').selectOption('Deadeye');
  await page.getByLabel('Describe your build').fill('Tornado Shot');
  await page.getByRole('button', { name: 'Generate build', exact: true }).click();
  await page.getByRole('button', { name: 'Make a custom draft' }).click();
  const form = page.getByRole('dialog', { name: 'New build draft' });
  await expect(form.getByLabel('Base class')).toHaveValue('Ranger');
  await expect(form.getByLabel('Active skill', { exact: true })).toHaveValue('Tornado Shot');
  await form.getByRole('button', { name: 'Create editable PoB' }).click();
  await expect(page.getByRole('heading', { name: 'Tornado Shot Deadeye' })).toBeVisible();
  await expect(page.locator('#stage-list button')).toHaveCount(3);
  await page.getByRole('button', { name: /Early maps/ }).click();
  await page.getByText('Plan a passive path', { exact: true }).click();
  await page.getByLabel('Search passives').fill('Master Fletcher');
  await page.getByRole('button', { name: /Master Fletcher.*points/ }).first().click();
  await page.getByRole('button', { name: 'Skills & config' }).click();
  await page.getByText('Body Armour · Tornado Shot', { exact: true }).click();
  await page.getByLabel('Additional support gems').fill('Mirage Archer');
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await page.getByText('3.30 gem rewards and tree changes', { exact: true }).click();
  await page.getByRole('button', { name: 'Add gem route to this stage' }).click();
  await page.getByRole('button', { name: 'Set as export default' }).click();
  await page.getByRole('button', { name: 'Export build' }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
  const code = await page.getByLabel('Path of Building code').inputValue();
  const xml = inflateSync(Buffer.from(code, 'base64url')).toString('utf8');
  expect(xml).toContain('treeVersion="3_29"');
  expect(xml).toContain('nameSpec="Tornado Shot"');
  expect(xml).toContain('nameSpec="Mirage Archer"');
  expect(xml).toContain('activeSpec="3"');
  expect(xml).toContain('Custom path');
  expect(xml).toContain('Gem acquisition');
});

test('uses natural playstyle, exclusions, destination skills and close spellings', async ({ page }) => {
  await page.goto('/');
  const prompt = page.getByLabel('Describe your build');
  const generate = page.getByRole('button', { name: 'Generate build', exact: true });
  const result = page.locator('#build-results');
  for (const [description, name] of [
    ['Chcę tankowaty build i palić wszystko wokół', 'Righteous Fire Chieftain'],
    ['I don’t want minions. I want a fast bow mapper', 'Lightning Arrow Deadeye'],
    ['Level with Rain of Arrows then use eHoTS', 'Elemental Hit of the Spectrum Deadeye'],
    ['Vaal Absolution Necro', 'Absolution Necromancer'],
    ['Absolutoin Necro', 'Absolution Necromancer'],
    ['Penance Brnad', 'Penance Brand Ignite Elementalist'],
  ]) {
    await prompt.fill(description);
    await generate.click();
    await expect(result.getByRole('heading', { name, exact: true })).toBeVisible();
  }
});

test('offers a searchable library with an easy first build filter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Browse builds' }).click();
  const result = page.locator('#build-results');
  await expect(result.getByRole('heading', { name: 'Build library' })).toBeVisible();
  await expect(result.getByRole('status')).toHaveText('18 of 18 builds');
  await result.getByLabel('Search builds').fill('static strike');
  await expect(result.getByRole('status')).toHaveText('3 of 18 builds');
  await result.getByLabel('Difficulty').selectOption('easy');
  await expect(result.getByRole('heading', { name: 'Static Strike Guardian', exact: true })).toBeVisible();
  await expect(result.getByRole('status')).toHaveText('1 of 18 builds');
  await result.getByRole('button', { name: 'Generate this build' }).click();
  await expect(result.getByRole('link', { name: 'Open on pobb.in' })).toBeVisible();
});

test('saves a 3.30 league note inside the exported PoB', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Budget Flicker' }).click();
  await page.getByRole('button', { name: 'Edit this build' }).click();
  await page.getByLabel('League category', { exact: true }).selectOption('viscera');
  await page.getByLabel('Search league data').fill('Maven');
  const item = page.locator('.league-result').filter({ has: page.getByRole('heading', { name: "Maven's Orrery" }) });
  await item.getByRole('button', { name: 'Add to build notes' }).click();
  await expect(page.locator('#league-status')).toContainText('added to the build guide');
  await page.getByRole('button', { name: 'Export build' }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
  const code = await page.getByLabel('Path of Building code').inputValue();
  const xml = inflateSync(Buffer.from(code, 'base64url')).toString('utf8');
  expect(xml).toContain('Covens of Umbra notes');
  expect(xml).toContain("Maven's Orrery");
  expect(xml).toContain('Skip the resistance reduction on inversion setups');
});
