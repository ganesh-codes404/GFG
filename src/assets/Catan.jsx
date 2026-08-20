import React, { useMemo, useState } from "react";
import "./Catan.css";

const RESOURCE_TYPES = [
  "wood",
  "brick",
  "sheep",
  "wheat",
  "ore",
];

const RESOURCE_ICONS = {
  wood: "🌲",
  brick: "🧱",
  sheep: "🐑",
  wheat: "🌾",
  ore: "⛰",
};

const RESOURCE_COLORS = {
  wood: "#4caf50",
  brick: "#d86b4d",
  sheep: "#8fd694",
  wheat: "#f5c85b",
  ore: "#7d7d8c",
};

const INITIAL_RESOURCES = {
  wood: 2,
  brick: 2,
  sheep: 2,
  wheat: 2,
  ore: 2,
};

const BUILD_COSTS = {
  road: {
    wood: 1,
    brick: 1,
  },

  settlement: {
    wood: 1,
    brick: 1,
    sheep: 1,
    wheat: 1,
  },

  city: {
    wheat: 2,
    ore: 3,
  },

  development: {
    sheep: 1,
    wheat: 1,
    ore: 1,
  },
};

const PLAYER_COLORS = [
  "#e85d5d",
  "#5d91e8",
  "#61c96f",
  "#c47be8",
  "#e8b84d",
];

const INITIAL_PLAYERS = [
  {
    id: 1,
    name: "Player 1",
    resources: { ...INITIAL_RESOURCES },
    victoryPoints: 2,
    roads: 2,
    settlements: 2,
    cities: 0,
    army: 0,
    developmentCards: [],
    color: PLAYER_COLORS[0],
  },

  {
    id: 2,
    name: "Player 2",
    resources: {
      wood: 2,
      brick: 2,
      sheep: 1,
      wheat: 2,
      ore: 1,
    },
    victoryPoints: 2,
    roads: 2,
    settlements: 2,
    cities: 0,
    army: 0,
    developmentCards: [],
    color: PLAYER_COLORS[1],
  },

  {
    id: 3,
    name: "Player 3",
    resources: {
      wood: 1,
      brick: 2,
      sheep: 2,
      wheat: 2,
      ore: 2,
    },
    victoryPoints: 2,
    roads: 2,
    settlements: 2,
    cities: 0,
    army: 0,
    developmentCards: [],
    color: PLAYER_COLORS[2],
  },

  {
    id: 4,
    name: "Player 4",
    resources: {
      wood: 2,
      brick: 1,
      sheep: 2,
      wheat: 1,
      ore: 2,
    },
    victoryPoints: 2,
    roads: 2,
    settlements: 2,
    cities: 0,
    army: 0,
    developmentCards: [],
    color: PLAYER_COLORS[3],
  },

  {
    id: 5,
    name: "Player 5",
    resources: {
      wood: 2,
      brick: 2,
      sheep: 2,
      wheat: 1,
      ore: 1,
    },
    victoryPoints: 2,
    roads: 2,
    settlements: 2,
    cities: 0,
    army: 0,
    developmentCards: [],
    color: PLAYER_COLORS[4],
  },
];

function clonePlayers() {
  return INITIAL_PLAYERS.map((player) => ({
    ...player,
    resources: {
      ...player.resources,
    },
    developmentCards: [],
  }));
}

function rollDice() {
  const first = Math.floor(Math.random() * 6) + 1;
  const second = Math.floor(Math.random() * 6) + 1;

  return [first, second];
}

function canAfford(resources, cost) {
  return Object.entries(cost).every(
    ([resource, amount]) =>
      (resources[resource] || 0) >= amount
  );
}

function subtractCost(resources, cost) {
  const updated = {
    ...resources,
  };

  Object.entries(cost).forEach(
    ([resource, amount]) => {
      updated[resource] -= amount;
    }
  );

  return updated;
}

