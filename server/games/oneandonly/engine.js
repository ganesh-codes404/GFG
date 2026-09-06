// "One and Only" -- an original shedding card game in the same family as
// classic UNO-style games, but with its own color names, action names, and
// deck identity. Rules follow the familiar shape (match color/number/type,
// stack action effects, first to empty their hand wins) without copying any
// branding, card text, or layout.

const COLORS = ["ember", "tide", "verdant", "solar"];

let cardIdCounter = 0;
function nextCardId() {
  return `card-${cardIdCounter++}`;
}

function buildDeck() {
  const cards = [];

  for (const color of COLORS) {
    cards.push({ id: nextCardId(), color, kind: "number", value: 0 });

    for (let value = 1; value <= 9; value++) {
      cards.push({ id: nextCardId(), color, kind: "number", value });
      cards.push({ id: nextCardId(), color, kind: "number", value });
    }

    for (const action of ["block", "switch", "plus2"]) {
      cards.push({ id: nextCardId(), color, kind: "action", value: action });
      cards.push({ id: nextCardId(), color, kind: "action", value: action });
    }
  }

  for (let i = 0; i < 4; i++) {
    cards.push({ id: nextCardId(), color: null, kind: "wild", value: "free" });
    cards.push({ id: nextCardId(), color: null, kind: "wild", value: "plus4" });
  }

  return cards;
}

function shuffle(array, rng) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function fail(message) {
  throw new Error(message);
}

function isPlayable(card, discardTop, activeColor) {
  if (card.kind === "wild") return true;
  if (card.color === activeColor) return true;
  return card.value === discardTop.value;
}

function ensureDrawPile(state) {
  if (state.drawPile.length > 0) return;

  const top = state.discardPile.pop();
  const rest = state.discardPile;
  state.discardPile = [top];

  if (rest.length === 0) return; // truly out of cards (very rare)

  state.drawPile = shuffle(rest, state.rng);
}

function drawCards(state, seat, count) {
  const drawn = [];

  for (let i = 0; i < count; i++) {
    ensureDrawPile(state);
    const card = state.drawPile.pop();
    if (!card) break;
    drawn.push(card);
  }

  state.hands[seat].push(...drawn);
  return drawn;
}

function nextSeatIndex(state, from, steps = 1) {
  const count = state.players.length;
  let seat = from;
  for (let i = 0; i < steps; i++) {
    seat = (seat + state.direction + count) % count;
  }
  return seat;
}

function playerLabel(seat) {
  return `Player ${seat + 1}`;
}

function log(state, message) {
  state.log.push(message);
  if (state.log.length > 60) state.log.shift();
}

function createInitialState(seatCount, rng = Math.random) {
  let deck = shuffle(buildDeck(), rng);

  const hands = Array.from({ length: seatCount }, () => []);
  for (let round = 0; round < 7; round++) {
    for (let seat = 0; seat < seatCount; seat++) {
      hands[seat].push(deck.pop());
    }
  }

  // Keep the very first discard a plain number card so turn 1 has no
  // special effect to resolve (a common, clean simplification).
  let starter = null;
  const rest = [];
  while (deck.length > 0) {
    const card = deck.pop();
    if (!starter && card.kind === "number") {
      starter = card;
    } else {
      rest.push(card);
    }
  }

  const state = {
    players: Array.from({ length: seatCount }, (_, seat) => ({ seat })),
    hands,
    drawPile: rest,
    discardPile: [starter],
    activeColor: starter.color,
    currentSeat: Math.floor(rng() * seatCount),
    direction: 1,
    hasDrawnThisTurn: false,
    winner: null,
    log: ["One and Only begins! Match by color, number, or type."],
    rng,
  };

  return state;
}

function currentDiscardTop(state) {
  return state.discardPile[state.discardPile.length - 1];
}

