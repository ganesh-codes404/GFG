const {
  BOARD_SIZE,
  SPACES,
  GROUPS,
  EVENT_CARDS,
  COMMUNITY_CARDS,
  groupPositions,
  STARTING_CASH,
  GO_SALARY,
  JAIL_POSITION,
  JAIL_FINE,
  MAX_JAIL_TURNS,
} = require("./board");

const COLORS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6", "#e67e22", "#1abc9c"];

// Turns are no longer ended by the player -- after a roll resolves (and any
// buy/develop decision it triggers is answered), the server waits this long
// before automatically passing to the next player. That pause is also the
// window where TRADE and developing OTHER properties remain available.
const DECISION_TIME_MS = 15 * 1000;
const TURN_END_DELAY_MS = 6 * 1000;

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

function ownsFullGroup(state, seat, groupId) {
  return groupPositions(groupId).every((pos) => state.properties[pos]?.owner === seat);
}

function canDevelopHere(state, seat, pos) {
  const space = findSpace(pos);
  if (!space || space.type !== "property") return false;
  const prop = state.properties[pos];
  if (!prop || prop.owner !== seat || prop.mortgaged) return false;
  if (!ownsFullGroup(state, seat, space.group)) return false;
  if (prop.houses >= 5) return false;
  return state.players[seat].cash >= space.houseCost;
}

// After a landing resolves (or a pending debt clears), decide what the
// current player needs to do next: buy the space they're on, develop it,
// or -- if neither applies -- just start the auto-end-turn countdown.
function enterPostLandingPhase(state, seat) {
  const player = state.players[seat];
  const space = findSpace(player.position);
  const prop = state.properties[space.pos];

  if (["property", "transport", "utility"].includes(space.type) && prop && prop.owner === null) {
    state.phase = "buy-decision";
    state.decisionDeadline = Date.now() + DECISION_TIME_MS;
    state.turnEndDeadline = null;
    return;
  }

  if (canDevelopHere(state, seat, space.pos)) {
    state.phase = "develop-decision";
    state.decisionDeadline = Date.now() + DECISION_TIME_MS;
    state.turnEndDeadline = null;
    return;
  }

  beginTurnEndCountdown(state);
}

function beginTurnEndCountdown(state) {
  state.phase = "ending";
  state.decisionDeadline = null;
  state.turnEndDeadline = Date.now() + TURN_END_DELAY_MS;
}

function advanceToNextTurn(state, seat) {
  state.players[seat].doublesStreak = 0;
  state.currentSeat = nextActiveSeat(state, seat);
  state.turnNumber += 1;
  state.phase = "roll";
  state.turnEndDeadline = null;
  state.decisionDeadline = null;
}

function rentFor(state, space, ownerSeat) {
  const prop = state.properties[space.pos];

  if (space.type === "property") {
    if (prop.mortgaged) return 0;
    const level = prop.houses; // 0-4 = houses, 5 = hotel
    let rent = space.rent[level];
    if (level === 0 && ownsFullGroup(state, ownerSeat, space.group)) rent *= 2;
    return rent;
  }

  if (space.type === "transport") {
    if (prop.mortgaged) return 0;
    const ownedCount = SPACES.filter(
      (s) => s.type === "transport" && state.properties[s.pos]?.owner === ownerSeat
    ).length;
    return [1000, 2000, 4000, 8000][ownedCount - 1] || 1000;
  }

  if (space.type === "utility") {
    if (prop.mortgaged) return 0;
    const ownedCount = SPACES.filter(
      (s) => s.type === "utility" && state.properties[s.pos]?.owner === ownerSeat
    ).length;
    const multiplier = ownedCount >= 2 ? 10 : 4;
    return state.lastRoll.total * multiplier;
  }

  return 0;
}

function activePlayers(state) {
  return state.players.filter((p) => !p.bankrupt);
}

function nextActiveSeat(state, from) {
  const count = state.players.length;
  let seat = from;
  for (let i = 0; i < count; i++) {
    seat = (seat + 1) % count;
    if (!state.players[seat].bankrupt) return seat;
  }
  return from;
}