export default function Catan() {
  /*
   * TEMPORARY:
   * We simulate a 4-player room.
   *
   * Later this will come from your Socket.IO room.
   */
  const [playerCount, setPlayerCount] =
    useState(4);

  const [players, setPlayers] = useState(
    clonePlayers()
  );

  const [currentPlayerId, setCurrentPlayerId] =
    useState(1);

  const [dice, setDice] = useState(null);

  const [hasRolled, setHasRolled] =
    useState(false);

  const [turnNumber, setTurnNumber] =
    useState(1);

  const [robber, setRobber] =
    useState(false);

  const [selectedRobberPlayer, setSelectedRobberPlayer] =
    useState(null);

  const [logs, setLogs] = useState([
    "CATAN HAS BEGUN!",
    "Roll the dice to start your turn.",
  ]);

  const [tradeResource, setTradeResource] =
    useState("wood");

  const [showTrade, setShowTrade] =
    useState(false);

  const [winner, setWinner] =
    useState(null);

  /*
   * Temporary board settlements.
   */
  const [settlements, setSettlements] =
    useState([
      {
        id: 1,
        playerId: 1,
        type: "settlement",
      },
      {
        id: 2,
        playerId: 2,
        type: "settlement",
      },
      {
        id: 3,
        playerId: 3,
        type: "settlement",
      },
      {
        id: 4,
        playerId: 4,
        type: "settlement",
      },
    ]);

  const currentPlayer = players.find(
    (player) =>
      player.id === currentPlayerId
  );

  const visiblePlayers = useMemo(
    () =>
      players.slice(
        0,
        playerCount
      ),
    [players, playerCount]
  );

  const addLog = (message) => {
    setLogs((current) =>
      [message, ...current].slice(0, 18)
    );
  };

  /*
   * Reset game.
   */
  const resetGame = () => {
    setPlayers(clonePlayers());

    setCurrentPlayerId(1);
    setDice(null);
    setHasRolled(false);
    setTurnNumber(1);
    setRobber(false);
    setSelectedRobberPlayer(null);
    setWinner(null);
    setShowTrade(false);

    setSettlements([
      {
        id: 1,
        playerId: 1,
        type: "settlement",
      },
      {
        id: 2,
        playerId: 2,
        type: "settlement",
      },
      {
        id: 3,
        playerId: 3,
        type: "settlement",
      },
      {
        id: 4,
        playerId: 4,
        type: "settlement",
      },
    ]);

    setLogs([
      "NEW CATAN GAME!",
      "Roll the dice to start your turn.",
    ]);
  };

  /*
   * Roll dice.
   */
  const handleRollDice = () => {
    if (hasRolled || winner || robber) {
      return;
    }

    const result = rollDice();

    setDice(result);
    setHasRolled(true);

    const total =
      result[0] + result[1];

    addLog(
      `${currentPlayer.name} rolled ${total}!`
    );

    /*
     * Seven activates robber.
     */
    if (total === 7) {
      addLog(
        "A 7 WAS ROLLED! THE ROBBER AWAKENS!"
      );

      setRobber(true);
      return;
    }

    /*
     * Temporary resource distribution.
     *
     * In the real version this will depend
     * on the actual board tiles and numbers.
     */
    setPlayers((current) =>
      current.map((player) => {
        if (player.id !== currentPlayerId) {
          return player;
        }

        const gained = {
          ...player.resources,
        };

        const resource =
          RESOURCE_TYPES[
            Math.floor(
              Math.random() *
                RESOURCE_TYPES.length
            )
          ];

        gained[resource] += 1;

        addLog(
          `${player.name} received 1 ${resource}.`
        );

        return {
          ...player,
          resources: gained,
        };
      })
    );
  };

  /*
   * Move robber.
   */
  const moveRobber = (tile) => {
    if (!robber) return;

    addLog(
      `${currentPlayer.name} moved the robber.`
    );

    setRobber(false);
    setSelectedRobberPlayer(null);
  };

  /*
   * Steal a random resource from player.
   */
  const stealFromPlayer = (targetId) => {
    const target = players.find(
      (player) =>
        player.id === targetId
    );

    if (!target) return;

    const available =
      RESOURCE_TYPES.filter(
        (resource) =>
          target.resources[resource] > 0
      );

    if (available.length === 0) {
      addLog(
        `${target.name} has no resources to steal!`
      );

      setRobber(false);
      return;
    }

    const stolenResource =
      available[
        Math.floor(
          Math.random() *
            available.length
        )
      ];

    setPlayers((current) =>
      current.map((player) => {
        if (player.id === targetId) {
          return {
            ...player,
            resources: {
              ...player.resources,
              [stolenResource]:
                player.resources[
                  stolenResource
                ] - 1,
            },
          };
        }

        if (
          player.id === currentPlayerId
        ) {
          return {
            ...player,
            resources: {
              ...player.resources,
              [stolenResource]:
                player.resources[
                  stolenResource
                ] + 1,
            },
          };
        }

        return player;
      })
    );

    addLog(
      `${currentPlayer.name} stole ${stolenResource} from ${target.name}!`
    );

    setRobber(false);
    setSelectedRobberPlayer(null);
  };

  /*
   * Build something.
   */
  const build = (type) => {
    if (!currentPlayer) return;

    if (!hasRolled) {
      addLog(
        "ROLL THE DICE BEFORE BUILDING!"
      );
      return;
    }

    const cost =
      BUILD_COSTS[type];

    if (
      !canAfford(
        currentPlayer.resources,
        cost
      )
    ) {
      addLog(
        `NOT ENOUGH RESOURCES FOR ${type.toUpperCase()}!`
      );
      return;
    }

    setPlayers((current) =>
      current.map((player) => {
        if (
          player.id !== currentPlayerId
        ) {
          return player;
        }

        const resources =
          subtractCost(
            player.resources,
            cost
          );

        if (type === "road") {
          return {
            ...player,
            resources,
            roads: player.roads + 1,
          };
        }

        if (type === "settlement") {
          return {
            ...player,
            resources,
            settlements:
              player.settlements + 1,
            victoryPoints:
              player.victoryPoints + 1,
          };
        }

        if (type === "city") {
          return {
            ...player,
            resources,
            cities:
              player.cities + 1,
            victoryPoints:
              player.victoryPoints + 1,
          };
        }

        if (type === "development") {
          return {
            ...player,
            resources,
            developmentCards: [
              ...player.developmentCards,
              "Knight",
            ],
          };
        }

        return player;
      })
    );

    addLog(
      `${currentPlayer.name} built a ${type}!`
    );

    checkWinner(
      currentPlayer,
      type
    );
  };

  /*
   * Check 10 VP.
   */
  const checkWinner = (
    player,
    buildType
  ) => {
    let newVP =
      player.victoryPoints;

    if (
      buildType === "settlement"
    ) {
      newVP += 1;
    }

    if (buildType === "city") {
      newVP += 1;
    }

    if (newVP >= 10) {
      setWinner({
        ...player,
        victoryPoints: newVP,
      });
    }
  };

  /*
   * Bank trade:
   *
   * 4 same resources
   * → 1 chosen resource
   */
  const tradeWithBank = () => {
    if (!currentPlayer) return;

    const source =
      tradeResource;

    if (
      currentPlayer.resources[
        source
      ] < 4
    ) {
      addLog(
        "YOU NEED 4 OF ONE RESOURCE TO TRADE!"
      );
      return;
    }

    const target =
      RESOURCE_TYPES.find(
        (resource) =>
          resource !== source
      ) || "wood";

    setPlayers((current) =>
      current.map((player) => {
        if (
          player.id !== currentPlayerId
        ) {
          return player;
        }

        return {
          ...player,

          resources: {
            ...player.resources,
            [source]:
              player.resources[
                source
              ] - 4,
            [target]:
              player.resources[
                target
              ] + 1,
          },
        };
      })
    );

    addLog(
      `${currentPlayer.name} traded 4 ${source} for 1 ${target}.`
    );
  };

  /*
   * End turn.
   */
  const endTurn = () => {
    if (!hasRolled) {
      addLog(
        "YOU MUST ROLL BEFORE ENDING YOUR TURN!"
      );
      return;
    }

    const nextIndex =
      visiblePlayers.findIndex(
        (player) =>
          player.id ===
          currentPlayerId
      ) + 1;

    const nextPlayer =
      visiblePlayers[
        nextIndex %
          visiblePlayers.length
      ];

    setCurrentPlayerId(
      nextPlayer.id
    );

    setTurnNumber(
      (turn) => turn + 1
    );

    setDice(null);
    setHasRolled(false);

    addLog(
      `${nextPlayer.name}'S TURN!`
    );
  };

  /*
   * Change number of temporary players.
   */
  const changePlayerCount = (
    count
  ) => {
    setPlayerCount(count);

    /*
     * Keep the current player valid.
     */
    if (
      currentPlayerId > count
    ) {
      setCurrentPlayerId(1);
    }

    addLog(
      `TESTING WITH ${count} PLAYERS.`
    );
  };

  return (
    <div className="catan-screen">

      {/* SKY */}

      <div className="catan-sun" />

      <div className="catan-cloud catan-cloud-1" />
      <div className="catan-cloud catan-cloud-2" />

      {/* HEADER */}

      <header className="catan-header">

        <div>

          <h1 className="catan-logo">
            CATAN
          </h1>

          <p>
            GAMES FOR GROUPS
          </p>

        </div>

        <div className="catan-header-info">

          <div>
            <span>TURN</span>
            <strong>
              {turnNumber}
            </strong>
          </div>

          <div>
            <span>PLAYERS</span>
            <strong>
              {playerCount}
            </strong>
          </div>

        </div>

      </header>

      {/* MAIN */}

      <main className="catan-layout">

        {/* LEFT PLAYER PANEL */}

        <aside className="catan-left">

          <div className="catan-section-title">
            PLAYERS
          </div>

          <div className="catan-player-list">

            {visiblePlayers.map(
              (player) => (

                <button
                  key={player.id}
                  className={`
                    catan-player
                    ${
                      player.id ===
                      currentPlayerId
                        ? "current"
                        : ""
                    }
                  `}
                  onClick={() =>
                    setCurrentPlayerId(
                      player.id
                    )
                  }
                >

                  <span
                    className="player-color"
                    style={{
                      background:
                        player.color,
                    }}
                  />

                  <span className="player-details">

                    <strong>
                      {player.name}
                    </strong>

                    <small>
                      {player.victoryPoints} VP
                    </small>

                  </span>

                  <span className="player-army">
                    ⚔ {player.army}
                  </span>

                </button>

              )
            )}

          </div>

          {/* TEST PLAYER COUNT */}

          <div className="test-player-box">

            <span>
              TEST PLAYERS
            </span>

            <div>

              {[3, 4, 5].map(
                (count) => (
                  <button
                    key={count}
                    className={
                      playerCount ===
                      count
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      changePlayerCount(
                        count
                      )
                    }
                  >
                    {count}
                  </button>
                )
              )}

            </div>

          </div>

          {/* RESOURCES */}

          {currentPlayer && (
            <div className="resource-panel">

              <div className="catan-section-title">
                YOUR RESOURCES
              </div>

              {RESOURCE_TYPES.map(
                (resource) => (

                  <div
                    className="resource-row"
                    key={resource}
                  >

                    <span
                      className="resource-icon"
                      style={{
                        background:
                          RESOURCE_COLORS[
                            resource
                          ],
                      }}
                    >
                      {
                        RESOURCE_ICONS[
                          resource
                        ]
                      }
                    </span>

                    <span>
                      {resource.toUpperCase()}
                    </span>

                    <strong>
                      {
                        currentPlayer
                          .resources[
                          resource
                        ]
                      }
                    </strong>

                  </div>

                )
              )}

            </div>
          )}

        </aside>

        {/* BOARD */}

        <section className="catan-board-panel">

          <div className="catan-section-title">
            ISLAND OF CATAN
          </div>

          <div className="catan-board">

            {/* HEX TILES */}

            <div className="hex-row row-1">

              <Hex
                resource="wood"
                number="8"
              />

              <Hex
                resource="sheep"
                number="4"
              />

              <Hex
                resource="wheat"
                number="9"
              />

            </div>

            <div className="hex-row row-2">

              <Hex
                resource="brick"
                number="5"
              />

              <Hex
                resource="ore"
                number="6"
              />

              <Hex
                resource="wheat"
                number="10"
              />

              <Hex
                resource="sheep"
                number="3"
              />

            </div>

            <div className="hex-row row-3">

              <Hex
                resource="wood"
                number="11"
              />

              <Hex
                resource="desert"
                number=""
              />

              <Hex
                resource="ore"
                number="8"
              />

            </div>

            {/* BOARD PIECES */}

            {settlements.map(
              (piece, index) => {

                const positions = [
                  {
                    left: "17%",
                    top: "30%",
                  },
                  {
                    left: "72%",
                    top: "29%",
                  },
                  {
                    left: "30%",
                    top: "66%",
                  },
                  {
                    left: "63%",
                    top: "68%",
                  },
                ];

                const position =
                  positions[
                    index %
                      positions.length
                  ];

                const owner =
                  players.find(
                    (player) =>
                      player.id ===
                      piece.playerId
                  );

                return (
                  <div
                    key={piece.id}
                    className={`board-piece ${piece.type}`}
                    style={{
                      ...position,
                      background:
                        owner?.color ||
                        "#fff",
                    }}
                  >
                    {piece.type ===
                    "city"
                      ? "🏙"
                      : "⌂"}
                  </div>
                );
              }
            )}

            {/* ROBBER */}

            <button
              className={`robber ${
                robber ? "active" : ""
              }`}
              onClick={() =>
                robber &&
                moveRobber()
              }
            >
              👹
            </button>

          </div>

          {/* DICE */}

          <div className="dice-area">

            <div className="dice">

              {dice ? dice[0] : "?"}

            </div>

            <div className="dice">

              {dice ? dice[1] : "?"}

            </div>

            <button
              className="roll-button"
              disabled={
                hasRolled ||
                !!winner ||
                robber
              }
              onClick={
                handleRollDice
              }
            >
              🎲 ROLL DICE
            </button>

          </div>

        </section>

        {/* RIGHT PANEL */}

        <aside className="catan-right">

          <div className="catan-section-title">
            BUILD
          </div>

          <div className="build-buttons">

            <BuildButton
              icon="🛣"
              title="ROAD"
              cost="🌲 1  🧱 1"
              onClick={() =>
                build("road")
              }
            />

            <BuildButton
              icon="⌂"
              title="SETTLEMENT"
              cost="🌲1 🧱1 🐑1 🌾1"
              onClick={() =>
                build("settlement")
              }
            />

            <BuildButton
              icon="🏙"
              title="CITY"
              cost="🌾 2  ⛰ 3"
              onClick={() =>
                build("city")
              }
            />

            <BuildButton
              icon="🃏"
              title="DEVELOPMENT"
              cost="🐑 1 🌾 1 ⛰ 1"
              onClick={() =>
                build("development")
              }
            />

          </div>

          {/* TRADE */}

          <div className="trade-panel">

            <div className="catan-section-title">
              BANK TRADE
            </div>

            <p>
              4 of one resource
              → 1 resource
            </p>

            <select
              value={tradeResource}
              onChange={(event) =>
                setTradeResource(
                  event.target.value
                )
              }
            >

              {RESOURCE_TYPES.map(
                (resource) => (
                  <option
                    key={resource}
                    value={resource}
                  >
                    {resource.toUpperCase()}
                  </option>
                )
              )}

            </select>

            <button
              className="trade-button"
              onClick={
                tradeWithBank
              }
            >
              TRADE WITH BANK
            </button>

          </div>

          {/* TURN */}

          <button
            className="end-turn-button"
            disabled={!!winner}
            onClick={endTurn}
          >
            END TURN →
          </button>

          <button
            className="reset-catan-button"
            onClick={resetGame}
          >
            RESTART
          </button>

        </aside>

      </main>

      {/* BATTLE LOG */}

      <section className="catan-log-panel">

        <div className="catan-section-title">
          GAME LOG
        </div>

        <div className="catan-log">

          {logs.map(
            (log, index) => (
              <div
                key={`${log}-${index}`}
              >
                <span>&gt;</span>
                {log}
              </div>
            )
          )}

        </div>

      </section>

      {/* ROBBER POPUP */}

      {robber && (
        <div className="catan-overlay">

          <div className="catan-popup">

            <div className="popup-icon">
              👹
            </div>

            <h2>
              THE ROBBER!
            </h2>

            <p>
              Choose another player
              to steal from.
            </p>

            <div className="robber-players">

              {visiblePlayers
                .filter(
                  (player) =>
                    player.id !==
                    currentPlayerId
                )
                .map((player) => (

                  <button
                    key={player.id}
                    onClick={() =>
                      stealFromPlayer(
                        player.id
                      )
                    }
                  >
                    {player.name}
                  </button>

                ))}

            </div>

          </div>

        </div>
      )}

      {/* WINNER */}

      {winner && (
        <div className="catan-overlay">

          <div className="catan-winner">

            <div className="winner-crown">
              👑
            </div>

            <div className="winner-small">
              CATAN CHAMPION
            </div>

            <h1>
              {winner.name}
            </h1>

            <p>
              REACHED 10 VICTORY POINTS!
            </p>

            <div className="winner-vp">
              {winner.victoryPoints}
              <span>VP</span>
            </div>

            <button
              onClick={resetGame}
            >
              PLAY AGAIN
            </button>

          </div>

        </div>
      )}

      <div className="catan-grass" />

    </div>
  );
}

/*
 * HEX TILE
 */
function Hex({
  resource,
  number,
}) {
  return (
    <div
      className={`hex hex-${resource}`}
    >

      <div className="hex-resource">
        {resource ===
        "desert"
          ? "🏜"
          : RESOURCE_ICONS[
              resource
            ]}
      </div>

      {number && (
        <div
          className={`hex-number ${
            number === "6" ||
            number === "8"
              ? "hot"
              : ""
          }`}
        >
          {number}
        </div>
      )}

    </div>
  );
}

/*
 * BUILD BUTTON
 */
function BuildButton({
  icon,
  title,
  cost,
  onClick,
}) {
  return (
    <button
      className="build-button"
      onClick={onClick}
    >

      <span className="build-icon">
        {icon}
      </span>

      <span className="build-info">

        <strong>
          {title}
        </strong>

        <small>
          {cost}
        </small>

      </span>

    </button>
  );
}