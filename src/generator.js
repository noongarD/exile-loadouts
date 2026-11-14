export const CLASSES = {
  Duelist: ['Slayer', 'Gladiator', 'Champion'], Marauder: ['Chieftain', 'Juggernaut', 'Berserker'],
  Ranger: ['Deadeye', 'Pathfinder', 'Warden'], Shadow: ['Assassin', 'Saboteur', 'Trickster'],
  Templar: ['Hierophant', 'Guardian', 'Inquisitor'], Witch: ['Necromancer', 'Elementalist', 'Occultist'],
  Scion: ['Ascendant', 'Reliquarian', 'Luminary'],
};

const CLASS_ALIASES = {
  Necromancer: ['necro', 'nekro', 'nekromanta', 'nekromante'], Witch: ['wiedzma', 'wiedzme'],
  Juggernaut: ['jugg', 'jug'], Hierophant: ['hiero'], Chieftain: ['chieft', 'chief'],
  Pathfinder: ['path finder', 'pf'], Berserker: ['zerker', 'berserk'], Elementalist: ['ele witch'],
};
const GOALS = {
  start: ['league start', 'league starter', 'starter', 'budget', 'cheap', 'low budget', 'first character', 'beginner', 'beginner friendly', 'new player', 'new to poe', 'easy to play', 'easy to gear', 'tani', 'tania', 'tanio', 'budzet', 'na start', 'poczatkujacy', 'pierwsza postac', 'latwy', 'prosty'],
  defence: ['tank', 'tanky', 'defense', 'defence', 'survivability', 'safe', 'tough', 'block', 'hard to kill', 'stay alive', 'die less', 'bezpieczny', 'przezywalnosc', 'tankowaty', 'przezyc', 'odporny', 'obrona', 'wytrzymaly', 'mniej ginac'],
  mapping: ['mapping', 'maps', 'mapper', 'mapy', 'mapach', 'speed', 'fast', 'zoom', 'szybki', 'szybko', 'szybkie', 'clear', 'clear packs', 'speed farming', 'farm maps'],
  bossing: ['boss', 'bosses', 'bossing', 'pinnacle', 'uber', 'ubers', 'single target', 'boss damage', 'bossy', 'bossow', 'bossa', 'zabijac bossy'],
};
const STYLES = {
  minion: ['minion', 'minions', 'summoner', 'summons', 'pets', 'skeleton army', 'summony', 'miniony', 'przywolania', 'przywolywac', 'szkielety'],
  bow: ['bow', 'bows', 'archer', 'ranged bow', 'arrows', 'lucznik', 'luk', 'lukiem', 'lukowy', 'strzaly'],
  melee: ['melee', 'sword', 'axe', 'claw', 'hit up close', 'miecz', 'topor', 'wrecz', 'z bliska'],
  totem: ['totem', 'totems', 'ballista', 'ballistas', 'totemy', 'totemami'],
  poison: ['poison', 'poisoning', 'poisons', 'trucizna', 'trucizne', 'trucizny', 'truc', 'zatrucie'],
  spell: ['spell', 'spells', 'caster', 'casting', 'czary', 'zaklecia', 'zakleciami'],
  ignite: ['ignite', 'burning', 'burning damage', 'podpalenie', 'podpalanie', 'podpalac'],
  chaos: ['chaos', 'chaos damage', 'chaos dot'], physical: ['physical', 'phys', 'fizyczne'],
  dot: ['dot', 'damage over time', 'obrazenia w czasie'], channel: ['channel', 'channelling', 'channeling'],
};
const BEHAVIOURS = {
  flicker: ['teleport between enemies', 'teleport from enemy to enemy', 'jump between enemies', 'jump around', 'teleport around', 'skakac miedzy mobami', 'skacze miedzy wrogami'],
  cyclone: ['spin to win', 'spin through packs', 'spinning melee', 'krecic sie'],
  rf: ['walk and burn', 'walking simulator', 'fire aura', 'burn everything around me', 'palic wszystko wokol'],
};
const SKILL_ALIASES = {
  'Tornado Shot': ['ts'], 'Flicker Strike': ['flicker', 'flicer'], 'Righteous Fire': ['rf'],
  'Lightning Arrow': ['la'], 'Summon Raging Spirit': ['srs', 'raging spirits'], 'Poisonous Concoction': ['pconc', 'p conc'],
  'Poisonous Concoction of Bouncing': ['pcob', 'pconc of bouncing', 'bouncing pconc'],
  'Animate Weapon of Ranged Arms': ['praw', 'ranged animate weapon', 'animate weapon ranged arms'],
  'Static Strike of Gathering Lightning': ['ssogl'], 'Elemental Hit': ['ele hit'], 'Elemental Hit of the Spectrum': ['ehots', 'spectrum'],
  'Penance Brand': ['pennance brand', 'pb ignite'], 'Incinerate of Venting': ['iov', 'incinerate venting'],
  'Shockwave Support': ['shockwave'],
};
const NEGATION = new Set(['no', 'without', 'avoid', 'except', 'not', 'bez', 'oprocz', 'nie', 'dont', 'never', 'skip']);
const NEGATION_FILLER = new Set(['want', 'play', 'use', 'using', 'a', 'an', 'the', 'any', 'need', 'rely', 'on', 'chce', 'grac', 'z', 'zadnych']);
const COST = ['mageblood', 'headhunter', 'kalandra s touch', 'precursor s emblem', 'mirror tier', 'expensive uniques', 'expensive gear', 'uniques', 'drogich unikatow'];
const MODES = ['ssf', 'solo self found', 'hardcore', 'hc', 'ruthless', 'poe 2', 'poe2', 'path of exile 2'];
export const FOCUS_LABELS = { start: 'League start', mapping: 'Fast mapping', bossing: 'Bossing', defence: 'Survivability' };

