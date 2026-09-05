import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./BattleRoyale.css";

const REQUIRED_PLAYERS = 7;

const MAX_ATTACKS = 20;
const MAX_HEALS = 10;
const ATTACK_DAMAGE = 3;
const HEAL_AMOUNT = 10;

const COLORS = [
  "#ff6b6b",
  "#6ba8ff",
  "#7de89a",
  "#ffcf5c",
  "#c78cff",
  "#ff8fc7",
  "#5ce1e6",
];

function createInitialPlayers(names) {
  return names.map((name, index) => ({
    id: index + 1,
    name,
    hp: 100,
    alive: true,
    damageDealt: 0,
    healed: 0,
    faction: null,
  }));
}

export default function BattleRoyale() {
  const location = useLocation();
  const navigate = useNavigate();

  const room = location.state?.room;

  // A room was handed off from the lobby, but it isn't full yet.
  if (room && room.players.length !== REQUIRED_PLAYERS) {
    return (
      <NotEnoughPlayers
        joined={room.players.length}
        onBack={() => navigate("/create-room")}
      />
    );
  }

  const names = room
    ? room.players.map((player) => player.nickname)
    : Array.from({ length: REQUIRED_PLAYERS }, (_, i) => `Player ${i + 1}`);

  return <BattleRoyaleGame names={names} />;
}

function NotEnoughPlayers({ joined, onBack }) {
  return (
    <div className="battle-screen battle-gate">
      <div className="game-popup">
        <h2>NEED {REQUIRED_PLAYERS} PLAYERS</h2>

        <p>
          Battle Royale only starts with exactly {REQUIRED_PLAYERS} players.
          <br />
          {joined}/{REQUIRED_PLAYERS} have joined so far.
        </p>

        <button className="reset-button" onClick={onBack}>
          BACK TO LOBBY
        </button>
      </div>
    </div>
  );
}

