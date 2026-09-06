// Pictionary -- 5-7 players, skribbl-style. The host picks how many rounds
// to play (1-8, each round = every player draws once) before the first
// word is chosen. One player draws each turn while everyone else guesses
// by text; the actual drawing is streamed as a list of strokes so every
// screen renders the same canvas live.
//
// Word-choice, drawing, and reveal each run on a real wall-clock deadline
// so the game keeps moving even if nobody acts in time -- see
// `nextDeadline`/`advanceTime`, which server.js drives generically.

const WORDS = require("./words");

const MAX_ROUNDS = 8;
const CHOICE_TIME_MS = 12 * 1000;
const DRAW_TIME_MS = 70 * 1000;
const REVEAL_TIME_MS = 5 * 1000;
const GUESS_SCORE_TIERS = [100, 80, 60, 50, 40, 30, 20];
const DRAWER_BONUS_PER_GUESSER = 20;

function fail(message) {
  throw new Error(message);
}

function playerLabel(seat) {
  return `Player ${seat + 1}`;
}

function log(state, message) {
  state.log.push(message);
  if (state.log.length > 60) state.log.shift();
}

function shuffle(array, rng) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickWordChoices(state) {
  const available = WORDS.filter((w) => !state.usedWords.includes(w));
  const pool = available.length >= 3 ? available : WORDS;
  return shuffle(pool, state.rng).slice(0, 3);
}

function createInitialState(seatCount, rng = Math.random) {
  const startOffset = Math.floor(rng() * seatCount);
  return {
    seatCount,
    phase: "setup",
    numRounds: null,
    turnIndex: 0,
    startOffset,
    currentDrawer: startOffset,
    wordChoices: [],
    secretWord: null,
    usedWords: [],
    strokes: [],
    guessLog: [],
    correctSeats: [],
    scores: Array(seatCount).fill(0),
    choiceDeadline: null,
    drawDeadline: null,
    revealDeadline: null,
    lastReveal: null,
    winner: null,
    log: ["Pictionary is ready -- the host picks how many rounds to play."],
    rng,
  };
}

function startChoosingPhase(state) {
  state.phase = "choosing";
  state.wordChoices = pickWordChoices(state);
  state.secretWord = null;
  state.strokes = [];
  state.guessLog = [];
  state.correctSeats = [];
  state.choiceDeadline = Date.now() + CHOICE_TIME_MS;
  state.drawDeadline = null;
  state.revealDeadline = null;
  state.lastReveal = null;
  log(state, `${playerLabel(state.currentDrawer)} is choosing a word...`);
}

function beginDrawing(state, word) {
  state.secretWord = word;
  state.usedWords.push(word);
  state.phase = "drawing";
  state.choiceDeadline = null;
  state.drawDeadline = Date.now() + DRAW_TIME_MS;
  log(state, `${playerLabel(state.currentDrawer)} is drawing now!`);
}

function endDrawingTurn(state) {
  state.lastReveal = {
    word: state.secretWord,
    drawerSeat: state.currentDrawer,
    correctSeats: state.correctSeats.slice(),
  };
  log(state, `The word was "${state.secretWord}"!`);

  state.turnIndex += 1;
  state.phase = "reveal";
  state.drawDeadline = null;
  state.revealDeadline = Date.now() + REVEAL_TIME_MS;
}

function handleSetRounds(state, seat, { rounds }) {
  if (state.phase !== "setup") fail("Rounds are already set.");

  const n = Number(rounds);
  if (!Number.isInteger(n) || n < 1 || n > MAX_ROUNDS) {
    fail(`Choose between 1 and ${MAX_ROUNDS} rounds.`);
  }

  state.numRounds = n;
  log(state, `The game will run for ${n} round${n === 1 ? "" : "s"}.`);
  startChoosingPhase(state);
}

function handleChooseWord(state, seat, { word }) {
  if (state.phase !== "choosing") fail("There's no word to choose right now.");
  if (seat !== state.currentDrawer) fail("Only the drawer picks the word.");
  if (!state.wordChoices.includes(word)) fail("Invalid word choice.");

  beginDrawing(state, word);
}

function requireDrawer(state, seat) {
  if (state.phase !== "drawing") fail("Not drawing right now.");
  if (seat !== state.currentDrawer) fail("Only the drawer can draw.");
}

function handleStartStroke(state, seat, { strokeId, color, size, point }) {
  requireDrawer(state, seat);
  if (!strokeId || !point) fail("Invalid stroke.");

  state.strokes.push({
    id: strokeId,
    color: color || "#1a1a1a",
    size: size || 5,
    points: [point],
  });
}

function handleAppendStroke(state, seat, { strokeId, points }) {
  requireDrawer(state, seat);
  const stroke = state.strokes.find((s) => s.id === strokeId);
  if (!stroke) fail("Unknown stroke.");
  if (!Array.isArray(points) || points.length === 0) fail("No points to add.");

  stroke.points.push(...points);
}

