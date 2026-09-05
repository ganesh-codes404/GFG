import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import "./Catan.css";

const RESOURCES = ["cattle", "cement", "timber", "grain", "steel"];

const RESOURCE_LABEL = {
  cattle: "Cattle",
  cement: "Cement",
  timber: "Timber",
  grain: "Grain",
  steel: "Steel",
};

const RESOURCE_ICON = {
  cattle: "🐄",
  cement: "🧱",
  timber: "🪵",
  grain: "🌾",
  steel: "⚙️",
};

const TERRAIN_COLOR = {
  cattle: "#9fd88c",
  cement: "#c9c2b4",
  timber: "#3f7a4f",
  grain: "#e8c94a",
  steel: "#8b95a1",
  desert: "#e8d9ae",
};

const ROAD_COST = { cement: 1, timber: 1 };
const SETTLEMENT_COST = { timber: 1, cement: 1, grain: 1, cattle: 1 };
const CITY_COST = { steel: 3, grain: 2 };
const DEV_CARD_COST = { steel: 1, grain: 1, cattle: 1 };

const DEV_CARD_LABEL = {
  knight: "Knight",
  "victory-point": "Victory Point",
  "road-building": "Road Building",
  "year-of-plenty": "Year of Plenty",
  monopoly: "Monopoly",
};

function costEntries(cost) {
  return Object.entries(cost);
}

function canAfford(resources, cost) {
  if (!resources) return false;
  return Object.entries(cost).every(([resource, qty]) => resources[resource] >= qty);
}

export default function Catan() {
  const location = useLocation();
  const navigate = useNavigate();
  const code = location.state?.code;

  if (!code) {
    return (
      <div className="catan-screen catan-gate">
        <div className="catan-popup">
          <h2>MULTIPLAYER ONLY</h2>
          <p>
            Catan needs a real room with 3-5 players. Head back and create
            one, then start Catan from the lobby.
          </p>
          <button className="catan-button" onClick={() => navigate("/create-room")}>
            CREATE A ROOM
          </button>
        </div>
      </div>
    );
  }

  return <NetworkedCatan code={code} />;
}

function NetworkedCatan({ code }) {
  const [seat, setSeat] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    socket.emit("join-game", { code }, (response) => {
      if (!response.success) {
        setError(response.error);
        return;
      }
      setSeat(response.seat);
      setState(response.state);
    });

    const handleState = (next) => setState(next);
    socket.on("game-state", handleState);
    return () => socket.off("game-state", handleState);
  }, [code]);

  const dispatch = (action, payload) => {
    return new Promise((resolve) => {
      socket.emit("game-action", { code, action, payload }, (response) => {
        if (!response?.success) {
          setToast(response?.error || "Action failed.");
        }
        resolve(response);
      });
    });
  };

  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (error) {
    return (
      <div className="catan-screen catan-gate">
        <div className="catan-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="catan-screen catan-gate">
        <div className="catan-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  return (
    <CatanGame
      state={state}
      mySeat={seat}
      dispatch={(action, payload) => dispatch(action, payload)}
      toast={toast}
    />
  );
}

/* ---------------- board geometry helpers ---------------- */

function hexPoints(hex, vertices) {
  return hex.cornerVertexIds
    .map((id) => vertices[id])
    .map((v) => `${v.x},${v.y}`)
    .join(" ");
}

function computeViewBox(vertices) {
  const xs = Object.values(vertices).map((v) => v.x);
  const ys = Object.values(vertices).map((v) => v.y);
  const minX = Math.min(...xs) - 1.6;
  const maxX = Math.max(...xs) + 1.6;
  const minY = Math.min(...ys) - 1.6;
  const maxY = Math.max(...ys) + 1.6;
  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
}

