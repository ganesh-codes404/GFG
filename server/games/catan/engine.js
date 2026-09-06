const board = require("./board");
const { buildDeck } = require("./deck");

const COLORS = ["#e74c3c", "#3498db", "#f1c40f", "#2ecc71", "#9b59b6"];

const ROAD_COST = { cement: 1, timber: 1 };
const SETTLEMENT_COST = { timber: 1, cement: 1, grain: 1, cattle: 1 };
const CITY_COST = { steel: 3, grain: 2 };
const DEV_CARD_COST = { steel: 1, grain: 1, cattle: 1 };

const RESOURCES = board.RESOURCE_TYPES;

function emptyHand() {
  return { cattle: 0, cement: 0, timber: 0, grain: 0, steel: 0 };
}

function handTotal(hand) {
  return RESOURCES.reduce((sum, r) => sum + hand[r], 0);
}

function canAfford(hand, cost) {
  return Object.entries(cost).every(([resource, qty]) => hand[resource] >= qty);
}

function pay(hand, cost) {
  for (const [resource, qty] of Object.entries(cost)) {
    hand[resource] -= qty;
  }
}

function grant(hand, resource, qty = 1) {
  hand[resource] += qty;
}

function fail(message) {
  throw new Error(message);
}

function rollDie(rng) {
  return Math.floor(rng() * 6) + 1;
}

/**
 * Longest simple path through a player's own roads. An opponent's
 * settlement/city sitting on a vertex blocks the path from continuing past
 * it (the edges leading up to it still count).
 */
function longestRoadForPlayer(state, seat) {
  const roads = state.players[seat].roads;
  if (roads.size === 0) return 0;

  const adjacency = {};

  for (const edgeId of roads) {
    const [a, b] = board.edgeVertices(edgeId);
    (adjacency[a] ||= []).push({ edgeId, next: b });
    (adjacency[b] ||= []).push({ edgeId, next: a });
  }

  const isBlocked = (vertexId) => {
    const building = state.buildings[vertexId];
    return Boolean(building && building.seat !== seat);
  };

  let best = 0;

  const dfs = (vertex, visited) => {
    best = Math.max(best, visited.size);
    if (isBlocked(vertex)) return;

    for (const { edgeId, next } of adjacency[vertex] || []) {
      if (visited.has(edgeId)) continue;
      visited.add(edgeId);
      dfs(next, visited);
      visited.delete(edgeId);
    }
  };

  for (const edgeId of roads) {
    const [a, b] = board.edgeVertices(edgeId);
    for (const start of [a, b]) {
      dfs(start, new Set([edgeId]));
    }
  }

  return best;
}

const MIN_LONGEST_ROAD_LENGTH = 5;

function recalcLongestRoad(state) {
  for (const player of state.players) {
    player.roadLength = longestRoadForPlayer(state, player.seat);
  }

  // If the current holder's road got broken (an opponent settled in the
  // middle of it) and no longer qualifies, the bonus becomes unclaimed.
  if (
    state.longestRoad !== null &&
    state.players[state.longestRoad].roadLength < MIN_LONGEST_ROAD_LENGTH
  ) {
    state.longestRoad = null;
  }

  // Standard rule: once held, it only changes hands if someone STRICTLY
  // exceeds the current holder's length (ties keep the existing holder).
  let winner = state.longestRoad;
  let winnerLength =
    winner !== null ? state.players[winner].roadLength : MIN_LONGEST_ROAD_LENGTH - 1;

  for (const player of state.players) {
    if (player.seat === winner) continue;
    if (player.roadLength > winnerLength) {
      winner = player.seat;
      winnerLength = player.roadLength;
    }
  }

  state.longestRoad = winner;
}

function recalcLargestArmy(state) {
  let bestSeat = state.largestArmy;
  let bestCount = bestSeat !== null ? state.players[bestSeat].knightsPlayed : 2;

  for (const player of state.players) {
    if (player.knightsPlayed >= 3 && player.knightsPlayed > bestCount) {
      bestCount = player.knightsPlayed;
      bestSeat = player.seat;
    }
  }

  state.largestArmy = bestSeat;
}