function createInitialState(seatCount, rng = Math.random) {
  const players = Array.from({ length: seatCount }, (_, seat) => ({
    seat,
    color: COLORS[seat],
    cash: STARTING_CASH,
    position: 0,
    inJail: false,
    jailTurns: 0,
    getOutOfJailCards: 0,
    bankrupt: false,
    doublesStreak: 0,
  }));

  const properties = {};
  for (const space of SPACES) {
    if (["property", "transport", "utility"].includes(space.type)) {
      properties[space.pos] = { owner: null, houses: 0, mortgaged: false };
    }
  }

  return {
    players,
    properties,
    eventDeck: shuffle(EVENT_CARDS, rng),
    communityDeck: shuffle(COMMUNITY_CARDS, rng),
    currentSeat: 0,
    // roll | buy-decision | develop-decision | ending | debt | finished
    phase: "roll",
    lastRoll: null,
    pendingRent: null, // { pos, ownerSeat, amount }
    pendingCard: null,
    pendingDebt: null, // { amount, toSeat|null } -- forces sell/mortgage before continuing
    decisionDeadline: null, // buy/develop decision must be made by this time
    turnEndDeadline: null, // turn auto-ends at this time once nothing is pending
    winner: null,
    turnNumber: 1,
    log: ["Andhra Business begins! Roll the dice to start."],
    rng,
  };
}

function findSpace(pos) {
  return SPACES[pos];
}

function grantSalaryIfPassed(state, seat, fromPos, toPos) {
  if (toPos < fromPos) {
    state.players[seat].cash += GO_SALARY;
    log(state, `${playerLabel(seat)} passed Andhra Start and collected ₹${GO_SALARY.toLocaleString("en-IN")}.`);
  }
}

function sendToJail(state, seat, reason) {
  const player = state.players[seat];
  player.position = JAIL_POSITION;
  player.inJail = true;
  player.jailTurns = 0;
  log(state, `${playerLabel(seat)} ${reason || "was sent to"} Traffic Halt.`);
}

function drawCard(state, seat, deckName) {
  const deck = state[deckName];
  const card = deck.shift();
  deck.push(card);

  log(state, `${playerLabel(seat)} drew: ${card.text}`);

  const player = state.players[seat];

  if (card.type === "collect") {
    player.cash += card.amount;
  } else if (card.type === "pay") {
    player.cash -= card.amount;
  } else if (card.type === "pay-each") {
    for (const other of state.players) {
      if (other.seat === seat || other.bankrupt) continue;
      player.cash -= card.amount;
      other.cash += card.amount;
    }
  } else if (card.type === "advance-to") {
    const from = player.position;
    player.position = card.pos;
    grantSalaryIfPassed(state, seat, from, card.pos);
  } else if (card.type === "go-to-jail") {
    sendToJail(state, seat, "drew a go-to-jail card and was hauled off to");
  } else if (card.type === "get-out-of-jail") {
    player.getOutOfJailCards += 1;
  } else if (card.type === "move-back") {
    player.position = (player.position - card.amount + BOARD_SIZE) % BOARD_SIZE;
  } else if (card.type === "repairs") {
    let total = 0;
    for (const pos of Object.keys(state.properties)) {
      const prop = state.properties[pos];
      if (prop.owner !== seat) continue;
      total += prop.houses === 5 ? card.perHotel : prop.houses * card.perHouse;
    }
    player.cash -= total;
  }

  checkDebt(state, seat);
}

function resolveLanding(state, seat) {
  const player = state.players[seat];
  const space = findSpace(player.position);

  if (space.type === "tax") {
    player.cash -= space.amount;
    log(state, `${playerLabel(seat)} paid ₹${space.amount.toLocaleString("en-IN")} tax.`);
    checkDebt(state, seat);
    return;
  }

  if (space.type === "go-to-jail") {
    sendToJail(state, seat, "landed on Go to Jail and was hauled off to");
    return;
  }

  if (space.type === "event") {
    drawCard(state, seat, "eventDeck");
    return;
  }

  if (space.type === "community") {
    drawCard(state, seat, "communityDeck");
    return;
  }

  if (space.type === "property" || space.type === "transport" || space.type === "utility") {
    const prop = state.properties[space.pos];

    if (prop.owner === null) {
      log(state, `${playerLabel(seat)} landed on ${space.name} (₹${space.price.toLocaleString("en-IN")}) -- up for sale.`);
      return;
    }

    if (prop.owner === seat || prop.mortgaged) return;

    const amount = rentFor(state, space, prop.owner);
    player.cash -= amount;
    state.players[prop.owner].cash += amount;

    let flavor = "";
    if (space.type === "property" && prop.houses === 0 && ownsFullGroup(state, prop.owner, space.group)) {
      flavor = " (monopoly bonus -- rent doubled!)";
    } else if (space.type === "property" && prop.houses > 0) {
      flavor = prop.houses === 5 ? " (hotel!)" : ` (${prop.houses} house${prop.houses === 1 ? "" : "s"})`;
    } else if (space.type === "transport") {
      const ownedCount = SPACES.filter(
        (s) => s.type === "transport" && state.properties[s.pos]?.owner === prop.owner
      ).length;
      flavor = ` (${ownedCount} station${ownedCount === 1 ? "" : "s"} owned)`;
    } else if (space.type === "utility") {
      const ownedCount = SPACES.filter(
        (s) => s.type === "utility" && state.properties[s.pos]?.owner === prop.owner
      ).length;
      flavor = ` (dice x${ownedCount >= 2 ? 10 : 4})`;
    }

    log(
      state,
      `${playerLabel(seat)} paid ₹${amount.toLocaleString("en-IN")} rent to ${playerLabel(prop.owner)} (${space.name})${flavor}.`
    );

    checkDebt(state, seat);
  }
}