function edgeMidpoint(edge, vertices) {
  const [a, b] = edge.vertexIds.map((id) => vertices[id]);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function portOutwardPoint(mid, scale = 1.35) {
  return { x: mid.x * scale, y: mid.y * scale };
}

/* ---------------- main game screen ---------------- */

function CatanGame({ state, mySeat, dispatch, toast }) {
  const [placementMode, setPlacementMode] = useState(null); // 'road' | 'settlement' | 'city' | null
  const [showTrade, setShowTrade] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [yearOfPlentyPicks, setYearOfPlentyPicks] = useState([]);
  const [monopolyPick, setMonopolyPick] = useState(null);
  const [pendingCard, setPendingCard] = useState(null); // 'year-of-plenty' | 'monopoly'
  const [discardPicks, setDiscardPicks] = useState({});
  const [rollAnim, setRollAnim] = useState(false);

  const isMyTurn = state.currentSeat === mySeat;
  const me = state.players.find((p) => p.seat === mySeat);
  const myResources = state.myResources || {};
  const myDevCards = state.myDevCards || [];

  const inSetup = state.phase === "setup";
  const isSetupSettlement = inSetup && state.setupStep === "settlement";

  useEffect(() => {
    if (!inSetup) return;
    setPlacementMode(isSetupSettlement ? "settlement" : "road");
  }, [inSetup, isSetupSettlement]);

  useEffect(() => {
    if (state.phase !== "main") setPlacementMode(null);
  }, [state.phase]);

  const vertices = state.graph.vertices;
  const edges = state.graph.edges;
  const hexes = state.graph.hexes;

  const viewBox = useMemo(() => computeViewBox(vertices), [vertices]);

  const handleRoll = async () => {
    setRollAnim(true);
    await dispatch("roll-dice", {});
    setTimeout(() => setRollAnim(false), 600);
  };

  const handleVertexClick = async (vertexId) => {
    if (!isMyTurn) return;

    if (placementMode === "settlement") {
      const resp = await dispatch("build-settlement", { vertexId });
      if (resp?.success && !inSetup) setPlacementMode(null);
      return;
    }

    if (placementMode === "city") {
      const resp = await dispatch("build-city", { vertexId });
      if (resp?.success) setPlacementMode(null);
    }
  };

  const handleEdgeClick = async (edgeId) => {
    if (!isMyTurn) return;
    if (placementMode !== "road") return;

    const resp = await dispatch("build-road", { edgeId });
    if (resp?.success && !inSetup) setPlacementMode(null);
  };

  const handleHexClick = async (hexId) => {
    if (!state.pendingRobberMove || !isMyTurn) return;
    if (hexId === state.board.robberHexId) return;

    const eligible = eligibleStealTargets(state, hexId);

    if (eligible.length === 0) {
      await dispatch("move-robber", { hexId });
      return;
    }

    setRobberPrompt({ hexId, eligible });
  };

  const [robberPrompt, setRobberPrompt] = useState(null);

  const confirmRobber = async (targetSeat) => {
    if (!robberPrompt) return;
    await dispatch("move-robber", { hexId: robberPrompt.hexId, targetSeat });
    setRobberPrompt(null);
  };

  const myDiscardRequired = state.myPendingDiscard;
  const discardTotal = RESOURCES.reduce((sum, r) => sum + (discardPicks[r] || 0), 0);

  const submitDiscard = async () => {
    await dispatch("discard", { resources: discardPicks });
    setDiscardPicks({});
  };

  const playDevCard = async (cardType) => {
    if (cardType === "year-of-plenty" || cardType === "monopoly") {
      setPendingCard(cardType);
      return;
    }
    await dispatch("play-dev-card", { cardType });
  };

  const confirmYearOfPlenty = async () => {
    if (yearOfPlentyPicks.length !== 2) return;
    await dispatch("play-dev-card", { cardType: "year-of-plenty", resources: yearOfPlentyPicks });
    setPendingCard(null);
    setYearOfPlentyPicks([]);
  };

  const confirmMonopoly = async () => {
    if (!monopolyPick) return;
    await dispatch("play-dev-card", { cardType: "monopoly", resource: monopolyPick });
    setPendingCard(null);
    setMonopolyPick(null);
  };

  if (state.phase === "finished") {
    return <VictoryScreen state={state} mySeat={mySeat} />;
  }

  return (
    <div className="catan-screen">
      <header className="catan-header">
        <h1 className="catan-logo">CATAN</h1>

        <div className="catan-header-right">
          <div className="catan-turn-indicator">
            <span>TURN</span>
            <strong>{state.players.find((p) => p.seat === state.currentSeat)?.seat + 1}</strong>
          </div>

          <button className="catan-info-button" onClick={() => setShowRules(true)} title="Rules">
            ⓘ
          </button>
        </div>
      </header>

      <main className="catan-layout">
        <aside className="catan-players-col">
          <div className="catan-section-title">PLAYERS</div>

          {state.players.map((player) => (
            <div
              key={player.seat}
              className={`catan-player-card ${player.seat === state.currentSeat ? "active" : ""} ${
                player.seat === mySeat ? "self" : ""
              }`}
              style={{ "--player-color": player.color }}
            >
              <div className="catan-player-name">
                Player {player.seat + 1}
                {player.seat === mySeat ? " (you)" : ""}
              </div>

              <div className="catan-player-stats">
                <span>VP {player.victoryPoints}</span>
                <span>🃏 {player.resourceCount}</span>
                <span>🎴 {player.devCardCount}</span>
              </div>

              <div className="catan-player-stats">
                <span>🛣 {player.roads.length}</span>
                <span>🏠 {player.settlements.length}</span>
                <span>🏛 {player.cities.length}</span>
              </div>

              {state.longestRoad === player.seat && (
                <div className="catan-badge">LONGEST ROAD</div>
              )}
              {state.largestArmy === player.seat && (
                <div className="catan-badge army">LARGEST ARMY</div>
              )}
            </div>
          ))}

          <div className="catan-section-title">LOG</div>
          <div className="catan-log">
            {[...state.log].reverse().map((line, i) => (
              <div key={i} className="catan-log-line">
                {line}
              </div>
            ))}
          </div>
        </aside>

        <section className="catan-board-col">
          <div className="catan-board-wrap">
            <svg viewBox={viewBox} className="catan-board-svg">
              {Object.values(hexes).map((hex) => {
                const tile = state.board.hexes[hex.id];
                const isRobber = hex.id === state.board.robberHexId;

                return (
                  <g key={hex.id}>
                    <polygon
                      points={hexPoints(hex, vertices)}
                      fill={TERRAIN_COLOR[tile.resource]}
                      stroke="#17101f"
                      strokeWidth="0.04"
                      className={state.pendingRobberMove && isMyTurn ? "catan-hex-clickable" : ""}
                      onClick={() => handleHexClick(hex.id)}
                    />
                    {tile.number && (
                      <g>
                        <circle
                          cx={hex.center.x}
                          cy={hex.center.y}
                          r="0.3"
                          fill="#fdf3d9"
                          stroke="#17101f"
                          strokeWidth="0.03"
                        />
                        <text
                          x={hex.center.x}
                          y={hex.center.y + 0.12}
                          textAnchor="middle"
                          fontSize="0.32"
                          fontWeight="700"
                          fill={tile.number === 6 || tile.number === 8 ? "#c0392b" : "#3a2748"}
                        >
                          {tile.number}
                        </text>
                      </g>
                    )}
                    {isRobber && (
                      <circle
                        cx={hex.center.x}
                        cy={hex.center.y - 0.05}
                        r="0.22"
                        fill="#1a1a1a"
                        stroke="#fff"
                        strokeWidth="0.02"
                      />
                    )}
                  </g>
                );
              })}

              {Object.entries(state.board.ports).map(([edgeId, portType]) => {
                const edge = edges[edgeId];
                if (!edge) return null;
                const mid = edgeMidpoint(edge, vertices);
                const pt = portOutwardPoint(mid);

                return (
                  <g key={edgeId}>
                    <line
                      x1={mid.x}
                      y1={mid.y}
                      x2={pt.x}
                      y2={pt.y}
                      stroke="#3a5a8c"
                      strokeWidth="0.05"
                      strokeDasharray="0.08 0.06"
                    />
                    <circle cx={pt.x} cy={pt.y} r="0.28" fill="#eaf3ff" stroke="#3a5a8c" strokeWidth="0.03" />
                    <text x={pt.x} y={pt.y + 0.1} textAnchor="middle" fontSize="0.2" fill="#17101f">
                      {portType === "3:1" ? "3:1" : RESOURCE_ICON[portType]}
                    </text>
                  </g>
                );
              })}

              {Object.values(edges).map((edge) => {
                const builder = state.players.find((p) => p.roads.includes(edge.id));
                const [a, b] = edge.vertexIds.map((id) => vertices[id]);
                const clickable = isMyTurn && placementMode === "road" && !builder;

                return (
                  <line
                    key={edge.id}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={builder ? builder.color : clickable ? "#ffe27a" : "transparent"}
                    strokeWidth={builder ? 0.09 : 0.22}
                    strokeLinecap="round"
                    className={clickable ? "catan-edge-clickable" : ""}
                    onClick={() => handleEdgeClick(edge.id)}
                  />
                );
              })}

              {Object.values(vertices).map((vertex) => {
                const building = state.buildings[vertex.id];
                const owner = building && state.players.find((p) => p.seat === building.seat);
                const clickableSettlement = isMyTurn && placementMode === "settlement" && !building;
                const clickableCity =
                  isMyTurn && placementMode === "city" && building?.seat === mySeat && building.type === "settlement";
                const clickable = clickableSettlement || clickableCity;

                return (
                  <g key={vertex.id} onClick={() => handleVertexClick(vertex.id)}>
                    <circle
                      cx={vertex.x}
                      cy={vertex.y}
                      r={clickable ? 0.16 : building ? 0.15 : 0.07}
                      fill={owner ? owner.color : clickable ? "#ffe27a" : "#2a1c3a"}
                      stroke="#17101f"
                      strokeWidth="0.025"
                      className={clickable ? "catan-vertex-clickable" : ""}
                    />
                    {building?.type === "city" && (
                      <rect
                        x={vertex.x - 0.06}
                        y={vertex.y - 0.06}
                        width="0.12"
                        height="0.12"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="0.02"
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {inSetup && (
            <div className="catan-setup-banner">
              {isMyTurn
                ? `Place your ${isSetupSettlement ? "settlement" : "road"}.`
                : `Waiting for Player ${state.currentSeat + 1}...`}
            </div>
          )}

          {state.lastRoll && (
            <div className={`catan-dice-display ${rollAnim ? "rolling" : ""}`}>
              🎲 {state.lastRoll.d1} + 🎲 {state.lastRoll.d2} = {state.lastRoll.total}
            </div>
          )}
        </section>

        <aside className="catan-side-col">
          <div className="catan-section-title">MY RESOURCES</div>
          <div className="catan-resource-grid">
            {RESOURCES.map((resource) => (
              <div key={resource} className="catan-resource-tile">
                <span>{RESOURCE_ICON[resource]}</span>
                <strong>{myResources[resource] ?? 0}</strong>
                <small>{RESOURCE_LABEL[resource]}</small>
              </div>
            ))}
          </div>

          <div className="catan-section-title">DEV CARDS</div>
          <div className="catan-devcard-list">
            {myDevCards.length === 0 && <div className="catan-empty">None yet.</div>}
            {myDevCards.map((card, i) => {
              const playable =
                isMyTurn &&
                !card.played &&
                card.boughtOnTurn !== state.turnNumber &&
                !me?.hasPlayedDevCardThisTurn &&
                (state.phase === "main" || state.phase === "roll") &&
                card.type !== "victory-point";

              return (
                <button
                  key={i}
                  className={`catan-devcard ${card.played ? "played" : ""}`}
                  disabled={!playable}
                  onClick={() => playDevCard(card.type)}
                >
                  {DEV_CARD_LABEL[card.type]}
                  {card.played && " (played)"}
                </button>
              );
            })}
          </div>

          {state.tradeOffers.filter((t) => t.toSeat === mySeat || t.fromSeat === mySeat).length > 0 && (
            <>
              <div className="catan-section-title">
                TRADE REQUESTS ({state.tradeOffers.filter((t) => t.toSeat === mySeat).length})
              </div>
              <div className="catan-trade-list">
                {state.tradeOffers
                  .filter((t) => t.toSeat === mySeat || t.fromSeat === mySeat)
                  .map((trade) => (
                    <div key={trade.id} className="catan-trade-offer">
                      <div>
                        Player {trade.fromSeat + 1} → Player {trade.toSeat + 1}
                      </div>
                      <div className="catan-trade-line">
                        Gives: {costEntries(trade.give).map(([r, q]) => `${q} ${RESOURCE_LABEL[r]}`).join(", ")}
                      </div>
                      <div className="catan-trade-line">
                        Wants: {costEntries(trade.want).map(([r, q]) => `${q} ${RESOURCE_LABEL[r]}`).join(", ")}
                      </div>

                      {trade.toSeat === mySeat && (
                        <div className="catan-trade-actions">
                          <button onClick={() => dispatch("respond-trade", { tradeId: trade.id, accept: true })}>
                            ACCEPT
                          </button>
                          <button onClick={() => dispatch("respond-trade", { tradeId: trade.id, accept: false })}>
                            REJECT
                          </button>
                        </div>
                      )}

                      {trade.fromSeat === mySeat && (
                        <div className="catan-trade-actions">
                          <button onClick={() => dispatch("cancel-trade", { tradeId: trade.id })}>
                            CANCEL
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </>
          )}
        </aside>
      </main>

      <footer className="catan-action-bar">
        <button
          className="catan-action-button roll"
          disabled={!isMyTurn || state.phase !== "roll"}
          onClick={handleRoll}
        >
          🎲 ROLL DICE
        </button>

        <BuildButton
          label="ROAD"
          cost={ROAD_COST}
          resources={myResources}
          disabled={!isMyTurn || state.phase !== "main" || state.freeRoadsRemaining === 0 && !canAfford(myResources, ROAD_COST)}
          active={placementMode === "road" && !inSetup}
          onClick={() => setPlacementMode(placementMode === "road" ? null : "road")}
        />

        <BuildButton
          label="SETTLEMENT"
          cost={SETTLEMENT_COST}
          resources={myResources}
          disabled={!isMyTurn || state.phase !== "main" || !canAfford(myResources, SETTLEMENT_COST)}
          active={placementMode === "settlement" && !inSetup}
          onClick={() => setPlacementMode(placementMode === "settlement" ? null : "settlement")}
        />

        <BuildButton
          label="CITY"
          cost={CITY_COST}
          resources={myResources}
          disabled={!isMyTurn || state.phase !== "main" || !canAfford(myResources, CITY_COST)}
          active={placementMode === "city"}
          onClick={() => setPlacementMode(placementMode === "city" ? null : "city")}
        />

        <BuildButton
          label="DEV CARD"
          cost={DEV_CARD_COST}
          resources={myResources}
          disabled={!isMyTurn || state.phase !== "main" || !canAfford(myResources, DEV_CARD_COST) || state.devDeckCount === 0}
          onClick={() => dispatch("buy-dev-card", {})}
          actionLabel="BUY"
        />

        <button
          className="catan-action-button trade"
          disabled={!isMyTurn || state.phase !== "main"}
          onClick={() => setShowTrade(true)}
        >
          🤝 TRADE
        </button>

        <button
          className="catan-action-button end-turn"
          disabled={!isMyTurn || state.phase !== "main"}
          onClick={() => dispatch("end-turn", {})}
        >
          END TURN
        </button>
      </footer>

      {toast && <div className="catan-toast">{toast}</div>}

      {myDiscardRequired !== undefined && (
        <div className="catan-overlay">
          <div className="catan-popup">
            <h2>DISCARD {myDiscardRequired} CARDS</h2>
            <p>You rolled a 7 with more than 7 cards. Choose what to discard.</p>

            <div className="catan-resource-grid">
              {RESOURCES.map((resource) => (
                <ResourceStepper
                  key={resource}
                  resource={resource}
                  value={discardPicks[resource] || 0}
                  max={myResources[resource] || 0}
                  onChange={(v) => setDiscardPicks((prev) => ({ ...prev, [resource]: v }))}
                />
              ))}
            </div>

            <p className="catan-discard-count">
              {discardTotal} / {myDiscardRequired} selected
            </p>

            <button
              className="catan-button"
              disabled={discardTotal !== myDiscardRequired}
              onClick={submitDiscard}
            >
              CONFIRM DISCARD
            </button>
          </div>
        </div>
      )}

      {robberPrompt && (
        <div className="catan-overlay">
          <div className="catan-popup">
            <h2>STEAL A CARD?</h2>
            <p>Choose a player to steal from, or skip.</p>

            <div className="catan-steal-grid">
              {robberPrompt.eligible.map((seat) => (
                <button key={seat} className="catan-button" onClick={() => confirmRobber(seat)}>
                  Player {seat + 1}
                </button>
              ))}
            </div>

            <button className="catan-button secondary" onClick={() => confirmRobber(undefined)}>
              DON'T STEAL
            </button>
          </div>
        </div>
      )}

      {pendingCard === "year-of-plenty" && (
        <div className="catan-overlay">
          <div className="catan-popup">
            <h2>YEAR OF PLENTY</h2>
            <p>Pick 2 resources to take from the bank.</p>

            <div className="catan-resource-pick-grid">
              {RESOURCES.map((resource) => (
                <button
                  key={resource}
                  className={`catan-pick-tile ${yearOfPlentyPicks.includes(resource) ? "selected" : ""}`}
                  onClick={() =>
                    setYearOfPlentyPicks((prev) =>
                      prev.length < 2 ? [...prev, resource] : prev
                    )
                  }
                >
                  {RESOURCE_ICON[resource]} {RESOURCE_LABEL[resource]}
                </button>
              ))}
            </div>
            <p>{yearOfPlentyPicks.length} / 2 selected</p>

            <div className="catan-trade-actions">
              <button
                className="catan-button"
                disabled={yearOfPlentyPicks.length !== 2}
                onClick={confirmYearOfPlenty}
              >
                CONFIRM
              </button>
              <button
                className="catan-button secondary"
                onClick={() => {
                  setPendingCard(null);
                  setYearOfPlentyPicks([]);
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingCard === "monopoly" && (
        <div className="catan-overlay">
          <div className="catan-popup">
            <h2>MONOPOLY</h2>
            <p>Pick a resource -- every opponent hands over all of it.</p>

            <div className="catan-resource-pick-grid">
              {RESOURCES.map((resource) => (
                <button
                  key={resource}
                  className={`catan-pick-tile ${monopolyPick === resource ? "selected" : ""}`}
                  onClick={() => setMonopolyPick(resource)}
                >
                  {RESOURCE_ICON[resource]} {RESOURCE_LABEL[resource]}
                </button>
              ))}
            </div>

            <div className="catan-trade-actions">
              <button className="catan-button" disabled={!monopolyPick} onClick={confirmMonopoly}>
                CONFIRM
              </button>
              <button
                className="catan-button secondary"
                onClick={() => {
                  setPendingCard(null);
                  setMonopolyPick(null);
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {showTrade && (
        <TradeModal
          state={state}
          mySeat={mySeat}
          myResources={myResources}
          onClose={() => setShowTrade(false)}
          dispatch={dispatch}
        />
      )}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

function eligibleStealTargets(state, hexId) {
  const hex = state.graph.hexes[hexId];
  const seats = new Set();

  for (const vertexId of hex.cornerVertexIds) {
    const building = state.buildings[vertexId];
    if (building && building.seat !== state.currentSeat) {
      const owner = state.players.find((p) => p.seat === building.seat);
      if (owner && owner.resourceCount > 0) seats.add(building.seat);
    }
  }

  return [...seats];
}

function BuildButton({ label, cost, resources, disabled, active, onClick, actionLabel = "BUILD" }) {
  return (
    <button
      className={`catan-action-button build ${active ? "active" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="catan-build-label">{label}</span>
      <span className="catan-build-cost">
        {costEntries(cost).map(([resource, qty]) => (
          <span key={resource} className={resources[resource] < qty ? "short" : ""}>
            {qty}
            {RESOURCE_ICON[resource]}
          </span>
        ))}
      </span>
      <span className="catan-build-action-label">{active ? "CANCEL" : actionLabel}</span>
    </button>
  );
}

function ResourceStepper({ resource, value, max, onChange }) {
  return (
    <div className="catan-stepper">
      <span>
        {RESOURCE_ICON[resource]} {RESOURCE_LABEL[resource]}
      </span>
      <div className="catan-stepper-controls">
        <button onClick={() => onChange(Math.max(0, value - 1))}>-</button>
        <strong>{value}</strong>
        <button onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  );
}

function TradeModal({ state, mySeat, myResources, onClose, dispatch }) {
  const [tab, setTab] = useState("players");
  const [toSeat, setToSeat] = useState(null);
  const [give, setGive] = useState({});
  const [want, setWant] = useState({});

  const [bankGive, setBankGive] = useState(RESOURCES[0]);
  const [bankWant, setBankWant] = useState(RESOURCES[1]);

  const propose = async () => {
    if (toSeat === null) return;
    const resp = await dispatch("propose-trade", { toSeat, give, want });
    if (resp?.success) onClose();
  };

  const bankTrade = async () => {
    const resp = await dispatch("bank-trade", { give: bankGive, want: bankWant, qty: 1 });
    if (resp?.success) onClose();
  };

  return (
    <div className="catan-overlay">
      <div className="catan-popup catan-trade-modal">
        <h2>TRADE</h2>

        <div className="catan-tabs">
          <button className={tab === "players" ? "active" : ""} onClick={() => setTab("players")}>
            PLAYERS
          </button>
          <button className={tab === "bank" ? "active" : ""} onClick={() => setTab("bank")}>
            BANK
          </button>
        </div>

        {tab === "players" && (
          <>
            <div className="catan-player-select">
              {state.players
                .filter((p) => p.seat !== mySeat)
                .map((p) => (
                  <button
                    key={p.seat}
                    className={toSeat === p.seat ? "selected" : ""}
                    onClick={() => setToSeat(p.seat)}
                  >
                    Player {p.seat + 1}
                  </button>
                ))}
            </div>

            <div className="catan-trade-columns">
              <div>
                <div className="catan-trade-col-title">YOU GIVE</div>
                {RESOURCES.map((r) => (
                  <ResourceStepper
                    key={r}
                    resource={r}
                    value={give[r] || 0}
                    max={myResources[r] || 0}
                    onChange={(v) => setGive((prev) => ({ ...prev, [r]: v }))}
                  />
                ))}
              </div>

              <div>
                <div className="catan-trade-col-title">YOU RECEIVE</div>
                {RESOURCES.map((r) => (
                  <ResourceStepper
                    key={r}
                    resource={r}
                    value={want[r] || 0}
                    max={19}
                    onChange={(v) => setWant((prev) => ({ ...prev, [r]: v }))}
                  />
                ))}
              </div>
            </div>

            <button
              className="catan-button"
              disabled={toSeat === null}
              onClick={propose}
            >
              PROPOSE TRADE
            </button>
          </>
        )}

        {tab === "bank" && (
          <div className="catan-bank-trade">
            <p>Trade with the bank at your best available rate (4:1, or 3:1 / 2:1 with a port).</p>

            <div className="catan-bank-row">
              <label>
                Give
                <select value={bankGive} onChange={(e) => setBankGive(e.target.value)}>
                  {RESOURCES.map((r) => (
                    <option key={r} value={r}>
                      {RESOURCE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Want
                <select value={bankWant} onChange={(e) => setBankWant(e.target.value)}>
                  {RESOURCES.map((r) => (
                    <option key={r} value={r}>
                      {RESOURCE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button className="catan-button" onClick={bankTrade}>
              TRADE WITH BANK
            </button>
          </div>
        )}

        <button className="catan-button secondary" onClick={onClose}>
          CLOSE
        </button>
      </div>
    </div>
  );
}

function RulesModal({ onClose }) {
  return (
    <div className="catan-overlay" onClick={onClose}>
      <div className="catan-popup catan-rules-modal" onClick={(e) => e.stopPropagation()}>
        <h2>HOW TO PLAY</h2>

        <div className="catan-rules-body">
          <section>
            <h3>Objective</h3>
            <p>Be the first to reach 10 victory points.</p>
          </section>
          <section>
            <h3>Turn order</h3>
            <p>Roll dice, collect resources, then build/trade/play cards, then end your turn.</p>
          </section>
          <section>
            <h3>Resources</h3>
            <p>Cattle, Cement, Timber, Grain, Steel. Rolling a hex's number gives resources to
            everyone with a settlement (1) or city (2) touching it.</p>
          </section>
          <section>
            <h3>Building</h3>
            <p>Road: 1 Cement + 1 Timber. Settlement: 1 Timber + 1 Cement + 1 Grain + 1 Cattle.
            City (upgrades a settlement): 3 Steel + 2 Grain. Dev card: 1 Steel + 1 Grain + 1 Cattle.</p>
          </section>
          <section>
            <h3>Trading</h3>
            <p>Propose a trade to another player, or trade with the bank at 4:1 (better with ports).</p>
          </section>
          <section>
            <h3>The robber</h3>
            <p>Rolling a 7 blocks nobody's production forever until moved -- players over 7 cards
            discard half, then the roller moves the robber and may steal from an adjacent player.</p>
          </section>
          <section>
            <h3>Development cards</h3>
            <p>Knight moves the robber and counts toward Largest Army (3+ played, most of anyone).
            Road Building gives 2 free roads. Year of Plenty gives 2 resources. Monopoly takes all
            of one resource from every opponent.</p>
          </section>
          <section>
            <h3>Longest Road &amp; Largest Army</h3>
            <p>Both are worth 2 victory points, and can change hands if another player surpasses
            the current holder.</p>
          </section>
        </div>

        <button className="catan-button" onClick={onClose}>
          CLOSE
        </button>
      </div>
    </div>
  );
}

function VictoryScreen({ state, mySeat }) {
  const winner = state.players.find((p) => p.seat === state.winner);

  return (
    <div className="catan-screen catan-gate">
      <div className="catan-popup catan-victory">
        <div className="catan-trophy">🏆</div>
        <h1>Player {state.winner + 1} Wins!</h1>
        <p>{winner?.victoryPoints} victory points</p>

        <div className="catan-final-stats">
          {state.players.map((p) => (
            <div key={p.seat} className="catan-final-player" style={{ "--player-color": p.color }}>
              <span>Player {p.seat + 1}{p.seat === mySeat ? " (you)" : ""}</span>
              <strong>{p.victoryPoints} VP</strong>
              <small>
                🛣 {p.roads.length} · 🏠 {p.settlements.length} · 🏛 {p.cities.length}
              </small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