function publicVictoryPoints(state, seat) {
  const player = state.players[seat];
  let points = player.settlements.size + player.cities.size * 2;

  if (state.longestRoad === seat) points += 2;
  if (state.largestArmy === seat) points += 2;

  return points;
}

function victoryPoints(state, seat) {
  const player = state.players[seat];
  const hiddenVpCards = player.devCards.filter((c) => c.type === "victory-point").length;
  return publicVictoryPoints(state, seat) + hiddenVpCards;
}

function checkWin(state) {
  if (state.phase === "finished") return;

  for (const player of state.players) {
    const points = victoryPoints(state, player.seat);
    player.victoryPoints = points;

    if (points >= 10) {
      state.phase = "finished";
      state.winner = player.seat;
      log(state, `${playerLabel(player.seat)} wins with ${points} victory points!`);
      return;
    }
  }
}

function playerLabel(seat) {
  return `Player ${seat + 1}`;
}

function log(state, message) {
  state.log.push(message);
  if (state.log.length > 60) state.log.shift();
}

function nextSeat(state, seat) {
  return (seat + 1) % state.players.length;
}

function distributeProduction(state, total) {
  for (const [hexId, tile] of Object.entries(state.board.hexes)) {
    if (tile.number !== total) continue;
    if (hexId === state.board.robberHexId) continue;
    if (tile.resource === "desert") continue;

    for (const vertexId of board.verticesTouchingHex(hexId)) {
      const building = state.buildings[vertexId];
      if (!building) continue;

      const amount = building.type === "city" ? 2 : 1;
      grant(state.players[building.seat].resources, tile.resource, amount);
      log(
        state,
        `${playerLabel(building.seat)} received ${amount} ${tile.resource}.`
      );
    }
  }
}

function settlementSpotValid(state, vertexId) {
  if (state.buildings[vertexId]) return false;

  for (const neighborId of board.adjacentVertices(vertexId)) {
    if (state.buildings[neighborId]) return false;
  }

  return true;
}

function connectsToOwnNetwork(state, seat, vertexId) {
  for (const edgeId of board.edgesAtVertex(vertexId)) {
    if (state.players[seat].roads.has(edgeId)) return true;
  }
  return false;
}

function roadConnects(state, seat, edgeId) {
  const [a, b] = board.edgeVertices(edgeId);

  for (const vertexId of [a, b]) {
    const building = state.buildings[vertexId];
    if (building && building.seat === seat) return true;

    for (const otherEdgeId of board.edgesAtVertex(vertexId)) {
      if (otherEdgeId === edgeId) continue;
      if (state.players[seat].roads.has(otherEdgeId)) {
        // Only counts if that vertex isn't a rival building blocking through.
        if (!building || building.seat === seat) return true;
      }
    }
  }

  return false;
}

function portsForPlayer(state, seat) {
  const owned = new Set();

  for (const vertexId of [...state.players[seat].settlements, ...state.players[seat].cities]) {
    for (const edgeId of board.edgesAtVertex(vertexId)) {
      const portType = state.board.ports[edgeId];
      if (!portType) continue;

      const [a, b] = board.edgeVertices(edgeId);
      if (a === vertexId || b === vertexId) owned.add(portType);
    }
  }

  return owned;
}

function bestRateFor(state, seat, resource) {
  const ports = portsForPlayer(state, seat);
  if (ports.has(resource)) return 2;
  if (ports.has("3:1")) return 3;
  return 4;
}

function makePlayer(seat) {
  return {
    seat,
    color: COLORS[seat],
    resources: emptyHand(),
    devCards: [],
    roads: new Set(),
    settlements: new Set(),
    cities: new Set(),
    knightsPlayed: 0,
    hasPlayedDevCardThisTurn: false,
    roadLength: 0,
    victoryPoints: 0,
  };
}

