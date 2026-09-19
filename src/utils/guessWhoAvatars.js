import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";

// Illustrated, consistent-looking avatars (DiceBear "avataaars") instead of
// the old emoji mashup -- glasses/hat/facial-hair/hair-color are forced
// deterministically from the character's actual game-logic attributes so the
// picture never contradicts an answer a player was given, while everything
// cosmetic (skin tone, clothes, expression) is derived from the character's
// id as a stable seed so the same character always renders the same way.
const HAT_TOPS = ["hat", "turban", "hijab", "winterHat1", "winterHat02", "winterHat03", "winterHat04"];
const HAIR_TOPS = [
  "shortFlat", "shortRound", "shortWaved", "shortCurly", "curly", "curvy",
  "dreads01", "dreads02", "fro", "froBand", "bigHair", "bob", "bun",
  "miaWallace", "straight01", "straight02", "straightAndStrand", "shaggy",
  "shaggyMullet", "sides", "theCaesar", "theCaesarAndSidePart", "frizzle",
  "frida", "longButNotTooLong", "shavedSides",
];
const GLASSES_STYLES = ["prescription01", "prescription02", "round", "wayfarers"];
const FACIAL_HAIR_STYLES = ["beardLight", "beardMedium", "beardMajestic", "moustacheFancy", "moustacheMagnum"];

const HAIR_COLOR_HEX = {
  black: "2c1b18",
  brown: "724133",
  blonde: "d6b370",
  gray: "b7b7b7",
  red: "a55728",
  green: "3a7d44",
  rainbow: "d6467b",
};

function hashPick(seed, salt, list) {
  const str = seed + salt;
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return list[hash % list.length];
}

const cache = new Map();

export function characterAvatarUri(character) {
  if (!character) return null;
  if (cache.has(character.id)) return cache.get(character.id);

  const options = { seed: character.id, size: 96 };
  const isBald = character.hairColor === "bald" || character.hairColor === "none";

  if (character.hat) {
    options.top = [hashPick(character.id, "top", HAT_TOPS)];
    options.topProbability = 100;
    options.hatColor = [HAIR_COLOR_HEX[character.hairColor] || "8b5e3c"];
  } else if (isBald) {
    options.topProbability = 0;
  } else {
    options.top = [hashPick(character.id, "top", HAIR_TOPS)];
    options.topProbability = 100;
    options.hairColor = [HAIR_COLOR_HEX[character.hairColor] || "724133"];
  }

  if (character.glasses) {
    options.accessories = [hashPick(character.id, "glasses", GLASSES_STYLES)];
    options.accessoriesProbability = 100;
  } else {
    options.accessoriesProbability = 0;
  }

  if (character.facialHair) {
    options.facialHair = [hashPick(character.id, "facial", FACIAL_HAIR_STYLES)];
    options.facialHairProbability = 100;
  } else {
    options.facialHairProbability = 0;
  }

  const uri = createAvatar(avataaars, options).toDataUri();
  cache.set(character.id, uri);
  return uri;
}
