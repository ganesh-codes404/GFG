const DEV_CARD_BAG = [
  ...Array(14).fill("knight"),
  ...Array(5).fill("victory-point"),
  ...Array(2).fill("road-building"),
  ...Array(2).fill("year-of-plenty"),
  ...Array(2).fill("monopoly"),
];

function shuffle(array, rng) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function buildDeck(rng = Math.random) {
  return shuffle(DEV_CARD_BAG, rng);
}

module.exports = { buildDeck, DEV_CARD_BAG };