function checkDebt(state, seat) {
  const player = state.players[seat];
  if (player.cash >= 0) return;

  const netWorth = player.cash + liquidatableValue(state, seat);

  if (netWorth < 0) {
    declareBankruptcy(state, seat);
    return;
  }

  state.pendingDebt = { seat, amount: -player.cash };
  state.phase = "debt";
  state.decisionDeadline = null;
  state.turnEndDeadline = null;
  log(state, `${playerLabel(seat)} owes money and must mortgage or sell to cover it.`);
}

function liquidatableValue(state, seat) {
  let total = 0;
  for (const [pos, prop] of Object.entries(state.properties)) {
    if (prop.owner !== seat) continue;
    const space = findSpace(Number(pos));
    if (prop.houses > 0) total += prop.houses * (space.houseCost / 2);
    if (!prop.mortgaged) total += space.mortgage;
  }
  return total;
}

function declareBankruptcy(state, seat) {
  const player = state.players[seat];
  player.bankrupt = true;

  for (const prop of Object.values(state.properties)) {
    if (prop.owner === seat) {
      prop.owner = null;
      prop.houses = 0;
      prop.mortgaged = false;
    }
  }

  log(state, `${playerLabel(seat)} went bankrupt and is out of the game!`);

  const remaining = activePlayers(state);
  state.decisionDeadline = null;
  state.turnEndDeadline = null;

  if (remaining.length === 1) {
    state.phase = "finished";
    state.winner = remaining[0].seat;
    log(state, `${playerLabel(remaining[0].seat)} wins Andhra Business!`);
  } else if (state.currentSeat === seat) {
    state.currentSeat = nextActiveSeat(state, seat);
    state.phase = "roll";
  }

  state.pendingDebt = null;
}

function handleRollDice(state, seat) {
  if (state.phase !== "roll") fail("You can't roll right now.");
  if (seat !== state.currentSeat) fail("It's not your turn.");
  if (state.pendingDebt) fail("Resolve your debt first.");

  const player = state.players[seat];
  const d1 = 1 + Math.floor(state.rng() * 6);
  const d2 = 1 + Math.floor(state.rng() * 6);
  const isDouble = d1 === d2;
  state.lastRoll = { d1, d2, total: d1 + d2, isDouble };

  log(state, `${playerLabel(seat)} rolled ${d1} + ${d2} = ${d1 + d2}.`);

  if (player.inJail) {
    if (isDouble) {
      player.inJail = false;
      player.jailTurns = 0;
      log(state, `${playerLabel(seat)} rolled doubles and left Traffic Halt!`);
    } else {
      player.jailTurns += 1;
      if (player.jailTurns >= MAX_JAIL_TURNS) {
        player.cash -= JAIL_FINE;
        player.inJail = false;
        player.jailTurns = 0;
        log(state, `${playerLabel(seat)} paid the ₹${JAIL_FINE.toLocaleString("en-IN")} fine to leave Traffic Halt.`);
        checkDebt(state, seat);
        if (state.phase === "debt") return;
      } else {
        log(state, `${playerLabel(seat)} stays in Traffic Halt.`);
        beginTurnEndCountdown(state);
        return;
      }
    }
  }

  const from = player.position;
  const to = (from + d1 + d2) % BOARD_SIZE;
  player.position = to;
  grantSalaryIfPassed(state, seat, from, to);

  resolveLanding(state, seat);

  if (state.phase === "debt" || state.phase === "finished") return;

  if (isDouble && !player.bankrupt) {
    player.doublesStreak += 1;
    if (player.doublesStreak >= 3) {
      sendToJail(state, seat, "rolled doubles three times in a row and was hauled off to");
      player.doublesStreak = 0;
      beginTurnEndCountdown(state);
      return;
    }
    log(state, `${playerLabel(seat)} rolled doubles and goes again!`);
    state.phase = "roll";
    return;
  }

  player.doublesStreak = 0;
  enterPostLandingPhase(state, seat);
}