function createInitialState(seatCount, rng = Math.random) {
  const generatedBoard = board.generateBoard(rng);

  const players = Array.from({ length: seatCount }, (_, seat) => makePlayer(seat));

  // Randomize who starts (and thus the whole snake-draft order) instead of
  // always seating player 0 first -- rotate rather than fully shuffle so
  // the draft's forward/reverse fairness structure is preserved.
  const startOffset = Math.floor(rng() * seatCount);
  const forwardOrder = Array.from({ length: seatCount }, (_, i) => (i + startOffset) % seatCount);
  const setupQueue = [...forwardOrder, ...forwardOrder.slice().reverse()];

  return {
    board: generatedBoard,
    buildings: {}, // vertexId -> { seat, type: 'settlement' | 'city' }
    players,
    phase: "setup",
    setupQueue,
    setupIndex: 0,
    setupStep: "settlement",
    lastSetupSettlementVertex: null,
    currentSeat: setupQueue[0],
    turnNumber: 0,
    lastRoll: null,
    pendingRobberMove: false,
    pendingDiscards: {}, // seat -> resources still owed
    devDeck: buildDeck(rng),
    tradeOffers: [],
    nextTradeId: 1,
    freeRoadsRemaining: 0,
    longestRoad: null,
    largestArmy: null,
    winner: null,
    log: ["The settlement begins!"],
    rng,
  };
}

function startMainTurn(state) {
  state.phase = "roll";
  state.turnNumber += 1;
  state.lastRoll = null;

  for (const player of state.players) {
    player.hasPlayedDevCardThisTurn = false;
  }

  log(state, `${playerLabel(state.currentSeat)}'s turn.`);
}

function endSetupPlacement(state) {
  state.setupIndex += 1;

  if (state.setupIndex >= state.setupQueue.length) {
    state.currentSeat = state.setupQueue[0];
    startMainTurn(state);
    return;
  }

  state.currentSeat = state.setupQueue[state.setupIndex];
  state.setupStep = "settlement";
}

function handleBuildSettlement(state, seat, vertexId) {
  if (state.phase === "setup") {
    if (state.setupStep !== "settlement") fail("Place a road first.");
    if (!settlementSpotValid(state, vertexId)) fail("That spot is taken or too close to another settlement.");

    state.buildings[vertexId] = { seat, type: "settlement" };
    state.players[seat].settlements.add(vertexId);
    state.lastSetupSettlementVertex = vertexId;
    state.setupStep = "road";

    const isSecondRound = state.setupIndex >= state.players.length;
    if (isSecondRound) {
      for (const hexId of board.hexesTouchingVertex(vertexId)) {
        const tile = state.board.hexes[hexId];
        if (tile.resource === "desert") continue;
        grant(state.players[seat].resources, tile.resource, 1);
      }
    }

    log(state, `${playerLabel(seat)} placed a settlement.`);
    checkWin(state);
    return;
  }

  if (state.phase !== "main") fail("You can't build right now.");
  if (seat !== state.currentSeat) fail("It's not your turn.");
  if (!settlementSpotValid(state, vertexId)) fail("That spot is taken or too close to another settlement.");
  if (!connectsToOwnNetwork(state, seat, vertexId)) fail("A settlement must connect to your own road.");
  if (!canAfford(state.players[seat].resources, SETTLEMENT_COST)) fail("Not enough resources.");

  pay(state.players[seat].resources, SETTLEMENT_COST);
  state.buildings[vertexId] = { seat, type: "settlement" };
  state.players[seat].settlements.add(vertexId);

  log(state, `${playerLabel(seat)} built a settlement.`);
  recalcLongestRoad(state);
  checkWin(state);
}

function handleBuildCity(state, seat, vertexId) {
  if (state.phase !== "main") fail("You can't build right now.");
  if (seat !== state.currentSeat) fail("It's not your turn.");

  const building = state.buildings[vertexId];
  if (!building || building.seat !== seat || building.type !== "settlement") {
    fail("You can only upgrade your own settlement.");
  }
  if (!canAfford(state.players[seat].resources, CITY_COST)) fail("Not enough resources.");

  pay(state.players[seat].resources, CITY_COST);
  building.type = "city";
  state.players[seat].settlements.delete(vertexId);
  state.players[seat].cities.add(vertexId);

  log(state, `${playerLabel(seat)} upgraded to a city.`);
  checkWin(state);
}