function BattleRoyaleGame({ names }) {
  const [players, setPlayers] = useState(() => createInitialPlayers(names));

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);

  const [round, setRound] = useState(1);

  const [attacksLeft, setAttacksLeft] = useState(MAX_ATTACKS);
  const [healsLeft, setHealsLeft] = useState(MAX_HEALS);

  const [gamePhase, setGamePhase] = useState("battle");

  const [logs, setLogs] = useState([
    "BATTLE ROYALE STARTED!",
    "7 players have entered the arena.",
    "Select a player and then select a target.",
  ]);

  const [ending, setEnding] = useState(null);
  const [winner, setWinner] = useState(null);

  const [showFactionPopup, setShowFactionPopup] = useState(false);
  const [showBetrayPopup, setShowBetrayPopup] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const alivePlayers = players.filter((player) => player.alive);

  const addLog = (message) => {
    setLogs((current) => [
      message,
      ...current,
    ].slice(0, 15));
  };

  const resetGame = () => {
    setPlayers(createInitialPlayers(names));
    setSelectedPlayer(null);
    setSelectedTarget(null);
    setRound(1);
    setAttacksLeft(MAX_ATTACKS);
    setHealsLeft(MAX_HEALS);
    setGamePhase("battle");
    setEnding(null);
    setWinner(null);
    setShowFactionPopup(false);
    setShowBetrayPopup(false);

    setLogs([
      "NEW BATTLE STARTED!",
      "7 players have entered the arena.",
      "Select a player and then select a target.",
    ]);
  };

  /*
   * Select attacker.
   */
  const selectPlayer = (id) => {
    if (gamePhase !== "battle") return;

    const player = players.find(
      (item) => item.id === id
    );

    if (!player?.alive) return;

    setSelectedPlayer(id);
    setSelectedTarget(null);

    addLog(`${player.name} selected.`);
  };

  /*
   * Select target.
   */
  const selectTarget = (id) => {
    if (gamePhase !== "battle") return;

    if (!selectedPlayer) {
      addLog("SELECT A PLAYER FIRST!");
      return;
    }

    if (id === selectedPlayer) {
      addLog("YOU CANNOT TARGET YOURSELF!");
      return;
    }

    const target = players.find(
      (item) => item.id === id
    );

    if (!target?.alive) return;

    setSelectedTarget(id);

    addLog(`${target.name} selected as target.`);
  };

  /*
   * Perform attack or heal.
   */
  const performAction = (action) => {
    if (!selectedPlayer || !selectedTarget) {
      addLog("SELECT PLAYER + TARGET FIRST!");
      return;
    }

    if (action === "attack" && attacksLeft <= 0) {
      addLog("NO ATTACKS LEFT!");
      return;
    }

    if (action === "heal" && healsLeft <= 0) {
      addLog("NO HEALS LEFT!");
      return;
    }

    const attacker = players.find(
      (player) => player.id === selectedPlayer
    );

    const target = players.find(
      (player) => player.id === selectedTarget
    );

    if (!attacker || !target) return;

    /*
     * 5% chance of accidentally reversing
     * attack <-> heal.
     */
    let actualAction = action;

    if (Math.random() < 0.05) {
      actualAction =
        action === "attack"
          ? "heal"
          : "attack";

      addLog(
        `LUCK! ${attacker.name}'s action was reversed!`
      );
    }

    const updatedPlayers = players.map(
      (player) => ({ ...player })
    );

    const attackerIndex =
      updatedPlayers.findIndex(
        (player) =>
          player.id === attacker.id
      );

    const targetIndex =
      updatedPlayers.findIndex(
        (player) =>
          player.id === target.id
      );

    if (actualAction === "attack") {
      updatedPlayers[targetIndex].hp -=
        ATTACK_DAMAGE;

      updatedPlayers[attackerIndex].damageDealt +=
        ATTACK_DAMAGE;

      setAttacksLeft(
        (value) => value - 1
      );

      addLog(
        `${attacker.name} attacked ${target.name} for ${ATTACK_DAMAGE} damage!`
      );
    }

    if (actualAction === "heal") {
      const oldHP =
        updatedPlayers[targetIndex].hp;

      updatedPlayers[targetIndex].hp =
        Math.min(
          100,
          updatedPlayers[targetIndex].hp +
            HEAL_AMOUNT
        );

      const actualHeal =
        updatedPlayers[targetIndex].hp -
        oldHP;

      updatedPlayers[attackerIndex].healed +=
        actualHeal;

      setHealsLeft(
        (value) => value - 1
      );

      addLog(
        `${attacker.name} healed ${target.name} for ${actualHeal} HP!`
      );
    }

    /*
     * Eliminate players at 0 HP.
     */
    updatedPlayers.forEach((player) => {
      if (
        player.hp <= 0 &&
        player.alive
      ) {
        player.hp = 0;
        player.alive = false;

        addLog(
          `${player.name} HAS BEEN ELIMINATED!`
        );
      }
    });

    setPlayers(updatedPlayers);

    setSelectedPlayer(null);
    setSelectedTarget(null);

    const remaining =
      updatedPlayers.filter(
        (player) => player.alive
      );

    /*
     * Only one player remains.
     */
    if (remaining.length === 1) {
      finishGame(
        remaining[0],
        "Indra Sena Reddy Ending"
      );
      return;
    }

    /*
     * Final two.
     */
    if (remaining.length === 2) {
      setGamePhase("final");
      addLog("ONLY TWO PLAYERS REMAIN!");
      addLog("THE FINAL BATTLE BEGINS!");
      return;
    }

    /*
     * Every 3 rounds.
     */
    const nextRound = round + 1;

    if (nextRound % 3 === 0) {
      setRound(nextRound);

      /*
       * Randomly give faction opportunity.
       */
      if (Math.random() < 0.65) {
        setGamePhase("faction");
        setShowFactionPopup(true);
        addLog(
          "A FACTION OPPORTUNITY HAS APPEARED!"
        );
        return;
      }
    }

    setRound(nextRound);
  };

  /*
   * Final two must fight,
   * unless someone chooses peace.
   */
  const finalAttack = () => {
    if (alivePlayers.length !== 2) return;

    const [player1, player2] =
      alivePlayers;

    const attacker =
      Math.random() < 0.5
        ? player1
        : player2;

    const target =
      attacker.id === player1.id
        ? player2
        : player1;

    const updatedPlayers = players.map(
      (player) => ({ ...player })
    );

    const targetIndex =
      updatedPlayers.findIndex(
        (player) =>
          player.id === target.id
      );

    const attackerIndex =
      updatedPlayers.findIndex(
        (player) =>
          player.id === attacker.id
      );

    updatedPlayers[targetIndex].hp -=
      ATTACK_DAMAGE;

    updatedPlayers[attackerIndex].damageDealt +=
      ATTACK_DAMAGE;

    addLog(
      `${attacker.name} attacks ${target.name}!`
    );

    if (
      updatedPlayers[targetIndex].hp <= 0
    ) {
      updatedPlayers[targetIndex].hp = 0;
      updatedPlayers[targetIndex].alive = false;

      setPlayers(updatedPlayers);

      /*
       * 10% Seema Shastry ending.
       */
      if (Math.random() < 0.1) {
        finishGame(
          target,
          "Seema Shastry Ending"
        );
        return;
      }

      /*
       * Check Marayada Ramanna.
       */
      const winnerCandidate =
        updatedPlayers.find(
          (player) => player.alive
        );

      finishGame(
        winnerCandidate,
        calculateEnding(
          winnerCandidate,
          updatedPlayers
        )
      );

      return;
    }

    setPlayers(updatedPlayers);
  };

  /*
   * Peace ending.
   */
  const choosePeace = () => {
    if (alivePlayers.length !== 2) return;

    /*
     * The player who gives up
     * loses the conventional win,
     * but gets the Peace ending.
     *
     * For the temporary demo we randomly
     * choose the person who gives up.
     */
    const peaceWinner =
      alivePlayers[
        Math.floor(
          Math.random() *
            alivePlayers.length
        )
      ];

    finishGame(
      peaceWinner,
      "Aravinda Sametha Ending"
    );
  };

  /*
   * Determine whether the special
   * Marayada Ramanna ending applies.
   */
  const calculateEnding = (
    candidate,
    currentPlayers
  ) => {
    const alive = currentPlayers.filter(
      (player) => player.alive
    );

    const lowestDamage = Math.min(
      ...alive.map(
        (player) =>
          player.damageDealt
      )
    );

    const highestHealing = Math.max(
      ...alive.map(
        (player) =>
          player.healed
      )
    );

    if (
      candidate.damageDealt ===
        lowestDamage &&
      candidate.healed ===
        highestHealing
    ) {
      return "Marayada Ramanna Ending";
    }

    return "Indra Sena Reddy Ending";
  };

  /*
   * End game.
   */
  const finishGame = (
    player,
    endingName
  ) => {
    if (!player) return;

    setWinner(player);
    setEnding(endingName);
    setGamePhase("finished");

    addLog(
      `${endingName.toUpperCase()}!`
    );

    addLog(
      `${player.name} IS THE WINNER!`
    );
  };

  /*
   * Faction selection.
   */
  const chooseFaction = (faction) => {
    const updatedPlayers =
      players.map((player) => {
        if (!player.alive) {
          return player;
        }

        return {
          ...player,
          faction:
            faction === "random"
              ? Math.random() < 0.5
                ? "SUN"
                : "MOON"
              : faction,
        };
      });

    setPlayers(updatedPlayers);

    setShowFactionPopup(false);
    setGamePhase("battle");

    addLog(
      `PLAYERS HAVE JOINED THE ${faction === "random" ? "RANDOM" : faction} FACTION!`
    );

    /*
     * Small chance of betrayal
     * after factions are created.
     */
    if (Math.random() < 0.35) {
      setTimeout(() => {
        setGamePhase("betrayal");
        setShowBetrayPopup(true);

        addLog(
          "A BETRAYAL OPPORTUNITY HAS APPEARED!"
        );
      }, 500);
    }
  };

  /*
   * Demonstration betrayal.
   */
  const betray = () => {
    const alive =
      players.filter(
        (player) => player.alive
      );

    if (alive.length < 2) return;

    const victim =
      alive[
        Math.floor(
          Math.random() *
            alive.length
        )
      ];

    const newFaction =
      victim.faction === "SUN"
        ? "MOON"
        : "SUN";

    const updatedPlayers =
      players.map((player) =>
        player.id === victim.id
          ? {
              ...player,
              faction: newFaction,
            }
          : player
      );

    setPlayers(updatedPlayers);

    addLog(
      `${victim.name} HAS BETRAYED THEIR FACTION!`
    );

    setShowBetrayPopup(false);
    setGamePhase("battle");
  };

  /*
   * Automatically reset selected target
   * if player gets eliminated.
   */
  useEffect(() => {
    if (
      selectedPlayer &&
      !players.find(
        (player) =>
          player.id === selectedPlayer &&
          player.alive
      )
    ) {
      setSelectedPlayer(null);
      setSelectedTarget(null);
    }
  }, [players, selectedPlayer]);

  return (
    <div className="battle-screen">

      <div className="pixel-sun" />

      <div className="battle-cloud cloud-a" />
      <div className="battle-cloud cloud-b" />

      {/* HEADER */}

      <header className="battle-header">

        <div>
          <h1 className="game-logo">
            BATTLE ROYALE
          </h1>

          <p className="game-subtitle">
            GAMES FOR GROUPS
          </p>
        </div>

        <div className="round-box">
          <span>ROUND</span>
          <strong>{round}</strong>
        </div>

      </header>

      {/* MAIN */}

      <main className="battle-layout">

        {/* PLAYERS */}

        <section className="players-panel">

          <div className="section-title">
            PLAYERS
          </div>

          <div className="players-grid">

            {players.map(
              (player, index) => (

                <div
                  key={player.id}
                  className={`
                    player-card
                    ${!player.alive ? "dead" : ""}
                    ${selectedPlayer === player.id ? "selected" : ""}
                    ${selectedTarget === player.id ? "targeted" : ""}
                  `}
                  onClick={() =>
                    player.alive &&
                    selectPlayer(player.id)
                  }
                >

                  <div
                    className="player-avatar"
                    style={{
                      background:
                        COLORS[index],
                    }}
                  >
                    {player.name
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div className="player-info">

                    <div className="player-name">
                      {player.name}
                    </div>

                    <div className="hp-bar">

                      <div
                        className="hp-fill"
                        style={{
                          width: `${player.hp}%`,
                        }}
                      />

                    </div>

                    <div className="player-stats">

                      <span>
                        HP {player.hp}
                      </span>

                      {player.faction && (
                        <span>
                          {player.faction ===
                          "SUN"
                            ? "☀ SUN"
                            : "☾ MOON"}
                        </span>
                      )}

                    </div>

                  </div>

                  {!player.alive && (
                    <div className="eliminated">
                      OUT
                    </div>
                  )}

                </div>

              )
            )}

          </div>

        </section>

        {/* ARENA */}

        <section className="arena-panel">

          <div className="arena-title">
            ARENA
          </div>

          <div className="arena">

            <div className="arena-ground" />

            {players.map(
              (player, index) => {

                const positions = [
                  [50, 15],
                  [22, 30],
                  [78, 30],
                  [15, 62],
                  [85, 62],
                  [32, 78],
                  [68, 78],
                ];

                const [x, y] =
                  positions[index];

                return (
                  <button
                    key={player.id}
                    className={`
                      arena-player
                      ${!player.alive ? "arena-dead" : ""}
                      ${selectedPlayer === player.id ? "arena-selected" : ""}
                      ${selectedTarget === player.id ? "arena-target" : ""}
                    `}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      "--player-color":
                        COLORS[index],
                    }}
                    onClick={() => {
                      if (!player.alive)
                        return;

                      if (!selectedPlayer) {
                        selectPlayer(
                          player.id
                        );
                      } else if (
                        player.id !==
                        selectedPlayer
                      ) {
                        selectTarget(
                          player.id
                        );
                      }
                    }}
                  >

                    <span>
                      {player.name
                        .charAt(0)
                        .toUpperCase()}
                    </span>

                    <small>
                      {player.hp}
                    </small>

                  </button>
                );
              }
            )}

          </div>

          {/* CURRENT SELECTION */}

          <div className="selection-info">

            <div>
              <span>PLAYER</span>

              <strong>
                {players.find(
                  (player) =>
                    player.id ===
                    selectedPlayer
                )?.name || "NONE"}
              </strong>
            </div>

            <div>
              <span>TARGET</span>

              <strong>
                {players.find(
                  (player) =>
                    player.id ===
                    selectedTarget
                )?.name || "NONE"}
              </strong>
            </div>

          </div>

          {/* ACTION BUTTONS */}

          <div className="action-buttons">

            <button
              className="attack-button"
              disabled={
                gamePhase !== "battle"
              }
              onClick={() =>
                performAction("attack")
              }
            >
              ⚔ ATTACK

              <small>
                {attacksLeft} LEFT
              </small>
            </button>

            <button
              className="heal-button"
              disabled={
                gamePhase !== "battle"
              }
              onClick={() =>
                performAction("heal")
              }
            >
              ♥ HEAL

              <small>
                {healsLeft} LEFT
              </small>
            </button>

          </div>

          {alivePlayers.length === 2 && (
            <button
              className="peace-button"
              onClick={choosePeace}
            >
              🕊 STOP FIGHTING
            </button>
          )}

        </section>

        {/* LOG */}

        <aside className="side-panel">

          <div className="section-title">
            BATTLE LOG
          </div>

          <div className="battle-log">

            {logs.map(
              (message, index) => (
                <div
                  className="log-line"
                  key={`${message}-${index}`}
                >
                  <span>&gt;</span>
                  {message}
                </div>
              )
            )}

          </div>

          <div className="resource-box">

            <div>
              <span>ATTACKS</span>
              <strong>
                {attacksLeft}/20
              </strong>
            </div>

            <div>
              <span>HEALS</span>
              <strong>
                {healsLeft}/10
              </strong>
            </div>

            <div>
              <span>ALIVE</span>
              <strong>
                {alivePlayers.length}/7
              </strong>
            </div>

          </div>

          <button
            className="reset-button"
            onClick={() => setConfirmingReset(true)}
          >
            RESTART GAME
          </button>

        </aside>

      </main>

      {/* RESTART CONFIRMATION */}

      {confirmingReset && (
        <div className="game-overlay">

          <div className="game-popup">

            <h2>RESTART GAME?</h2>

            <p>
              This will end the current battle and start a new one.
            </p>

            <div className="confirm-grid">
              <button
                className="confirm-yes"
                onClick={() => {
                  setConfirmingReset(false);
                  resetGame();
                }}
              >
                YES, RESTART
              </button>

              <button
                className="confirm-no"
                onClick={() => setConfirmingReset(false)}
              >
                CANCEL
              </button>
            </div>

          </div>

        </div>
      )}

      {/* FACTION POPUP */}

      {showFactionPopup && (
        <div className="game-overlay">

          <div className="game-popup">

            <h2>
              CHOOSE FACTION
            </h2>

            <p>
              The battle has reached a
              turning point!
            </p>

            <div className="faction-buttons">

              <button
                className="sun-faction"
                onClick={() =>
                  chooseFaction("SUN")
                }
              >
                ☀ SUN FACTION
              </button>

              <button
                className="moon-faction"
                onClick={() =>
                  chooseFaction("MOON")
                }
              >
                ☾ MOON FACTION
              </button>

              <button
                className="random-faction"
                onClick={() =>
                  chooseFaction("random")
                }
              >
                ? RANDOM
              </button>

            </div>

          </div>

        </div>
      )}

      {/* BETRAYAL POPUP */}

      {showBetrayPopup && (
        <div className="game-overlay">

          <div className="game-popup">

            <h2>
              BETRAYAL!
            </h2>

            <p>
              You have a chance to
              betray your faction.
            </p>

            <button
              className="betray-button"
              onClick={betray}
            >
              BETRAY
            </button>

            <button
              className="ignore-button"
              onClick={() => {
                setShowBetrayPopup(false);
                setGamePhase("battle");
              }}
            >
              STAY LOYAL
            </button>

          </div>

        </div>
      )}

      {/* FINAL TWO */}

      {gamePhase === "final" && (
        <div className="game-overlay">

          <div className="game-popup">

            <h2>
              FINAL TWO!
            </h2>

            <p>
              Only two players remain.
              They must attack each other
              until one survives.
            </p>

            <button
              className="final-attack-button"
              onClick={finalAttack}
            >
              ⚔ FIGHT!
            </button>

            <button
              className="peace-button"
              onClick={choosePeace}
            >
              🕊 GIVE UP & MAKE PEACE
            </button>

          </div>

        </div>
      )}

      {/* WINNER */}

      {gamePhase === "finished" &&
        winner && (
          <div className="game-overlay">

            <div className="winner-popup">

              <div className="winner-crown">
                👑
              </div>

              <div className="ending-label">
                {ending}
              </div>

              <h1>
                {winner.name}
              </h1>

              <p>
                IS THE LAST WARRIOR STANDING!
              </p>

              <div className="winner-stats">

                <div>
                  <span>
                    DAMAGE DEALT
                  </span>

                  <strong>
                    {winner.damageDealt}
                  </strong>
                </div>

                <div>
                  <span>
                    HEALED
                  </span>

                  <strong>
                    {winner.healed}
                  </strong>
                </div>

              </div>

              <button
                className="restart-winning"
                onClick={resetGame}
              >
                PLAY AGAIN
              </button>

            </div>

          </div>
        )}

      <div className="grass-floor" />

    </div>
  );
}