function handleBuyProperty(state, seat) {
  if (state.phase !== "buy-decision") fail("You can't buy right now.");
  if (seat !== state.currentSeat) fail("It's not your turn.");

  const player = state.players[seat];
  const space = findSpace(player.position);
  if (!["property", "transport", "utility"].includes(space.type)) fail("Nothing to buy here.");

  const prop = state.properties[space.pos];
  if (prop.owner !== null) fail("That's already owned.");
  if (player.cash < space.price) fail("Not enough cash.");

  player.cash -= space.price;
  prop.owner = seat;
  log(state, `${playerLabel(seat)} bought ${space.name} for ₹${space.price.toLocaleString("en-IN")}.`);
  beginTurnEndCountdown(state);
}

// Declining the just-landed buy or develop prompt -- either way, the turn's
// auto-end countdown starts right after.
function handleSkipDecision(state, seat) {
  if (seat !== state.currentSeat) fail("It's not your turn.");
  if (state.phase !== "buy-decision" && state.phase !== "develop-decision") {
    fail("Nothing to skip right now.");
  }

  const space = findSpace(state.players[seat].position);
  if (state.phase === "buy-decision") {
    log(state, `${playerLabel(seat)} passed on buying ${space.name}.`);
  } else {
    log(state, `${playerLabel(seat)} passed on developing ${space.name}.`);
  }

  beginTurnEndCountdown(state);
}

function handlePayJailFine(state, seat) {
  if (seat !== state.currentSeat) fail("It's not your turn.");
  const player = state.players[seat];
  if (!player.inJail) fail("You're not in Traffic Halt.");
  if (player.cash < JAIL_FINE) fail("Not enough cash for the fine.");

  player.cash -= JAIL_FINE;
  player.inJail = false;
  player.jailTurns = 0;
  log(state, `${playerLabel(seat)} paid to leave Traffic Halt early.`);
}

function handleUseJailCard(state, seat) {
  if (seat !== state.currentSeat) fail("It's not your turn.");
  const player = state.players[seat];
  if (!player.inJail) fail("You're not in Traffic Halt.");
  if (player.getOutOfJailCards <= 0) fail("You don't have a get-out card.");

  player.getOutOfJailCards -= 1;
  player.inJail = false;
  player.jailTurns = 0;
  log(state, `${playerLabel(seat)} used a get-out-of-jail card.`);
}

function handleDevelop(state, seat, pos) {
  if (state.phase !== "develop-decision" && state.phase !== "ending") {
    fail("You can only develop right after landing, or during the pause before your turn ends.");
  }
  if (seat !== state.currentSeat) fail("It's not your turn.");

  const space = findSpace(pos);
  if (!space || space.type !== "property") fail("That's not a developable property.");

  const prop = state.properties[pos];
  if (prop.owner !== seat) fail("You don't own that property.");
  if (prop.mortgaged) fail("That property is mortgaged.");
  if (!ownsFullGroup(state, seat, space.group)) fail("You need the whole group to develop.");
  if (prop.houses >= 5) fail("Already fully developed.");

  const player = state.players[seat];
  if (player.cash < space.houseCost) fail("Not enough cash to develop.");

  player.cash -= space.houseCost;
  prop.houses += 1;
  log(state, `${playerLabel(seat)} developed ${space.name} (level ${prop.houses}/5).`);

  if (state.phase === "develop-decision") beginTurnEndCountdown(state);
}

function handleSellDevelopment(state, seat, pos) {
  if (seat !== state.currentSeat) fail("It's not your turn.");
  const space = findSpace(pos);
  const prop = state.properties[pos];
  if (!prop || prop.owner !== seat) fail("You don't own that property.");
  if (prop.houses <= 0) fail("Nothing to sell there.");

  prop.houses -= 1;
  state.players[seat].cash += space.houseCost / 2;
  log(state, `${playerLabel(seat)} sold a development on ${space.name}.`);
}