export function normalizeTerms(text) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function mentions(tokens, aliases) {
  const found = [];
  for (const alias of aliases) {
    const words = normalizeTerms(alias).split(' ');
    for (let i = 0; i <= tokens.length - words.length; i++) {
      if (!words.every((word, j) => tokens[i + j] === word)) continue;
      let before = i - 1;
      for (let steps = 0; steps < 4 && NEGATION_FILLER.has(tokens[before]); steps++) before--;
      found.push({ term: alias, start: i, length: words.length, negative: NEGATION.has(tokens[before]) });
    }
  }
  return found;
}

function signals(tokens, dictionary) {
  return Object.entries(dictionary).flatMap(([key, values]) => mentions(tokens, values).map(value => ({ ...value, key })));
}

const best = rows => [...rows].sort((a, b) => b.length - a.length || a.start - b.start)[0];

export function parseRequest(description, gems = {}) {
  const tokens = normalizeTerms(description).split(' ').filter(Boolean);
  const identities = [...Object.keys(CLASSES), ...Object.values(CLASSES).flat()];
  const classes = signals(tokens, Object.fromEntries(identities.map(name => [name, [name, ...(CLASS_ALIASES[name] || [])]])));
  const skills = signals(tokens, Object.fromEntries(Object.values(gems).filter(gem => !gem.support || gem.name === 'Shockwave Support')
    .map(gem => [gem.name, [gem.name, ...(SKILL_ALIASES[gem.name] || [])]])));
  const precise = skills.filter(skill => !skills.some(other => other.start <= skill.start && other.start + other.length >= skill.start + skill.length && other.length > skill.length));
  const clauses = description.toLowerCase().match(/(?:^|[\s,])(?:level(?:ling|ing)? with|start with|starting with|using .*? (?:then|into)|swapping (?:to|into)|swap (?:to|into)|then (?:use|play))\s+/g);
  const positive = precise.filter(skill => !skill.negative);
  let skill = best(positive);
  if (clauses?.length && positive.length > 1) skill = positive.sort((a, b) => b.start - a.start || b.length - a.length)[0];
  return { tokens, classes, skills: precise, skill, goals: signals(tokens, GOALS), styles: signals(tokens, STYLES), behaviours: signals(tokens, BEHAVIOURS),
    exclusions: mentions(tokens, COST).filter(value => value.negative), mode: mentions(tokens, MODES).find(value => !value.negative)?.term };
}

function matchingName(template, name) {
  return !name || template.className === name || template.ascendancy === name;
}

function starterRank(template) {
  return template.beginner === 'easy' ? 3 : template.beginner === 'advanced' ? -2 : 0;
}

function oneEditAway(a, b) {
  if (a.length > b.length) return oneEditAway(b, a);
  if (b.length - a.length > 1) return false;
  const start = [...a].findIndex((letter, index) => letter !== b[index]);
  if (start < 0) return a.length !== b.length;
  if (a.length < b.length) return a.slice(start) === b.slice(start + 1);
  return a.slice(start + 1) === b.slice(start + 1) ||
    (a[start] === b[start + 1] && a[start + 1] === b[start] && a.slice(start + 2) === b.slice(start + 2));
}

function nearMatches(tokens, labels) {
  return labels.some(label => {
    const words = normalizeTerms(label).split(' ');
    return (words.length > 1 || words[0].length >= 7) && tokens.some((_, start) => {
      const phrase = tokens.slice(start, start + words.length);
      if (phrase.length !== words.length) return false;
      const mismatched = words.filter((word, index) => word !== phrase[index]);
      return mismatched.length === 1 && words.some((word, index) =>
        word.length >= 4 && oneEditAway(word, phrase[index])) && !mentions(tokens, [phrase.join(' ')]).some(match =>
        match.start === start && match.negative);
    });
  });
}

