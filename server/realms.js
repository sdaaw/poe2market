/**
 * Realm definitions: what to fetch for each game, and how to read it back.
 *
 * The two economies share an API shape for currency but not for items, and they
 * do not share a unit of account — PoE2 quotes in Divine Orbs, PoE1 in Chaos.
 * Everything here is normalised to Divine so the frontend has one thing to think
 * about, with `secondaryUnit` saying what to quote sub-Divine prices in.
 */

export const REALMS = {
  poe2: {
    id: 'poe2',
    label: 'PoE 2',
    game: 'Path of Exile 2',
    base: 'https://poe.ninja/poe2',
    // Exalted is the small change of PoE2; in PoE1 that role belongs to Chaos.
    secondaryUnit: 'ex',
    // The permanent leagues are a different game economically — decade-old stock,
    // no league mechanic, prices that barely move — so this site skips them.
    // Everything else is kept if it returns data, which is what actually decides
    // whether a league is live. poe.ninja's own `indexed` flag does not: it was
    // false for Forbidden Rites for days after launch while the league was
    // plainly trading, and false for HC Runes of Aldur months in.
    permanentLeagues: ['Standard', 'Hardcore'],

    itemTypes: [
      { type: 'UniqueWeapons', label: 'Weapons' },
      { type: 'UniqueArmours', label: 'Armour' },
      { type: 'UniqueAccessories', label: 'Accessories' },
      { type: 'UniqueJewels', label: 'Jewels' },
      { type: 'UniqueFlasks', label: 'Flasks' },
      { type: 'UniqueCharms', label: 'Charms' },
      { type: 'UniqueSanctumRelics', label: 'Relics' },
      { type: 'UniqueTablets', label: 'Tablets' },
      { type: 'PrecursorTablets', label: 'Precursor Tablets' }
    ],

    exchangeTypes: [
      { type: 'Currency', label: 'Currency' },
      { type: 'Fragments', label: 'Fragments' },
      { type: 'Runes', label: 'Runes' },
      { type: 'SoulCores', label: 'Soul Cores' },
      { type: 'Essences', label: 'Essences' },
      { type: 'UncutGems', label: 'Uncut Gems' },
      { type: 'LineageSupportGems', label: 'Lineage Gems' },
      { type: 'Ritual', label: 'Omens' },
      { type: 'Delirium', label: 'Liquid Emotions' },
      { type: 'Breach', label: 'Catalysts' },
      { type: 'Abyss', label: 'Abyssal Bones' },
      { type: 'Expedition', label: 'Expedition' },
      { type: 'Idols', label: 'Idols' },
      { type: 'Verisium', label: 'Verisium' }
    ]
  },

  poe1: {
    id: 'poe1',
    label: 'PoE 1',
    game: 'Path of Exile',
    base: 'https://poe.ninja/poe1',
    secondaryUnit: 'chaos',
    // PoE1's Standard is a genuine market people trade and price against, unlike
    // PoE2's, so nothing is excluded here.
    permanentLeagues: [],

    // Uniques only. BaseType (20k rare bases) and SkillGem (7.5k gem
    // permutations) are 13 MB between them and are a different kind of thing
    // from what this site tracks.
    itemTypes: [
      { type: 'UniqueWeapon', label: 'Weapons' },
      { type: 'UniqueArmour', label: 'Armour' },
      { type: 'UniqueAccessory', label: 'Accessories' },
      { type: 'UniqueJewel', label: 'Jewels' },
      { type: 'ForbiddenJewel', label: 'Forbidden Jewels' },
      { type: 'UniqueFlask', label: 'Flasks' },
      { type: 'UniqueRelic', label: 'Relics' },
      { type: 'UniqueTincture', label: 'Tinctures' },
      { type: 'UniqueMap', label: 'Maps' }
    ],

    exchangeTypes: [
      { type: 'Currency', label: 'Currency' },
      { type: 'Fragment', label: 'Fragments' },
      { type: 'DivinationCard', label: 'Divination Cards' },
      { type: 'Essence', label: 'Essences' },
      { type: 'Scarab', label: 'Scarabs' },
      { type: 'Fossil', label: 'Fossils' },
      { type: 'Resonator', label: 'Resonators' },
      { type: 'Oil', label: 'Oils' },
      { type: 'DeliriumOrb', label: 'Delirium Orbs' },
      { type: 'Artifact', label: 'Artifacts' },
      { type: 'Omen', label: 'Omens' },
      { type: 'Tattoo', label: 'Tattoos' },
      { type: 'AllflameEmber', label: 'Allflame Embers' },
      { type: 'Runegraft', label: 'Runegrafts' },
      { type: 'Astrolabe', label: 'Astrolabes' },
      { type: 'EnshroudingCrystal', label: 'Enshrouding Crystals' },
      { type: 'Ducat', label: 'Ducats' }
    ]
  }
};

export const realmList = () => Object.values(REALMS);