function handleMortgage(state, seat, pos) {
  const space = findSpace(pos);
  const prop = state.properties[pos];
  if (!prop || prop.owner !== seat) fail("You don't own that.");
  if (prop.mortgaged) fail("Already mortgaged.");
  if (prop.houses > 0) fail("Sell developments first.");

  prop.mortgaged = true;
  state.players[seat].cash += space.mortgage;
  log(state, `${playerLabel(seat)} mortgaged ${space.name} for ₹${space.mortgage.toLocaleString("en-IN")}.`);

  if (state.pendingDebt?.seat === seat) resolvePendingDebtIfCleared(state, seat);
}

function handleUnmortgage(state, seat, pos) {
  const space = findSpace(pos);
  const prop = state.properties[pos];
  if (!prop || prop.owner !== seat) fail("You don't own that.");
  if (!prop.mortgaged) fail("That isn't mortgaged.");

  const cost = Math.round(space.mortgage * 1.1);
  if (state.players[seat].cash < cost) fail("Not enough cash to unmortgage.");

  state.players[seat].cash -= cost;
  prop.mortgaged = false;
  log(state, `${playerLabel(seat)} paid off the mortgage on ${space.name}.`);
}

function resolvePendingDebtIfCleared(state, seat) {
  if (state.players[seat].cash >= 0) {
    state.pendingDebt = null;
    log(state, `${playerLabel(seat)} cleared their debt.`);
    enterPostLandingPhase(state, seat);
  }
}

function handlePayDebt(state, seat) {
  if (!state.pendingDebt || state.pendingDebt.seat !== seat) fail("You have no debt to resolve.");
  resolvePendingDebtIfCleared(state, seat);
  if (state.pendingDebt) fail("You still owe money -- mortgage or sell more.");
}

function handleProposeTrade(state, seat, toSeat, offer) {
  if (!state.players[toSeat] || state.players[toSeat].bankrupt) fail("Invalid trade partner.");
  if (toSeat === seat) fail("Pick another player.");

  state.tradeOffers ||= [];
  state.nextTradeId ||= 1;

  const trade = {
    id: state.nextTradeId++,
    fromSeat: seat,
    toSeat,
    giveCash: offer.giveCash || 0,
    wantCash: offer.wantCash || 0,
    giveProperties: offer.giveProperties || [],
    wantProperties: offer.wantProperties || [],
    status: "pending",
  };

  for (const pos of trade.giveProperties) {
    if (state.properties[pos]?.owner !== seat) fail("You don't own everything you're offering.");
  }

  state.tradeOffers.push(trade);
  log(state, `${playerLabel(seat)} proposed a trade to ${playerLabel(toSeat)}.`);
}

function handleRespondTrade(state, seat, tradeId, accept) {
  const trade = (state.tradeOffers || []).find((t) => t.id === tradeId && t.status === "pending");
  if (!trade) fail("That trade is no longer available.");
  if (trade.toSeat !== seat) fail("That trade isn't for you.");

  if (!accept) {
    state.tradeOffers = state.tradeOffers.filter((t) => t.id !== tradeId);
    log(state, `${playerLabel(seat)} rejected a trade.`);
    return;
  }

  const proposer = state.players[trade.fromSeat];
  const responder = state.players[seat];

  const proposerOwnsAll = trade.giveProperties.every((pos) => state.properties[pos]?.owner === trade.fromSeat);
  const responderOwnsAll = trade.wantProperties.every((pos) => state.properties[pos]?.owner === seat);

  if (
    !proposerOwnsAll ||
    !responderOwnsAll ||
    proposer.cash < trade.giveCash ||
    responder.cash < trade.wantCash
  ) {
    state.tradeOffers = state.tradeOffers.filter((t) => t.id !== tradeId);
    fail("Trade failed — assets changed since it was proposed.");
  }

  proposer.cash -= trade.giveCash;
  proposer.cash += trade.wantCash;
  responder.cash -= trade.wantCash;
  responder.cash += trade.giveCash;

  for (const pos of trade.giveProperties) state.properties[pos].owner = seat;
  for (const pos of trade.wantProperties) state.properties[pos].owner = trade.fromSeat;

  state.tradeOffers = state.tradeOffers.filter((t) => t.id !== tradeId);
  log(state, `${playerLabel(seat)} accepted a trade with ${playerLabel(trade.fromSeat)}.`);
}