function applyCardEffect(state, seat, card) {
  const count = state.players.length;

  if (card.kind === "number") {
    state.currentSeat = nextSeatIndex(state, seat, 1);
    return;
  }

  if (card.value === "block") {
    const skipped = nextSeatIndex(state, seat, 1);
    log(state, `${playerLabel(skipped)} is blocked!`);
    state.currentSeat = nextSeatIndex(state, seat, 2);
    return;
  }

  if (card.value === "switch") {
    state.direction *= -1;
    log(state, "Direction changed!");

    if (count === 2) {
      // With only 2 players, a direction flip is equivalent to a block.
      state.currentSeat = seat;
    } else {
      state.currentSeat = nextSeatIndex(state, seat, 1);
    }
    return;
  }

  if (card.value === "plus2") {
    const target = nextSeatIndex(state, seat, 1);
    drawCards(state, target, 2);
    log(state, `${playerLabel(target)} draws 2!`);
    state.currentSeat = nextSeatIndex(state, seat, 2);
    return;
  }

  if (card.value === "plus4") {
    const target = nextSeatIndex(state, seat, 1);
    drawCards(state, target, 4);
    log(state, `${playerLabel(target)} draws 4!`);
    state.currentSeat = nextSeatIndex(state, seat, 2);
    return;
  }

  // 'free' wild -- just moves on normally.
  state.currentSeat = nextSeatIndex(state, seat, 1);
}

function handlePlayCard(state, seat, cardId, chosenColor) {
  if (state.winner !== null) fail("The game is already over.");
  if (seat !== state.currentSeat) fail("It's not your turn.");

  const hand = state.hands[seat];
  const cardIndex = hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) fail("You don't have that card.");

  const card = hand[cardIndex];
  const discardTop = currentDiscardTop(state);

  if (!isPlayable(card, discardTop, state.activeColor)) {
    fail("That card doesn't match the current color, number, or type.");
  }

  if (card.kind === "wild") {
    if (!COLORS.includes(chosenColor)) fail("Choose a valid color for the wild card.");
  }

  hand.splice(cardIndex, 1);
  state.discardPile.push(card);
  state.hasDrawnThisTurn = false;

  state.activeColor = card.kind === "wild" ? chosenColor : card.color;

  log(
    state,
    `${playerLabel(seat)} played ${cardLabel(card)}${
      card.kind === "wild" ? ` (${chosenColor})` : ""
    }.`
  );

  if (hand.length === 0) {
    state.winner = seat;
    log(state, `${playerLabel(seat)} wins!`);
    return;
  }

  applyCardEffect(state, seat, card);
}

function cardLabel(card) {
  if (card.kind === "number") return `${card.value}`;
  if (card.kind === "action") {
    return { block: "Block", switch: "Switch", plus2: "+2" }[card.value];
  }
  return card.value === "plus4" ? "+4" : "Free";
}

function handleDrawCard(state, seat) {
  if (state.winner !== null) fail("The game is already over.");
  if (seat !== state.currentSeat) fail("It's not your turn.");
  if (state.hasDrawnThisTurn) fail("You've already drawn this turn.");

  const [drawn] = drawCards(state, seat, 1);
  state.hasDrawnThisTurn = true;

  if (drawn) log(state, `${playerLabel(seat)} drew a card.`);
  else log(state, "No cards left to draw.");
}

function handlePassTurn(state, seat) {
  if (state.winner !== null) fail("The game is already over.");
  if (seat !== state.currentSeat) fail("It's not your turn.");
  if (!state.hasDrawnThisTurn) fail("Draw a card before passing.");

  state.hasDrawnThisTurn = false;
  state.currentSeat = nextSeatIndex(state, seat, 1);
}

const ACTION_HANDLERS = {
  "play-card": (state, seat, payload) => handlePlayCard(state, seat, payload.cardId, payload.chosenColor),
  "draw-card": (state, seat) => handleDrawCard(state, seat),
  "pass-turn": (state, seat) => handlePassTurn(state, seat),
};

function applyAction(state, seat, action, payload) {
  if (state.winner !== null) fail("The game is already over.");

  const handler = ACTION_HANDLERS[action];
  if (!handler) fail(`Unknown action: ${action}`);

  handler(state, seat, payload || {});
  return state;
}

function viewFor(state, seat) {
  return {
    mySeat: seat,
    myHand: state.hands[seat],
    handCounts: state.players.map((p) => state.hands[p.seat].length),
    discardTop: currentDiscardTop(state),
    activeColor: state.activeColor,
    currentSeat: state.currentSeat,
    direction: state.direction,
    hasDrawnThisTurn: state.hasDrawnThisTurn,
    drawPileCount: state.drawPile.length,
    winner: state.winner,
    finished: state.winner !== null ? { winner: state.winner } : null,
    log: state.log,
    colors: COLORS,
  };
}

module.exports = {
  minPlayers: 2,
  maxPlayers: 5,
  createInitialState,
  applyAction,
  viewFor,
  _internals: { isPlayable, nextSeatIndex, buildDeck },
};