function handleBuildRoad(state, seat, edgeId) {
  if (board.GRAPH.edges[edgeId] === undefined) fail("That edge doesn't exist.");
  if ([...state.players].some((p) => p.roads.has(edgeId))) fail("That road is already built.");

  if (state.phase === "setup") {
    if (state.setupStep !== "road") fail("Place a settlement first.");

    const [a, b] = board.edgeVertices(edgeId);
    if (a !== state.lastSetupSettlementVertex && b !== state.lastSetupSettlementVertex) {
      fail("Your road must connect to the settlement you just placed.");
    }

    state.players[seat].roads.add(edgeId);
    log(state, `${playerLabel(seat)} placed a road.`);
    endSetupPlacement(state);
    return;
  }

  if (state.phase !== "main") fail("You can't build right now.");
  if (seat !== state.currentSeat) fail("It's not your turn.");
  if (!roadConnects(state, seat, edgeId)) fail("A road must connect to your own network.");

  const free = state.freeRoadsRemaining > 0;
  if (!free && !canAfford(state.players[seat].resources, ROAD_COST)) fail("Not enough resources.");

  if (!free) pay(state.players[seat].resources, ROAD_COST);
  else state.freeRoadsRemaining -= 1;

  state.players[seat].roads.add(edgeId);
  log(state, `${playerLabel(seat)} built a road${free ? " (free)" : ""}.`);
  recalcLongestRoad(state);
  checkWin(state);
}

function handleRollDice(state, seat) {
  if (state.phase !== "roll") fail("You can't roll right now.");
  if (seat !== state.currentSeat) fail("It's not your turn.");

  const d1 = rollDie(state.rng);
  const d2 = rollDie(state.rng);
  const total = d1 + d2;
  state.lastRoll = { d1, d2, total };

  log(state, `${playerLabel(seat)} rolled ${d1} + ${d2} = ${total}.`);

  if (total === 7) {
    state.pendingDiscards = {};

    for (const player of state.players) {
      const count = handTotal(player.resources);
      if (count > 7) {
        state.pendingDiscards[player.seat] = Math.floor(count / 2);
      }
    }

    state.phase = Object.keys(state.pendingDiscards).length > 0 ? "discard" : "moveRobber";
    state.pendingRobberMove = true;

    if (state.phase === "moveRobber") {
      log(state, `${playerLabel(seat)} must move the robber.`);
    } else {
      log(state, "Players with more than 7 cards must discard half.");
    }

    return;
  }

  distributeProduction(state, total);
  state.phase = "main";
}

function handleDiscard(state, seat, resources) {
  if (state.phase !== "discard") fail("Nothing to discard right now.");

  const required = state.pendingDiscards[seat];
  if (required === undefined) fail("You don't need to discard.");

  const totalGiven = RESOURCES.reduce((sum, r) => sum + (resources[r] || 0), 0);
  if (totalGiven !== required) fail(`You must discard exactly ${required} cards.`);

  const hand = state.players[seat].resources;
  for (const resource of RESOURCES) {
    const qty = resources[resource] || 0;
    if (qty > hand[resource]) fail("You don't have that many cards.");
  }

  for (const resource of RESOURCES) {
    hand[resource] -= resources[resource] || 0;
  }

  delete state.pendingDiscards[seat];
  log(state, `${playerLabel(seat)} discarded ${required} cards.`);

  if (Object.keys(state.pendingDiscards).length === 0) {
    state.phase = "moveRobber";
    log(state, `${playerLabel(state.currentSeat)} must move the robber.`);
  }
}

function stealFrom(state, thief, victimSeat) {
  const victimHand = state.players[victimSeat].resources;
  const pool = [];

  for (const resource of RESOURCES) {
    for (let i = 0; i < victimHand[resource]; i++) pool.push(resource);
  }

  if (pool.length === 0) return;

  const pick = pool[Math.floor(state.rng() * pool.length)];
  victimHand[pick] -= 1;
  grant(state.players[thief].resources, pick, 1);
  log(state, `${playerLabel(thief)} stole a card from ${playerLabel(victimSeat)}.`);
}

