// Word Rush -- 2-7 players. Everyone races the same secret word each round,
// Wordle-style (green/yellow/gray feedback, 6 guesses). First correct guess
// wins the round and scores a point; after a fixed number of rounds the
// highest score wins, with extra sudden-death rounds to break a tie.

const WORDS = require("./words");

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const TOTAL_ROUNDS = 5;

const VALID_WORDS = new Set(WORDS);

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

function pickWord(state) {
  const remaining = WORDS.filter((w) => !state.usedWords.includes(w));
  const pool = remaining.length > 0 ? remaining : WORDS;
  const word = pool[Math.floor(state.rng() * pool.length)];
  state.usedWords.push(word);
  return word;
}

// Standard Wordle two-pass algorithm: mark exact matches first, then mark
// "present" from what's left so a repeated letter is never over-credited.
function scoreGuess(guess, secret) {
  const result = new Array(WORD_LENGTH).fill("absent");
  const secretLetters = secret.split("");
  const used = new Array(WORD_LENGTH).fill(false);

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === secretLetters[i]) {
      result[i] = "correct";
      used[i] = true;
    }
  }

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === "correct") continue;

    const foundIndex = secretLetters.findIndex((ch, j) => !used[j] && ch === guess[i]);
    if (foundIndex !== -1) {
      result[i] = "present";
      used[foundIndex] = true;
    }
  }

  return result;
}

function startRound(state) {
  state.secretWord = pickWord(state);
  state.roundOver = false;
  state.roundWinner = null;
  state.players.forEach((p) => {
    p.guesses = [];
    p.solved = false;
    p.outOfGuesses = false;
  });
  log(state, `Round ${state.round} begins! Guess the ${WORD_LENGTH}-letter word.`);
}

function createInitialState(seatCount, rng = Math.random) {
  const state = {
    round: 1,
    totalRounds: TOTAL_ROUNDS,
    secretWord: null,
    usedWords: [],
    roundOver: false,
    roundWinner: null,
    players: Array.from({ length: seatCount }, (_, seat) => ({
      seat,
      score: 0,
      guesses: [],
      solved: false,
      outOfGuesses: false,
    })),
    winner: null,
    log: ["Word Rush begins! First correct guess each round wins the point."],
    rng,
  };

  startRound(state);
  return state;
}

function roundIsOver(state) {
  return state.players.every((p) => p.solved || p.outOfGuesses);
}

function topScorers(state) {
  const best = Math.max(...state.players.map((p) => p.score));
  return state.players.filter((p) => p.score === best);
}

function handleSubmitGuess(state, seat, { guess }) {
  if (state.winner !== null) fail("The game is already over.");
  if (state.roundOver) fail("This round is already over.");

  const player = state.players[seat];
  if (player.solved) fail("You already solved this round.");
  if (player.outOfGuesses) fail("You're out of guesses this round.");

  const normalized = String(guess || "").trim().toLowerCase();
  if (normalized.length !== WORD_LENGTH || !/^[a-z]+$/.test(normalized)) {
    fail("Guesses must be a 5-letter word.");
  }
  if (!VALID_WORDS.has(normalized)) fail("Not in the word list.");

  const feedback = scoreGuess(normalized, state.secretWord);
  player.guesses.push({ word: normalized, feedback });

  if (normalized === state.secretWord) {
    player.solved = true;
    player.score += 1;
    state.roundOver = true;
    state.roundWinner = seat;
    log(state, `${playerLabel(seat)} guessed "${state.secretWord.toUpperCase()}" and takes the round!`);
    return;
  }

  if (player.guesses.length >= MAX_GUESSES) {
    player.outOfGuesses = true;
    log(state, `${playerLabel(seat)} is out of guesses this round.`);
  }

  if (roundIsOver(state)) {
    state.roundOver = true;
    log(state, `Nobody solved it -- the word was "${state.secretWord.toUpperCase()}".`);
  }
}

function handleNextRound(state) {
  if (state.winner !== null) fail("The game is already over.");
  if (!state.roundOver) fail("The round isn't over yet.");

  if (state.round >= state.totalRounds) {
    const leaders = topScorers(state);

    if (leaders.length === 1) {
      state.winner = leaders[0].seat;
      log(state, `${playerLabel(state.winner)} wins Word Rush!`);
      return;
    }

    log(state, "It's a tie -- sudden death round!");
    state.totalRounds += 1;
  }

  state.round += 1;
  startRound(state);
}

const ACTION_HANDLERS = {
  "submit-guess": (state, seat, payload) => handleSubmitGuess(state, seat, payload),
  "next-round": (state) => handleNextRound(state),
};

function applyAction(state, seat, action, payload) {
  if (state.winner !== null) fail("The game is already over.");

  const handler = ACTION_HANDLERS[action];
  if (!handler) fail(`Unknown action: ${action}`);

  handler(state, seat, payload || {});
  return state;
}

function viewFor(state, seat) {
  const me = state.players[seat];

  return {
    round: state.round,
    totalRounds: state.totalRounds,
    wordLength: WORD_LENGTH,
    maxGuesses: MAX_GUESSES,
    roundOver: state.roundOver,
    roundWinner: state.roundOver ? state.roundWinner : null,
    secretWord: state.roundOver ? state.secretWord : null,
    myGuesses: me.guesses,
    mySolved: me.solved,
    myOutOfGuesses: me.outOfGuesses,
    scores: state.players.map((p) => ({ seat: p.seat, score: p.score })),
    others: state.players
      .filter((p) => p.seat !== seat)
      .map((p) => ({
        seat: p.seat,
        guessCount: p.guesses.length,
        solved: p.solved,
        outOfGuesses: p.outOfGuesses,
        guesses: state.roundOver ? p.guesses : undefined,
      })),
    winner: state.winner,
    finished: state.winner !== null ? { winner: state.winner } : null,
    log: state.log,
  };
}

module.exports = {
  minPlayers: 2,
  maxPlayers: 7,
  createInitialState,
  applyAction,
  viewFor,
  _internals: { WORDS, VALID_WORDS, scoreGuess, WORD_LENGTH, MAX_GUESSES, TOTAL_ROUNDS },
};
