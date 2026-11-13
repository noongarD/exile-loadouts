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
  await page.getByRole('button', { name: 'Try Flicker Strike example' }).click();
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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try Flicker Strike example' }).click();
  await expect(page.locator('#stage-list button')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Export build' }).click();
  await expect(page.locator('#export-dialog')).toBeVisible();
});
