// Imposter -- 5-7 players. Everyone gets a topic and says words related to
// it out loud (that part happens in real life, not in this app). Exactly 2
// players secretly get a very similar but different topic, and don't know
// they're the imposters. After talking, the group votes someone out; every
// screen learns immediately whether that player was an imposter. A 1-minute
// cooldown gates the start of each new vote so there's time to talk between
// rounds.

const TOPIC_PAIRS = require("./topics");

const IMPOSTER_COUNT = 2;
const VOTE_COOLDOWN_MS = 60 * 1000;

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

function aliveSeats(state) {
  return state.players.filter((p) => p.alive).map((p) => p.seat);
}

function checkWinCondition(state) {
  const aliveImposters = state.imposterSeats.filter((s) => state.players[s].alive).length;
  const aliveCrew = aliveSeats(state).length - aliveImposters;

  if (aliveImposters === 0) {
    state.winner = "crew";
    log(state, "Every imposter has been caught -- the crew wins!");
  } else if (aliveImposters >= aliveCrew) {
    state.winner = "imposters";
    log(state, "The imposters equal or outnumber the crew -- imposters win!");
  }
}

function resolveVote(state) {
  const counts = {};
  for (const target of Object.values(state.votes)) {
    counts[target] = (counts[target] || 0) + 1;
  }

  let maxVotes = -1;
  let top = [];
  for (const [seatStr, count] of Object.entries(counts)) {
    const seat = Number(seatStr);
    if (count > maxVotes) {
      maxVotes = count;
      top = [seat];
    } else if (count === maxVotes) {
      top.push(seat);
    }
  }

  if (top.length !== 1) {
    log(state, "The vote was tied -- no one was eliminated.");
    state.lastElimination = null;
  } else {
    const eliminatedSeat = top[0];
    state.players[eliminatedSeat].alive = false;
    const wasImposter = state.imposterSeats.includes(eliminatedSeat);
    state.lastElimination = { seat: eliminatedSeat, wasImposter };
    log(
      state,
      `${playerLabel(eliminatedSeat)} was voted out -- they ${wasImposter ? "WERE" : "were NOT"} an imposter!`
    );
  }

  state.phase = "discussion";
  state.votes = {};
  state.round += 1;
  state.cooldownEndsAt = Date.now() + VOTE_COOLDOWN_MS;

  checkWinCondition(state);
}

function createInitialState(seatCount, rng = Math.random) {
  const pair = TOPIC_PAIRS[Math.floor(rng() * TOPIC_PAIRS.length)];
  const seats = Array.from({ length: seatCount }, (_, seat) => seat);
  const imposterSeats = shuffle(seats, rng).slice(0, IMPOSTER_COUNT).sort((a, b) => a - b);

  const players = Array.from({ length: seatCount }, (_, seat) => ({
    seat,
    alive: true,
    topic: imposterSeats.includes(seat) ? pair.imposter : pair.main,
  }));

  return {
    topicMain: pair.main,
    topicImposter: pair.imposter,
    imposterSeats,
    players,
    phase: "discussion",
    votes: {},
    round: 1,
    lastElimination: null,
    cooldownEndsAt: null,
    winner: null,
    log: ["The Imposter game begins! Check your topic, then talk it out loud."],
    rng,
  };
}

function handleStartVoting(state, seat) {
  if (state.winner !== null) fail("The game is already over.");
  if (!state.players[seat]?.alive) fail("Eliminated players can't do that.");
  if (state.phase !== "discussion") fail("A vote is already in progress.");
  if (state.cooldownEndsAt !== null && Date.now() < state.cooldownEndsAt) {
    fail("Still on cooldown -- wait before starting another vote.");
  }

  state.phase = "voting";
  state.votes = {};
  log(state, `${playerLabel(seat)} called for a vote.`);
}

function handleSubmitVote(state, seat, { targetSeat }) {
  if (state.winner !== null) fail("The game is already over.");
  if (state.phase !== "voting") fail("There's no vote in progress.");
  if (!state.players[seat]?.alive) fail("Eliminated players can't vote.");
  if (seat === targetSeat) fail("You can't vote for yourself.");

  const target = state.players[targetSeat];
  if (!target || !target.alive) fail("Invalid vote target.");

  state.votes[seat] = targetSeat;
  log(state, `${playerLabel(seat)} cast a vote.`);

  const alive = aliveSeats(state);
  const allVoted = alive.every((s) => state.votes[s] !== undefined);
  if (allVoted) resolveVote(state);
}

const ACTION_HANDLERS = {
  "start-voting": (state, seat) => handleStartVoting(state, seat),
  "submit-vote": (state, seat, payload) => handleSubmitVote(state, seat, payload),
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
  const alive = aliveSeats(state);
  const votedSeats = Object.keys(state.votes).map(Number);

  return {
    myTopic: me.topic,
    myAlive: me.alive,
    players: state.players.map((p) => ({ seat: p.seat, alive: p.alive })),
    phase: state.phase,
    round: state.round,
    votesIn: votedSeats.length,
    votesNeeded: alive.length,
    haveIVoted: votedSeats.includes(seat),
    cooldownEndsAt: state.cooldownEndsAt,
    lastElimination: state.lastElimination,
    winner: state.winner,
    finished:
      state.winner !== null
        ? {
            winner: state.winner,
            topicMain: state.topicMain,
            topicImposter: state.topicImposter,
            imposterSeats: state.imposterSeats,
          }
        : null,
    log: state.log,
  };
}

module.exports = {
  minPlayers: 5,
  maxPlayers: 7,
  createInitialState,
  applyAction,
  viewFor,
  _internals: { TOPIC_PAIRS, IMPOSTER_COUNT, VOTE_COOLDOWN_MS, checkWinCondition, resolveVote },
};