function handleMoveRobber(state, seat, hexId, targetSeat) {
  if (!state.pendingRobberMove) fail("You don't need to move the robber right now.");
  if (seat !== state.currentSeat) fail("Only the active player moves the robber.");
  if (!state.board.hexes[hexId]) fail("That hex doesn't exist.");
  if (hexId === state.board.robberHexId) fail("The robber must move to a different hex.");

  state.board.robberHexId = hexId;
  state.pendingRobberMove = false;

  const eligibleSeats = new Set();
  for (const vertexId of board.verticesTouchingHex(hexId)) {
    const building = state.buildings[vertexId];
    if (building && building.seat !== seat) eligibleSeats.add(building.seat);
  }

  log(state, `${playerLabel(seat)} moved the robber.`);

  if (targetSeat !== undefined && targetSeat !== null) {
    if (!eligibleSeats.has(targetSeat)) fail("You can't steal from that player.");
    stealFrom(state, seat, targetSeat);
  }

  state.phase = "main";
}

function handleBuyDevCard(state, seat) {
  if (state.phase !== "main") fail("You can't buy a card right now.");
  if (seat !== state.currentSeat) fail("It's not your turn.");
  if (state.devDeck.length === 0) fail("No development cards left.");
  if (!canAfford(state.players[seat].resources, DEV_CARD_COST)) fail("Not enough resources.");

  pay(state.players[seat].resources, DEV_CARD_COST);
  const type = state.devDeck.pop();
  state.players[seat].devCards.push({
    type,
    boughtOnTurn: state.turnNumber,
    played: false,
  });

  log(state, `${playerLabel(seat)} bought a development card.`);
  checkWin(state);
}

function findPlayableCard(state, seat, cardType) {
  const player = state.players[seat];
  return player.devCards.find(
    (card) =>
      card.type === cardType &&
      !card.played &&
      card.boughtOnTurn !== state.turnNumber
  );
}

function handlePlayDevCard(state, seat, cardType, extra = {}) {
  if (seat !== state.currentSeat) fail("It's not your turn.");
  if (state.phase !== "main" && state.phase !== "roll") fail("You can't play a card right now.");
  if (cardType === "victory-point") fail("Victory point cards can't be played.");
  if (state.players[seat].hasPlayedDevCardThisTurn) fail("You already played a development card this turn.");

  const card = findPlayableCard(state, seat, cardType);
  if (!card) fail("You don't have that card available.");

  card.played = true;
  state.players[seat].hasPlayedDevCardThisTurn = true;

  if (cardType === "knight") {
    state.players[seat].knightsPlayed += 1;
    state.pendingRobberMove = true;
    state.phase = "moveRobber";
    recalcLargestArmy(state);
    log(state, `${playerLabel(seat)} played a Knight.`);
  } else if (cardType === "road-building") {
    state.freeRoadsRemaining = 2;
    log(state, `${playerLabel(seat)} played Road Building.`);
  } else if (cardType === "year-of-plenty") {
    const picks = extra.resources || [];
    if (picks.length !== 2) fail("Choose exactly 2 resources.");
    for (const resource of picks) {
      if (!RESOURCES.includes(resource)) fail("Invalid resource.");
      grant(state.players[seat].resources, resource, 1);
    }
    log(state, `${playerLabel(seat)} played Year of Plenty.`);
  } else if (cardType === "monopoly") {
    const resource = extra.resource;
    if (!RESOURCES.includes(resource)) fail("Invalid resource.");
    let total = 0;
    for (const player of state.players) {
      if (player.seat === seat) continue;
      total += player.resources[resource];
      state.players[seat].resources[resource] += player.resources[resource];
      player.resources[resource] = 0;
    }
    log(state, `${playerLabel(seat)} played Monopoly on ${resource} and took ${total}.`);
  } else {
    fail("Unknown card type.");
  }

  checkWin(state);
}