export function recommend(catalog, { description = '', choice = '', focus = '', gems = {}, playstyle = '' } = {}) {
  const parsed = parseRequest(description, gems);
  const { tokens, skill, mode } = parsed;
  const named = parsed.classes.filter(value => !value.negative);
  const blockedClasses = parsed.classes.filter(value => value.negative);
  const present = values => [...new Set(values.filter(value => !value.negative).map(value => value.key))];
  const negative = values => [...new Set(values.filter(value => value.negative).map(value => value.key))];
  const desired = [...new Set([...present(parsed.styles), ...(playstyle ? [playstyle] : [])])];
  const blockedStyles = negative(parsed.styles);
  const interests = present(parsed.goals);
  const requested = focus || best(parsed.goals.filter(value => !value.negative && value.key !== 'start'))?.key || 'start';
  const budget = Boolean(parsed.exclusions.length || interests.includes('start'));
  const preference = !focus && budget ? 'start' : requested;
  const behaviours = present(parsed.behaviours);
  if (mode) return { kind: 'unavailable', message: 'The featured builds are for Path of Exile 1 Softcore Trade.', allowDraft: !['poe 2', 'poe2', 'path of exile 2'].includes(mode) };
  if (!tokens.length && !choice && !focus && !playstyle) return { kind: 'unavailable', message: 'Describe a playstyle or pick one of the options below.' };

  const allAscendancies = Object.values(CLASSES).flat();
  const asc = named.filter(value => allAscendancies.includes(value.key));
  const base = named.filter(value => Object.hasOwn(CLASSES, value.key));
  const permitted = catalog.filter(template => matchingName(template, choice) &&
    (!asc.length || asc.some(value => matchingName(template, value.key))) && (!base.length || base.some(value => matchingName(template, value.key))) &&
    !blockedClasses.some(value => matchingName(template, value.key)) && !blockedStyles.some(style => template.styles.includes(style)));
  const ranked = permitted.flatMap(template => {
    const labels = [template.title, ...template.aliases];
    const aliases = mentions(tokens, labels);
    if (aliases.some(match => match.negative && !aliases.some(other => !other.negative && other.length > match.length))) return [];
    const skillMatches = skill && labels.some(label => normalizeTerms(label) === normalizeTerms(skill.key));
    const useAlias = best(aliases.filter(match => !match.negative));
    if (skill && !skillMatches && (!useAlias || useAlias.start > skill.start || useAlias.start + useAlias.length < skill.start + skill.length)) return [];
    if (!skill && !useAlias && !behaviours.includes(template.id) && desired.length && !desired.some(style => template.styles.includes(style))) return [];
    const hits = desired.filter(style => template.styles.includes(style));
    const relevance = Number(Boolean(skillMatches)) * 24 + (useAlias?.length ?? 0) * 7 + Number(behaviours.includes(template.id)) * 14 + hits.length * 6;
    const suitability = Number(Object.hasOwn(template.profiles, preference)) * 4 + Number(Object.hasOwn(template.profiles, requested)) * 2;
    return [{ template, hits, reason: skillMatches || useAlias ? 'Skill match' : behaviours.includes(template.id) ? 'Playstyle match' : choice || named.length ? 'Class match' : hits.length ? 'Playstyle match' : 'Priority match',
      score: relevance + suitability + (budget || (!skill && !desired.length) ? starterRank(template) : 0) }];
  }).sort((a, b) => b.score - a.score);

  const result = ranked[0];
  if (!skill && !ranked.some(row => row.reason === 'Skill match')) {
    const near = permitted.filter(template => nearMatches(tokens, template.aliases));
    if (near.length) return { kind: 'unavailable', message: 'Did you mean one of these builds?', suggestions: near.slice(0, 3), allowDraft: true };
  }
  if (!result || (!skill && !desired.length && !behaviours.length && !choice && !named.length && !focus && !interests.length && !parsed.exclusions.length && !ranked.some(row => row.reason === 'Skill match'))) {
    const message = skill ? `No template for ${skill.key.toLowerCase()} with these choices.` : 'No strong match. Try a skill, class, or a playstyle like bows or minions.';
    return { kind: 'unavailable', message, suggestions: permitted.slice(0, 3), allowDraft: true };
  }

  const { template } = result;
  const profile = Object.hasOwn(template.profiles, preference) ? preference : template.defaultFocus;
  return { kind: 'match', template, profile, preference, budgetFocus: preference !== requested ? requested : '', reason: result.reason,
    hints: [skill?.key, choice || asc[0]?.key || base[0]?.key, ...result.hits.map(style => ({ dot: 'damage over time', channel: 'channelling' }[style] || style)),
      ...parsed.exclusions.map(excluded => `Budget preference · avoid ${excluded.term}`)].filter(Boolean),
    alternatives: ranked.slice(1).filter(row => !behaviours.length || desired.length || behaviours.includes(row.template.id)).slice(0, 2).map(row => row.template) };
}
