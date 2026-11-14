# Exile Loadouts

[Generate a build](https://noongard.github.io/exile-loadouts/) · [Report an issue](https://github.com/noongarD/exile-loadouts/issues)

Exile Loadouts is a **Path of Exile 1** build planner and PoB exporter for **Covens of Umbra**. Describe your playstyle to find a curated progression, start an editable draft with a class and skill, or import an existing PoB. The site runs locally in your browser.

## Generate a build

1. Enter a request such as **“Cheap Flicker Strike without Mageblood”** or **“Witch minions for bossing”**, or choose a class or ascendancy.
2. Choose **Generate build**. The matcher uses known skill names, classes and playstyles. Set the priority yourself or let the matcher infer it. A lower-investment starting point takes precedence over an inferred endgame priority. An explicit priority opens the corresponding loadout when it exists.
3. Choose **Open on pobb.in** for the ready-to-share progression or **Copy PoB code** to import it directly into Path of Building. Choose **Edit this build** to customize the generated project.

**Browse builds** shows ten Softcore Trade templates, including Static Strike Guardian and Explosive Arrow Ballista Hierophant. Each build credits its source. Where a profile has a published export, **Open on pobb.in** opens that profile. The app uses rule-based matching.

## Build from scratch

Choose **Build from scratch**, then choose a base class, optional ascendancy and active skill. The draft creates three editable loadouts with a starter tree, example gear and gem acquisition notes. It leaves passive points available for your own choices. Use **Plan a passive path** to add connected allocations, choose skill links and adjust gear before comparing performance. The draft is a starting point for theorycrafting.

## Covens of Umbra

Search Fates, Wickerman Viscera, Threads and selected introductions or balance changes. **Add to build notes** includes a source link and any build note in the exported PoB and guide. In **Stage**, open **3.30 gem rewards and tree changes** to see class-specific gem rewards and vendors and check for selected nodes changed in the official tree.

Game data references come from the [3.30 patch notes](https://www.pathofexile.com/forum/view-thread/4013680), [official tree export](https://github.com/grindinggear/skilltree-export/tree/3.30.0), local client tables, [PoE Wiki](https://www.poewiki.net/wiki/Path_of_Exile_Wiki:Data_query_API) and [PoEDB](https://poedb.tw/us/Viscera). The public site uses small derived JSON indexes.

## Edit a build guide

1. Open a generated build or use **Import PoB** to start with your own build code or XML. Choose one snapshot or import every tree from a multiset export. For an existing pobb.in link, open its page and copy the build code.
2. Name each stage and give it a recommended level, swap requirements, upgrade order and calculation assumptions. Use **Snapshot sets and passive changes** to choose the linked passive tree, gear, skill and configuration sets.
3. Use **Gear** to record alternatives or equip copied PoB items. In **Skills & config**, change the main skill, gem levels and quality, socket groups, and boss, charge, Rage and Fortification settings.
4. Choose **Set as export default** and **Export build** to get the import code, XML and Markdown guide. To publish your edited version, paste the resulting code into [pobb.in](https://pobb.in/) and choose **Create**.

Generated notes are included in the PoB file. Use the **Loadouts** menu in the desktop app to switch between stages and set the character level for each. The file opens at the default stage’s level. Edits are saved in the browser. **Save project** and **Open project** handle editable JSON backups.

## Compatibility

Supports PoE 1 builds using the same base class throughout a project. The planner uses **3.30 league data** for research and **3.29 PoB data** for generated allocations and skill compatibility. Path of Building Community 2.67.2 calculates damage, and custom drafts use its supported tree. New skills unavailable to that PoB release are listed with an update requirement. League notes are included as text and do not apply a simulated effect. Global settings such as party inputs come from the default snapshot.

## Run locally

Use Node.js 20 or newer.

```sh
npm start
# Open http://127.0.0.1:4173

npm ci
npx playwright install chromium
npm test
```

The site is static and uses standard browser XML, compression and storage APIs. It can be hosted at a subpath on GitHub Pages. The app source is MIT licensed. Path of Exile belongs to Grinding Gear Games. This project is independently maintained.
