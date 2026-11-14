export const CLASSES = {
  Duelist: ['Slayer', 'Gladiator', 'Champion'],
  Marauder: ['Chieftain', 'Juggernaut', 'Berserker'],
  Ranger: ['Deadeye', 'Pathfinder', 'Warden'],
  Shadow: ['Assassin', 'Saboteur', 'Trickster'],
  Templar: ['Hierophant', 'Guardian', 'Inquisitor'],
  Witch: ['Necromancer', 'Elementalist', 'Occultist'],
  Scion: ['Ascendant', 'Reliquarian', 'Luminary'],
};

const KEYWORDS = {
  start: ['league start', 'league starter', 'starter', 'budget', 'cheap', 'low budget', 'tani', 'tania', 'tanio', 'budzet', 'na start'],
  defence: ['tank', 'tanky', 'defense', 'defence', 'survivability', 'safe', 'block', 'bezpieczny', 'przezywalnosc', 'tankowaty', 'przezyc'],
  mapping: ['mapping', 'maps', 'mapper', 'mapy', 'mapach', 'speed', 'fast', 'zoom', 'szybki', 'szybko', 'szybkie', 'clear'],
  bossing: ['boss', 'bosses', 'bossing', 'pinnacle', 'uber', 'single target', 'damage', 'dmg', 'bossy', 'bossow', 'bossa'],
};

const STYLES = {
  minion: ['minion', 'minions', 'summoner', 'summons', 'summony', 'miniony', 'przywolania'],
  bow: ['bow', 'bows', 'archer', 'lucznik', 'luk', 'lukiem', 'lukowy'],
  melee: ['melee', 'sword', 'axe', 'claw', 'miecz', 'topor', 'wrecz'],
  totem: ['totem', 'totems', 'totemy'],
  poison: ['poison', 'chaos', 'trucizna'],
  spell: ['spell', 'caster', 'czary', 'zaklecia'],
};

const UNSUPPORTED_SKILLS = ['tornado shot', 'lightning strike', 'boneshatter', 'toxic rain', 'explosive arrow', 'ice nova',
  'arc', 'blade vortex', 'winter orb', 'frost blades', 'kinetic fusillade', 'kinetic blast', 'exsanguinate', 'reap',
  'pennance brand', 'penance brand', 'raise spectre', 'summon skeletons', 'explosive concoction', 'animate weapon of ranged arms',
  'elemental hit of the spectrum', 'rain of arrows', 'storm burst of repulsion'];
const NEGATION = new Set(['no', 'without', 'avoid', 'except', 'not', 'bez', 'oprocz', 'nie']);
const BUDGET_ITEMS = ['mageblood', 'headhunter', 'kalandra s touch', 'precursor s emblem', 'mirror tier'];
export const FOCUS_LABELS = {
  start: 'League start', mapping: 'Fast mapping', bossing: 'Bossing', defence: 'Survivability',
};

export function normalizeTerms(text) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
}

function mention(tokens, name) {
  const terms = normalizeTerms(name).split(' ');
  let result = 0;
  for (let i = 0; i <= tokens.length - terms.length; i++) {
    if (!terms.every((word, j) => tokens[i + j] === word)) continue;
    const negative = NEGATION.has(tokens[i - 1]) || (tokens[i - 1] === 'want' && NEGATION.has(tokens[i - 2]));
    result = negative ? -1 : 1;
  }
  return result;
}

function matchesChoice(template, value) {
  return !value || [template.className, template.ascendancy].some(name => normalizeTerms(name) === normalizeTerms(value));
}

export function recommend(catalog, { description = '', choice = '', focus = '' } = {}) {
  const tokens = normalizeTerms(description).split(' ').filter(Boolean);
  const identities = [...Object.keys(CLASSES), ...Object.values(CLASSES).flat(), 'necro'];
  const named = identities.filter(name => mention(tokens, name) === 1).map(name => name === 'necro' ? 'Necromancer' : name);
  const exact = catalog.filter(template => template.aliases.some(alias => mention(tokens, alias) === 1));
  const blocked = catalog.filter(template => template.aliases.some(alias => mention(tokens, alias) === -1));
  const requestedModes = ['ssf', 'solo self found', 'hardcore', 'ruthless', 'poe 2', 'path of exile 2']
    .find(word => mention(tokens, word) === 1);
  if (requestedModes) return { kind: 'unavailable', message: 'This catalog covers PoE 1 Softcore Trade builds.' };
  if (!tokens.length && !choice && !focus) return { kind: 'unavailable', message: 'Enter a description or pick a class or priority.' };
  const excludedItems = BUDGET_ITEMS.filter(item => mention(tokens, item) === -1);
  const focuses = Object.entries(KEYWORDS).filter(([, terms]) => terms.some(term => mention(tokens, term) === 1)).map(([key]) => key);
  const requested = focus || focuses.find(key => key !== 'start') || 'start';
  const budgetRequested = excludedItems.length > 0 || focuses.includes('start');
  const preference = !focus && budgetRequested ? 'start' : requested;
  const styles = Object.entries(STYLES).filter(([, terms]) => terms.some(term => mention(tokens, term) === 1)).map(([key]) => key);
  const negativeStyles = Object.entries(STYLES).filter(([, terms]) => terms.some(term => mention(tokens, term) === -1)).map(([key]) => key);
  const excludedClasses = identities.filter(name => mention(tokens, name) === -1).map(name => name === 'necro' ? 'Necromancer' : name);
  const byClass = catalog.filter(template => matchesChoice(template, choice) &&
    (!named.length || named.some(name => matchesChoice(template, name))) &&
    !excludedClasses.some(name => matchesChoice(template, name)));
  const unsupported = UNSUPPORTED_SKILLS.find(skill => mention(tokens, skill) === 1 &&
    !exact.some(template => template.aliases.includes(skill)));
  if (unsupported && !exact.length) return { kind: 'unavailable', message: `No template for ${unsupported} yet.`, suggestions: byClass.slice(0, 3) };
  const matching = byClass.filter(template => !blocked.includes(template) && !negativeStyles.some(style => template.styles.includes(style)));
  const eligible = matching.filter(template => exact.length ? exact.includes(template) : !styles.length || styles.some(style => template.styles.includes(style)));
  if (!eligible.length) {
    const message = exact.length ? 'That skill and class combination is outside the current catalog.'
      : 'No build in the catalog matches those requirements.';
    return { kind: 'unavailable', message, suggestions: matching.slice(0, 3) };
  }
  if (tokens.length && !choice && !named.length && !exact.length && !styles.length && !focuses.length && !focus && !excludedItems.length) {
    return { kind: 'unavailable', message: 'Try a class, skill or playstyle such as totems, minions or melee.' };
  }
  const sort = template => 7 * Math.max(0, ...template.aliases.filter(alias => mention(tokens, alias) === 1).map(alias => normalizeTerms(alias).split(' ').length)) +
    Number(Object.hasOwn(template.profiles, preference)) * 4 +
    Number(Object.hasOwn(template.profiles, requested)) * 2 + styles.filter(style => template.styles.includes(style)).length * 2;
  eligible.sort((a, b) => sort(b) - sort(a));
  const [template] = eligible;
  const profile = Object.hasOwn(template.profiles, preference) ? preference : template.defaultFocus;
  return { kind: 'match', template, profile, preference, budgetFocus: preference !== requested ? requested : '',
    reason: exact.length ? 'Matched your skill' : named.length || choice ? 'Matched your class' : styles.length ? 'Matched your playstyle' : 'Matched your priority' };
}