function handleProposeTrade(state, seat, toSeat, give, want) {
  if (state.phase !== "main") fail("You can't trade right now.");
  if (seat !== state.currentSeat) fail("Only the active player can propose a trade.");
  if (toSeat === seat) fail("Pick another player to trade with.");
  if (!state.players[toSeat]) fail("That player doesn't exist.");
  if (!canAfford(state.players[seat].resources, give)) fail("You don't have those resources.");

  const trade = {
    id: state.nextTradeId++,
    fromSeat: seat,
    toSeat,
    give,
    want,
    status: "pending",
  };

  state.tradeOffers.push(trade);
  log(state, `${playerLabel(seat)} offered a trade to ${playerLabel(toSeat)}.`);
}

function handleRespondTrade(state, seat, tradeId, accept) {
  const trade = state.tradeOffers.find((t) => t.id === tradeId && t.status === "pending");
  if (!trade) fail("That trade is no longer available.");
  if (trade.toSeat !== seat) fail("That trade isn't for you.");

  if (!accept) {
    trade.status = "rejected";
    state.tradeOffers = state.tradeOffers.filter((t) => t.id !== tradeId);
    log(state, `${playerLabel(seat)} rejected a trade.`);
    return;
  }

  const proposer = state.players[trade.fromSeat];
  const responder = state.players[seat];

  if (!canAfford(proposer.resources, trade.give) || !canAfford(responder.resources, trade.want)) {
    state.tradeOffers = state.tradeOffers.filter((t) => t.id !== tradeId);
    fail("Trade failed — resources changed.");
  }

  pay(proposer.resources, trade.give);
  pay(responder.resources, trade.want);

  for (const [resource, qty] of Object.entries(trade.give)) grant(responder.resources, resource, qty);
  for (const [resource, qty] of Object.entries(trade.want)) grant(proposer.resources, resource, qty);

  state.tradeOffers = state.tradeOffers.filter((t) => t.id !== tradeId);
  log(state, `${playerLabel(seat)} accepted a trade with ${playerLabel(trade.fromSeat)}.`);
}

function handleCancelTrade(state, seat, tradeId) {
  const trade = state.tradeOffers.find((t) => t.id === tradeId);
  if (!trade) fail("That trade doesn't exist.");
  if (trade.fromSeat !== seat) fail("You can only cancel your own trade.");

  state.tradeOffers = state.tradeOffers.filter((t) => t.id !== tradeId);
  log(state, `${playerLabel(seat)} cancelled a trade offer.`);
}

function handleBankTrade(state, seat, giveResource, wantResource, wantQty = 1) {
  if (state.phase !== "main") fail("You can't trade right now.");
  if (seat !== state.currentSeat) fail("It's not your turn.");
  if (giveResource === wantResource) fail("Pick two different resources.");

  const rate = bestRateFor(state, seat, giveResource);
  const giveQty = rate * wantQty;

  if (state.players[seat].resources[giveResource] < giveQty) fail("Not enough resources.");

  state.players[seat].resources[giveResource] -= giveQty;
  grant(state.players[seat].resources, wantResource, wantQty);

  log(
    state,
    `${playerLabel(seat)} traded ${giveQty} ${giveResource} for ${wantQty} ${wantResource} with the bank.`
  );
}

function handleEndTurn(state, seat) {
  if (state.phase !== "main") fail("You can't end your turn right now.");
  if (seat !== state.currentSeat) fail("It's not your turn.");

  state.tradeOffers = state.tradeOffers.filter((t) => t.fromSeat !== seat);
  state.currentSeat = nextSeat(state, seat);
  startMainTurn(state);
}

