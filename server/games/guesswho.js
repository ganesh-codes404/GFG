// 2-4 players, each secretly assigned one of these characters (no two
// players share one). The classic board keeps all 24 in play even with
// only 2-4 real players -- most are red herrings nobody was ever assigned,
// which is exactly how the physical game works too.
const CHARACTERS = [
  { id: "milo", name: "Milo", glasses: true, hat: false, facialHair: false, hairColor: "brown" },
  { id: "beau", name: "Beau", glasses: false, hat: false, facialHair: true, hairColor: "brown" },
  { id: "sunny", name: "Sunny", glasses: false, hat: false, facialHair: false, hairColor: "blonde" },
  { id: "gus", name: "Gus", glasses: false, hat: false, facialHair: false, hairColor: "gray" },
  { id: "nell", name: "Nell", glasses: false, hat: false, facialHair: false, hairColor: "gray" },
  { id: "rusty", name: "Rusty", glasses: false, hat: false, facialHair: false, hairColor: "red" },
  { id: "coral", name: "Coral", glasses: false, hat: false, facialHair: false, hairColor: "black" },
  { id: "baldwin", name: "Baldwin", glasses: false, hat: false, facialHair: false, hairColor: "bald" },
  { id: "nick", name: "Nick", glasses: false, hat: true, facialHair: true, hairColor: "gray" },
  { id: "trench", name: "Trench", glasses: true, hat: true, facialHair: false, hairColor: "brown" },
  { id: "raj", name: "Raj", glasses: false, hat: true, facialHair: false, hairColor: "black" },
  { id: "hiro", name: "Hiro", glasses: false, hat: true, facialHair: false, hairColor: "black" },
  { id: "tex", name: "Tex", glasses: false, hat: true, facialHair: false, hairColor: "brown" },
  { id: "rosa", name: "Rosa", glasses: false, hat: true, facialHair: false, hairColor: "black" },
  { id: "leo", name: "Leo", glasses: false, hat: true, facialHair: false, hairColor: "black" },
  { id: "buzz", name: "Buzz", glasses: false, hat: true, facialHair: false, hairColor: "brown" },
  { id: "percy", name: "Percy", glasses: false, hat: true, facialHair: false, hairColor: "black" },
  { id: "kage", name: "Kage", glasses: false, hat: true, facialHair: false, hairColor: "black" },
  { id: "wiz", name: "Wiz", glasses: false, hat: true, facialHair: true, hairColor: "gray" },
  { id: "dez", name: "Dez", glasses: false, hat: false, facialHair: false, hairColor: "black" },
  { id: "zeke", name: "Zeke", glasses: false, hat: false, facialHair: false, hairColor: "green" },
  { id: "bobo", name: "Bobo", glasses: false, hat: false, facialHair: false, hairColor: "rainbow" },
  { id: "remy", name: "Remy", glasses: false, hat: false, facialHair: false, hairColor: "bald" },
  { id: "blaze", name: "Blaze", glasses: false, hat: false, facialHair: false, hairColor: "black" },
];

const QUESTIONS = [
  { id: "glasses", text: "Does your character wear glasses?", check: (c) => c.glasses },
  { id: "hat", text: "Is your character wearing a hat?", check: (c) => c.hat },
  { id: "facial-hair", text: "Does your character have facial hair?", check: (c) => c.facialHair },
  { id: "hair-black", text: "Does your character have black hair?", check: (c) => c.hairColor === "black" },
  { id: "hair-brown", text: "Does your character have brown hair?", check: (c) => c.hairColor === "brown" },
  { id: "hair-blonde", text: "Does your character have blonde hair?", check: (c) => c.hairColor === "blonde" },
  { id: "hair-red", text: "Does your character have red hair?", check: (c) => c.hairColor === "red" },
  { id: "hair-gray", text: "Does your character have gray hair?", check: (c) => c.hairColor === "gray" },
  { id: "bald", text: "Is your character bald?", check: (c) => c.hairColor === "bald" },
];

function fail(message) {
  throw new Error(message);
}

function shuffle(array, rng) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function playerLabel(seat) {
  return `Player ${seat + 1}`;
}

function log(state, message) {
  state.log.push(message);
  if (state.log.length > 80) state.log.shift();
}

function findCharacter(id) {
  return CHARACTERS.find((c) => c.id === id);
}

function nextActiveSeat(state, from) {
  const count = state.players.length;
  let seat = from;
  for (let i = 0; i < count; i++) {
    seat = (seat + 1) % count;
    if (!state.players[seat].eliminated) return seat;
  }
  return from;
}

