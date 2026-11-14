import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve(process.argv[2] || 'test-results/exports');
const ids = process.argv.slice(3);
const url = `http://127.0.0.1:${process.env.EXILE_PORT || 4173}/`;
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url);
  const builds = await page.evaluate(async ids => {
    const { compilePoB, readSnapshot, treeDiff } = await import('/src/pob.js');
    const { normalizeProject, formatGuide } = await import('/src/project.js');
    const catalog = await (await fetch('/builds/catalog.json')).json();
    const output = [];
    for (const template of catalog.filter(row => ids.includes(row.id))) {
      const project = normalizeProject(await (await fetch(`/builds/${template.file}`)).json());
      const snapshots = project.stages.map(stage => readSnapshot(project.sources[stage.source].xml, stage.selection));
      const diffs = snapshots.map((snapshot, index) => treeDiff(snapshots[index - 1], snapshot));
      for (const index of new Set(Object.values(template.profiles))) {
        project.defaultId = project.stages[index].id;
        output.push([`${template.id}-${index}`, compilePoB(project, formatGuide(project, { diffs }))]);
      }
    }
    return output;
  }, ids);
  if (!builds.length) throw new Error('Specify at least one catalog build ID.');
  for (const [name, xml] of builds) await writeFile(resolve(output, `${name}.xml`), xml);
  console.log(`Exported ${builds.length} profiles to ${output}.`);
} finally {
  await browser.close();
}