function handleClearCanvas(state, seat) {
  requireDrawer(state, seat);
  state.strokes = [];
}

function normalizeGuess(text) {
  return text.trim().toLowerCase();
}

function handleSubmitGuess(state, seat, { text }) {
  if (state.phase !== "drawing") fail("No round in progress.");
  if (seat === state.currentDrawer) fail("The drawer can't guess.");
  if (state.correctSeats.includes(seat)) fail("You already guessed it.");
  if (!text || !text.trim()) fail("Type a guess first.");

  const guess = normalizeGuess(text);

  if (guess === normalizeGuess(state.secretWord)) {
    state.correctSeats.push(seat);
    const rank = state.correctSeats.length;
    const points = GUESS_SCORE_TIERS[rank - 1] ?? 10;
    state.scores[seat] += points;
    state.scores[state.currentDrawer] += DRAWER_BONUS_PER_GUESSER;
    state.guessLog.push({ seat, correct: true });
    log(state, `${playerLabel(seat)} guessed the word! (+${points})`);

    const guessersNeeded = state.seatCount - 1;
    if (state.correctSeats.length >= guessersNeeded) {
      endDrawingTurn(state);
    }
  } else {
    state.guessLog.push({ seat, text: text.trim().slice(0, 80) });
  }
}

const ACTION_HANDLERS = {
  "set-rounds": handleSetRounds,
  "choose-word": handleChooseWord,
  "start-stroke": handleStartStroke,
  "append-stroke": handleAppendStroke,
  "clear-canvas": handleClearCanvas,
  "submit-guess": handleSubmitGuess,
};

function applyAction(state, seat, action, payload) {
  if (state.phase === "finished") fail("The game is already over.");

  const handler = ACTION_HANDLERS[action];
  if (!handler) fail(`Unknown action: ${action}`);

  handler(state, seat, payload || {});
  return state;
}

function advanceTime(state) {
  const now = Date.now();

  if (state.phase === "choosing" && state.choiceDeadline !== null && now >= state.choiceDeadline) {
    const word = state.wordChoices[0];
    log(state, `Time's up -- auto-picked "${word}".`);
    beginDrawing(state, word);
    return state;
  }

  if (state.phase === "drawing" && state.drawDeadline !== null && now >= state.drawDeadline) {
    log(state, "Time's up!");
    endDrawingTurn(state);
    return state;
  }

  if (state.phase === "reveal" && state.revealDeadline !== null && now >= state.revealDeadline) {
    const totalTurns = state.numRounds * state.seatCount;

    if (state.turnIndex >= totalTurns) {
      state.phase = "finished";
      const maxScore = Math.max(...state.scores);
      state.winner = state.scores.findIndex((s) => s === maxScore);
      log(state, `${playerLabel(state.winner)} wins with ${maxScore} points!`);
    } else {
      state.currentDrawer = (state.turnIndex + state.startOffset) % state.seatCount;
      startChoosingPhase(state);
    }

    return state;
  }

  return state;
}

function nextDeadline(state) {
  if (state.phase === "choosing") return state.choiceDeadline;
  if (state.phase === "drawing") return state.drawDeadline;
  if (state.phase === "reveal") return state.revealDeadline;
  return null;
}

function viewFor(state, seat) {
  const isDrawer = seat === state.currentDrawer;

  return {
    phase: state.phase,
    maxRounds: MAX_ROUNDS,
    numRounds: state.numRounds,
    round: state.numRounds ? Math.min(state.numRounds, Math.floor(state.turnIndex / state.seatCount) + 1) : null,
    currentDrawer: state.currentDrawer,
    isDrawer,
    wordChoices: isDrawer && state.phase === "choosing" ? state.wordChoices : [],
    secretWord: isDrawer ? state.secretWord : null,
    wordLength: !isDrawer && state.secretWord ? state.secretWord.length : null,
    strokes: state.strokes,
    guessLog: state.guessLog,
    haveIGuessed: state.correctSeats.includes(seat),
    correctCount: state.correctSeats.length,
    guessersNeeded: state.seatCount - 1,
    scores: state.scores,
    choiceDeadline: state.choiceDeadline,
    drawDeadline: state.drawDeadline,
    revealDeadline: state.revealDeadline,
    lastReveal: state.lastReveal,
    winner: state.winner,
    finished: state.winner !== null ? { winner: state.winner, scores: state.scores } : null,
    log: state.log,
  };
}

module.exports = {
  minPlayers: 5,
  maxPlayers: 7,
  createInitialState,
  applyAction,
  viewFor,
  nextDeadline,
  advanceTime,
  _internals: { WORDS, MAX_ROUNDS, CHOICE_TIME_MS, DRAW_TIME_MS, REVEAL_TIME_MS },
};