function advanceTurn(state, seat) {
  state.currentSeat = nextActiveSeat(state, seat);
  state.turnNumber += 1;
}

function createInitialState(seatCount, rng = Math.random) {
  const assigned = shuffle(CHARACTERS, rng).slice(0, seatCount);

  const players = assigned.map((character, seat) => ({
    seat,
    characterId: character.id,
    eliminated: false,
  }));

  return {
    players,
    currentSeat: Math.floor(rng() * seatCount),
    phase: "playing",
    winner: null,
    turnNumber: 1,
    log: ["Guess Who begins! Everyone has a secret character -- ask questions or make a guess."],
    rng,
  };
}

function assertOwnTurnAndTarget(state, seat, targetSeat) {
  if (state.phase !== "playing") fail("The game is already over.");
  if (seat !== state.currentSeat) fail("It's not your turn.");
  const me = state.players[seat];
  if (me.eliminated) fail("You're out of the game.");
  if (targetSeat === seat) fail("Pick someone else.");
  const target = state.players[targetSeat];
  if (!target) fail("Invalid player.");
  if (target.eliminated) fail("That player is already out.");
  return target;
}

function handleAskQuestion(state, seat, targetSeat, questionId) {
  const target = assertOwnTurnAndTarget(state, seat, targetSeat);

  const question = QUESTIONS.find((q) => q.id === questionId);
  if (!question) fail("Unknown question.");

  const targetCharacter = findCharacter(target.characterId);
  const answer = question.check(targetCharacter);

  log(
    state,
    `${playerLabel(seat)} asked ${playerLabel(targetSeat)}: "${question.text}" -- ${answer ? "YES" : "NO"}.`
  );

  advanceTurn(state, seat);
}

function handleMakeGuess(state, seat, targetSeat, characterId) {
  const target = assertOwnTurnAndTarget(state, seat, targetSeat);

  const character = findCharacter(characterId);
  if (!character) fail("Unknown character.");

  if (target.characterId === characterId) {
    target.eliminated = true;
    log(
      state,
      `${playerLabel(seat)} correctly guessed ${playerLabel(targetSeat)} is ${character.name}! ${playerLabel(targetSeat)} is out.`
    );

    const remaining = state.players.filter((p) => !p.eliminated);
    if (remaining.length === 1) {
      state.phase = "finished";
      state.winner = remaining[0].seat;
      log(state, `${playerLabel(remaining[0].seat)} wins Guess Who!`);
      return;
    }
  } else {
    log(
      state,
      `${playerLabel(seat)} guessed ${character.name} for ${playerLabel(targetSeat)} -- WRONG.`
    );
  }

  advanceTurn(state, seat);
}

const ACTION_HANDLERS = {
  "ask-question": (state, seat, payload) => handleAskQuestion(state, seat, payload.targetSeat, payload.questionId),
  "make-guess": (state, seat, payload) => handleMakeGuess(state, seat, payload.targetSeat, payload.characterId),
};

function applyAction(state, seat, action, payload) {
  if (state.phase === "finished") fail("The game is already over.");

  const handler = ACTION_HANDLERS[action];
  if (!handler) fail(`Unknown action: ${action}`);

  handler(state, seat, payload || {});
  return state;
}

function viewFor(state, seat) {
  // Once the game's over, reveal everyone's true identity -- including the
  // winner's, whose character was never actually guessed and would
  // otherwise stay hidden forever.
  const revealAll = state.phase === "finished";

  return {
    mySeat: seat,
    characters: CHARACTERS,
    questions: QUESTIONS.map((q) => ({ id: q.id, text: q.text })),
    myCharacterId: state.players[seat]?.characterId ?? null,
    players: state.players.map((p) => ({
      seat: p.seat,
      eliminated: p.eliminated,
      // Only public once someone's guessed it correctly (or the game's
      // over) -- hidden otherwise, including from the character's own
      // owner's view of OTHER players (their own is separately exposed as
      // myCharacterId above).
      characterId: p.eliminated || revealAll ? p.characterId : null,
    })),
    currentSeat: state.currentSeat,
    phase: state.phase,
    winner: state.winner,
    turnNumber: state.turnNumber,
    log: state.log,
    finished: state.phase === "finished" ? { winner: state.winner } : null,
  };
}

module.exports = {
  minPlayers: 2,
  maxPlayers: 4,
  createInitialState,
  applyAction,
  viewFor,
  _internals: { CHARACTERS, QUESTIONS, findCharacter },
};