function handleCancelTrade(state, seat, tradeId) {
  const trade = (state.tradeOffers || []).find((t) => t.id === tradeId);
  if (!trade) fail("That trade doesn't exist.");
  if (trade.fromSeat !== seat) fail("You can only cancel your own trade.");

  state.tradeOffers = state.tradeOffers.filter((t) => t.id !== tradeId);
  log(state, `${playerLabel(seat)} cancelled a trade offer.`);
}

const ACTION_HANDLERS = {
  "roll-dice": (state, seat) => handleRollDice(state, seat),
  "buy-property": (state, seat) => handleBuyProperty(state, seat),
  "skip-decision": (state, seat) => handleSkipDecision(state, seat),
  "pay-jail-fine": (state, seat) => handlePayJailFine(state, seat),
  "use-jail-card": (state, seat) => handleUseJailCard(state, seat),
  "develop": (state, seat, payload) => handleDevelop(state, seat, payload.pos),
  "sell-development": (state, seat, payload) => handleSellDevelopment(state, seat, payload.pos),
  "mortgage": (state, seat, payload) => handleMortgage(state, seat, payload.pos),
  "unmortgage": (state, seat, payload) => handleUnmortgage(state, seat, payload.pos),
  "pay-debt": (state, seat) => handlePayDebt(state, seat),
  "propose-trade": (state, seat, payload) => handleProposeTrade(state, seat, payload.toSeat, payload),
  "respond-trade": (state, seat, payload) => handleRespondTrade(state, seat, payload.tradeId, payload.accept),
  "cancel-trade": (state, seat, payload) => handleCancelTrade(state, seat, payload.tradeId),
};

function applyAction(state, seat, action, payload) {
  if (state.phase === "finished") fail("The game is already over.");
  if (state.players[seat]?.bankrupt) fail("You're out of the game.");

  const handler = ACTION_HANDLERS[action];
  if (!handler) fail(`Unknown action: ${action}`);

  handler(state, seat, payload || {});
  return state;
}

// Turns no longer wait on the player to end them -- a buy/develop decision
// times out on its own, and the post-decision "ending" pause auto-advances
// to the next player. This stays a no-op for every other phase.
function nextDeadline(state) {
  if (state.phase === "buy-decision" || state.phase === "develop-decision") return state.decisionDeadline;
  if (state.phase === "ending") return state.turnEndDeadline;
  return null;
}

function advanceTime(state) {
  const now = Date.now();
  const seat = state.currentSeat;

  if (
    (state.phase === "buy-decision" || state.phase === "develop-decision") &&
    state.decisionDeadline !== null &&
    now >= state.decisionDeadline
  ) {
    const space = findSpace(state.players[seat].position);
    log(state, `${playerLabel(seat)} ran out of time to decide on ${space.name}.`);
    beginTurnEndCountdown(state);
    return state;
  }

  if (state.phase === "ending" && state.turnEndDeadline !== null && now >= state.turnEndDeadline) {
    advanceToNextTurn(state, seat);
    return state;
  }

  return state;
}

function viewFor(state, seat) {
  return {
    mySeat: seat,
    boardSize: BOARD_SIZE,
    spaces: SPACES,
    groups: GROUPS,
    properties: state.properties,
    players: state.players.map((p) => ({
      seat: p.seat,
      color: p.color,
      cash: p.cash,
      position: p.position,
      inJail: p.inJail,
      jailTurns: p.jailTurns,
      getOutOfJailCards: p.getOutOfJailCards,
      bankrupt: p.bankrupt,
    })),
    currentSeat: state.currentSeat,
    phase: state.phase,
    lastRoll: state.lastRoll,
    pendingDebt: state.pendingDebt,
    decisionDeadline: state.decisionDeadline,
    turnEndDeadline: state.turnEndDeadline,
    tradeOffers: state.tradeOffers || [],
    winner: state.winner,
    turnNumber: state.turnNumber,
    log: state.log,
    finished: state.phase === "finished" ? { winner: state.winner } : null,
  };
}

module.exports = {
  minPlayers: 4,
  maxPlayers: 7,
  createInitialState,
  applyAction,
  viewFor,
  nextDeadline,
  advanceTime,
  _internals: { rentFor, ownsFullGroup, findSpace, liquidatableValue, canDevelopHere },
};
