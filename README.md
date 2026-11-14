# Exile Loadouts

[Generate a build](https://noongard.github.io/exile-loadouts/) · [Report an issue](https://github.com/noongarD/exile-loadouts/issues)

Describe what you want to play in **Path of Exile 1** or pick a class. Exile Loadouts finds a build in a curated catalog and returns a ready-to-open pobb.in link with campaign, transition and endgame loadouts. You can also edit the build or import your own PoB snapshots.

## Generate a build

1. Enter a request such as **“Cheap Flicker Strike without Mageblood”** or **“Witch minions for bossing”**, or choose a class or ascendancy.
2. Choose **Generate build**. The matcher uses known skill names, classes and playstyles. Set the priority yourself or let the matcher infer it. A lower-investment starting point takes precedence over an inferred endgame priority. An explicit priority opens the corresponding loadout when it exists.
3. Choose **Open on pobb.in** for the ready-to-share progression or **Copy PoB code** to import it directly into Path of Building. Choose **Edit this build** to customize the generated project.

The first catalog covers Softcore Trade and includes Flicker Strike Slayer, Shockwave Cyclone Slayer, Poison Summon Raging Spirit Necromancer, Lightning Arrow Deadeye, Righteous Fire Chieftain, Poisonous Concoction Pathfinder, Storm Burst Totem Hierophant and Static Strike Assassin. Each build credits its source. **Browse builds** shows the complete catalog. Coverage depends on the catalog and its available variants. The app uses rule-based matching and assembles PoB exports locally in your browser. Catalog links are published ahead of time for each available starting loadout.

## Edit a build guide

1. Open a generated build or use **Import PoB** to start with your own build code or XML. Choose one snapshot or import every tree from a multiset export. For an existing pobb.in link, open its page and copy the build code.
2. Name each stage and give it a recommended level, swap requirements, upgrade order and calculation assumptions. Use **Snapshot sets and passive changes** to choose the linked passive tree, gear, skill and configuration sets.
3. Use **Gear** to record alternatives or equip copied PoB items. In **Skills & config**, change the main skill, gem levels and quality, socket groups, and boss, charge, Rage and Fortification settings.
4. Choose **Set as export default** and **Export build** to get the import code, XML and Markdown guide. To publish your edited version, paste the resulting code into [pobb.in](https://pobb.in/) and choose **Create**.

Generated notes are included in the PoB file. Use the **Loadouts** menu in the desktop app to switch between stages and set the character level for each. The file opens at the default stage’s level. Edits are saved in the browser. **Save project** and **Open project** handle editable JSON backups.

## Compatibility

Supports PoE 1 builds using the same base class throughout a project. Passive tree creation and DPS calculations happen in Path of Building. Global settings such as party inputs come from the default snapshot. Catalog builds were checked for import and loadout switching with PoB Community 2.67.2 using the 3.29 tree data available in that release. League balance and trade prices can affect the builds in game.

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
