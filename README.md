# Exile Loadouts

[Open the workspace](https://noongard.github.io/exile-loadouts/) · [Report an issue](https://github.com/noongarD/exile-loadouts/issues)

Exile Loadouts is a browser workspace for writing and sharing **Path of Exile 1 build progression**. Combine Path of Building snapshots into one import code with linked loadouts, equipment alternatives and a guide that travels with the build.

## Create a build guide

1. Open the workspace and choose **Try Flicker Strike example** to see a complete project, or use **Import PoB** to start with your own build.
2. In [Path of Building Community](https://pathofbuilding.community/), make the tree, gear, skill and configuration sets for each checkpoint. Export a build code or an XML file. In Exile Loadouts, choose one snapshot or import every tree from a multiset export. For pobb.in links, open the page and copy the build code into the workspace.
3. Name each stage and give it a phase and recommended level. Add swap requirements, upgrade order, budget notes and damage assumptions. Open **Snapshot sets and passive changes** to select a different tree, gear, skill or configuration set. Compare the actual refund cost in PoB, particularly when changing ascendancy points or cluster jewels.
4. Use **Gear** to add shopping notes, paste an item into the export’s item library or equip it in that stage. In **Skills & config**, set the main skill group, adjust gem levels and quality, add socket groups and set boss, charge, Rage and Fortification assumptions.
5. Select **Set as export default** on the stage you want readers to see first. Choose **Export build** for the PoB code, XML and Markdown guide. Paste the code into PoB to calculate and verify it. To get a public link, paste it into [pobb.in](https://pobb.in/) and choose **Create**.

## How it works

- Each exported loadout links a passive tree, equipment set, skill set and configuration set. Use the **Loadouts** menu in PoB to switch between them. Set your character level manually when switching. The exported file opens at the default stage’s level.
- The compiler consolidates equipment and remaps references to items, socketed jewels, item-granted skills and minion equipment sets. Gear alternatives can be written as guide text alone or carried as copied PoB item text.
- The app writes phase-coloured notes into the PoB XML. It also generates a standalone Markdown guide with the same progression and assumptions.
- Changes are saved locally in the browser. **Save project** downloads an editable JSON backup, and **Open project** restores it. Publishing a build on pobb.in is a separate action.

## Compatibility

Supports PoE 1 builds using the same base class throughout a project. Passive tree creation and DPS calculation happen in Path of Building. The workspace edits, assembles and documents PoB snapshots. It does not calculate damage, validate trade prices or simulate charge uptime. Global build settings such as party inputs come from the default snapshot. The included example was verified with PoB Community 2.67.2.

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