const ACTION_HANDLERS = {
  "build-settlement": (state, seat, payload) => handleBuildSettlement(state, seat, payload.vertexId),
  "build-city": (state, seat, payload) => handleBuildCity(state, seat, payload.vertexId),
  "build-road": (state, seat, payload) => handleBuildRoad(state, seat, payload.edgeId),
  "roll-dice": (state, seat) => handleRollDice(state, seat),
  "discard": (state, seat, payload) => handleDiscard(state, seat, payload.resources || {}),
  "move-robber": (state, seat, payload) => handleMoveRobber(state, seat, payload.hexId, payload.targetSeat),
  "buy-dev-card": (state, seat) => handleBuyDevCard(state, seat),
  "play-dev-card": (state, seat, payload) => handlePlayDevCard(state, seat, payload.cardType, payload),
  "propose-trade": (state, seat, payload) =>
    handleProposeTrade(state, seat, payload.toSeat, payload.give || {}, payload.want || {}),
  "respond-trade": (state, seat, payload) => handleRespondTrade(state, seat, payload.tradeId, payload.accept),
  "cancel-trade": (state, seat, payload) => handleCancelTrade(state, seat, payload.tradeId),
  "bank-trade": (state, seat, payload) =>
    handleBankTrade(state, seat, payload.give, payload.want, payload.qty || 1),
  "end-turn": (state, seat) => handleEndTurn(state, seat),
};

function applyAction(state, seat, action, payload) {
  if (state.phase === "finished") fail("The game is already over.");

  const handler = ACTION_HANDLERS[action];
  if (!handler) fail(`Unknown action: ${action}`);

  handler(state, seat, payload || {});

  return state;
}

function viewFor(state, seat) {
  const players = state.players.map((player) => {
    const isSelf = player.seat === seat;

    return {
      seat: player.seat,
      color: player.color,
      roads: [...player.roads],
      settlements: [...player.settlements],
      cities: [...player.cities],
      knightsPlayed: player.knightsPlayed,
      roadLength: player.roadLength,
      victoryPoints:
        isSelf || state.phase === "finished"
          ? victoryPoints(state, player.seat)
          : publicVictoryPoints(state, player.seat),
      resourceCount: handTotal(player.resources),
      devCardCount: player.devCards.filter((c) => !c.played).length,
      resources: isSelf ? player.resources : undefined,
      devCards: isSelf
        ? player.devCards
        : player.devCards.filter((c) => c.played).map((c) => ({ type: c.type, played: true })),
    };
  });

  return {
    board: {
      hexes: state.board.hexes,
      robberHexId: state.board.robberHexId,
      ports: state.board.ports,
    },
    graph: {
      vertices: Object.fromEntries(
        Object.entries(board.GRAPH.vertices).map(([id, v]) => [id, { id: v.id, x: v.x, y: v.y }])
      ),
      edges: Object.fromEntries(
        Object.entries(board.GRAPH.edges).map(([id, e]) => [id, { id: e.id, vertexIds: e.vertexIds }])
      ),
      hexes: Object.fromEntries(
        Object.entries(board.GRAPH.hexes).map(([id, h]) => [
          id,
          { id: h.id, center: h.center, cornerVertexIds: h.cornerVertexIds },
        ])
      ),
    },
    buildings: state.buildings,
    players,
    phase: state.phase,
    setupStep: state.setupStep,
    currentSeat: state.currentSeat,
    turnNumber: state.turnNumber,
    lastRoll: state.lastRoll,
    pendingRobberMove: state.pendingRobberMove,
    pendingDiscards: state.pendingDiscards,
    myPendingDiscard: state.pendingDiscards[seat],
    devDeckCount: state.devDeck.length,
    tradeOffers: state.tradeOffers,
    freeRoadsRemaining: state.freeRoadsRemaining,
    longestRoad: state.longestRoad,
    largestArmy: state.largestArmy,
    winner: state.winner,
    log: state.log,
    mySeat: seat,
    myResources: state.players[seat].resources,
    myDevCards: state.players[seat].devCards,
    finished: state.phase === "finished" ? { winner: state.winner } : null,
  };
}

module.exports = {
  requiredPlayers: undefined,
  minPlayers: 3,
  maxPlayers: 5,
  createInitialState: (seatCount) => createInitialState(seatCount),
  applyAction,
  viewFor,
  // Exposed for testing.
  _internals: { longestRoadForPlayer, recalcLongestRoad, recalcLargestArmy, victoryPoints },
};
