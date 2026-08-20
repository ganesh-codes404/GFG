import React, { useEffect, useMemo, useState } from "react";
import "./BattleRoyale.css";

const STARTING_HP = 100;
const ATTACK_DAMAGE = 3;
const HEAL_AMOUNT = 10;
const MAX_ATTACKS = 20;
const MAX_HEALS = 10;

const PLAYER_NAMES = [
  "Indra",
  "Aravind",
  "Seema",
  "Marayada",
  "Reddy",
  "Sena",
  "Ramanna",
];

const PLAYER_COLORS = [
  "#ff6b6b",
  "#6ba8ff",
  "#8be28b",
  "#ffcf5c",
  "#c78cff",
  "#ff8fc7",
  "#5ce1e6",
];

const random = (max) => Math.floor(Math.random() * max);

function createPlayers() {
  return PLAYER_NAMES.map((name, index) => ({
    id: index + 1,
    name,
    hp: STARTING_HP,
    alive: true,
    damageDealt: 0,
    damageHealed: 0,
    faction: null,
    color: PLAYER_COLORS[index],
  }));
}

function BattleRoyale() {
  const [players, setPlayers] = useState(createPlayers);
  const [round, setRound] = useState(1);

  const [attacksLeft, setAttacksLeft] = useState(MAX_ATTACKS);
  const [healsLeft, setHealsLeft] = useState(MAX_HEALS);

  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);

  const [log, setLog] = useState([
    "BATTLE ROYALE STARTED!",
    "7 players have entered the arena.",
    "Choose your action.",
  ]);

  const [phase, setPhase] = useState("battle");
  const [factionChoice, setFactionChoice] = useState(false);
  const [betrayalChoice, setBetrayalChoice] = useState(false);

  const [winner, setWinner] = useState(null);
  const [ending, setEnding] = useState(null);

  const alivePlayers = useMemo(
    () => players.filter((player) => player.alive),
    [players]
  );

  const addLog = (message) => {
    setLog((prev) => [message, ...prev].slice(0, 12));
  };

  const resetGame = () => {
    setPlayers(createPlayers());
    setRound(1);
    setAttacksLeft(MAX_ATTACKS);
    setHealsLeft(MAX_HEALS);
    setSelectedPlayer(null);
    setSelectedTarget(null);
    setPhase("battle");
    setFactionChoice(false);
    setBetrayalChoice(false);
    setWinner(null);
    setEnding(null);
    setLog([
      "NEW BATTLE STARTED!",
      "7 players have entered the arena.",
    ]);
  };

  const selectPlayer = (id) => {
    if (phase !== "battle") return;

    const player = players.find((p) => p.id === id);

    if (!player?.alive) return;

    setSelectedPlayer(id);
    setSelectedTarget(null);

    addLog(`${player.name} is ready to make a move.`);
  };

  const selectTarget = (id) => {
    if (!selectedPlayer || phase !== "battle") return;

    if (id === selectedPlayer) {
      addLog("You cannot target yourself.");
      return;
    }

    const target = players.find((p) => p.id === id);

    if (!target?.alive) return;

    setSelectedTarget(id);
  };

  const performAction = (action) => {
    if (!selectedPlayer || !selectedTarget) {
      addLog("SELECT A PLAYER AND TARGET FIRST!");
      return;
    }

    const attacker = players.find((p) => p.id === selectedPlayer);
    const target = players.find((p) => p.id === selectedTarget);

    if (!attacker || !target || !attacker.alive || !target.alive) {
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

    /*
      5% chance of action inversion:
      attack -> heal
      heal -> attack
    */
    let actualAction = action;

    if (Math.random() < 0.05) {
      actualAction = action === "attack" ? "heal" : "attack";

      addLog(
        `LUCK EVENT! ${attacker.name}'s action was reversed!`
      );
    }

    let nextPlayers = players.map((player) => ({ ...player }));

    const attackerIndex = nextPlayers.findIndex(
      (p) => p.id === selectedPlayer
    );

    const targetIndex = nextPlayers.findIndex(
      (p) => p.id === selectedTarget
    );

    if (actualAction === "attack") {
      const damage = ATTACK_DAMAGE;

      nextPlayers[targetIndex].hp -= damage;
      nextPlayers[attackerIndex].damageDealt += damage;

      setAttacksLeft((prev) => prev - 1);

      addLog(
        `${attacker.name} attacked ${target.name} for ${damage} damage!`
      );
    } else {
      const before = nextPlayers[targetIndex].hp;

      nextPlayers[targetIndex].hp = Math.min(
        STARTING_HP,
        nextPlayers[targetIndex].hp + HEAL_AMOUNT
      );

      const healed =
        nextPlayers[targetIndex].hp - before;

      nextPlayers[attackerIndex].damageHealed += healed;

      setHealsLeft((prev) => prev - 1);

      addLog(
        `${attacker.name} healed ${target.name} by ${healed}!`
      );
    }

    /*
      Death check
    */
    nextPlayers = nextPlayers.map((player) => {
      if (player.hp <= 0) {
        addLog(`${player.name} has been ELIMINATED!`);

        return {
          ...player,
          hp: 0,
          alive: false,
        };
      }

      return player;
    });

    setPlayers(nextPlayers);

    setSelectedPlayer(null);
    setSelectedTarget(null);

    /*
      Check if only two players remain.
    */
    const alive = nextPlayers.filter((p) => p.alive);

    if (alive.length <= 2) {
      if (alive.length === 1) {
        determineWinner(alive[0], nextPlayers);
      } else if (alive.length === 2) {
        setPhase("final");
        addLog("ONLY TWO PLAYERS REMAIN!");

        setTimeout(() => {
          finalBattle(alive, nextPlayers);
        }, 700);
      }

      return;
    }

    /*
      Every 3 rounds, give faction/betrayal opportunity.
    */
    if ((round + 1) % 3 === 0) {
      setFactionChoice(true);
      setPhase("faction");
      addLog("FACTION DECISION AVAILABLE!");
      return;
    }

    /*
      Advance round after every action.
    */
    setRound((prev) => prev + 1);
  };

  const finalBattle = (alive, currentPlayers) => {
    if (alive.length !== 2) return;

    const [p1, p2] = alive;

    /*
      Aravinda Sametha:
      A player can choose peace instead of fighting.
      Also if one player leaves, the other gets peace ending.
    */
    const loserIndex = Math.random() < 0.5 ? 0 : 1;

    const loser = alive[loserIndex];
    const winnerCandidate = alive[loserIndex === 0 ? 1 : 0];

    /*
      10% Seema Shastry ending.
    */
    if (Math.random() < 0.1) {
      determineEnding(
        loser,
        "Seema Shastry Ending",
        currentPlayers
      );
      return;
    }

    /*
      Marayada Ramanna:
      least damage dealt + highest healing.
    */
    const sorted = [...alive].sort((a, b) => {
      const scoreA =
        a.damageHealed * 2 - a.damageDealt;

      const scoreB =
        b.damageHealed * 2 - b.damageDealt;

      return scoreB - scoreA;
    });

    const peacefulWinner = sorted[0];

    if (
      peacefulWinner.id === winnerCandidate.id &&
      peacefulWinner.damageHealed > peacefulWinner.damageDealt
    ) {
      determineEnding(
        peacefulWinner,
        "Marayada Ramanna Ending",
        currentPlayers
      );
      return;
    }

    determineEnding(
      winnerCandidate,
      "Indra Sena Reddy Ending",
      currentPlayers
    );
  };

  const determineWinner = (player, currentPlayers) => {
    /*
      Last survivor is normally the winner.
    */
    determineEnding(
      player,
      "Indra Sena Reddy Ending",
      currentPlayers
    );
  };

  const determineEnding = (
    player,
    endingName,
    currentPlayers
  ) => {
    setWinner(player);
    setEnding(endingName);
    setPhase("finished");

    addLog(`${endingName.toUpperCase()}!`);
    addLog(`${player.name} IS THE WINNER!`);
  };

  const chooseFaction = (faction) => {
    const updated = players.map((player) => {
      if (!player.alive) return player;

      return {
        ...player,
        faction:
          faction === "random"
            ? Math.random() > 0.5
              ? "SUN"
              : "MOON"
            : faction,
      };
    });

    setPlayers(updated);
    setFactionChoice(false);
    setPhase("battle");

    addLog("FACTIONS HAVE BEEN FORMED!");
    setRound((prev) => prev + 1);
  };

  const triggerBetrayal = () => {
    const alive = players.filter((p) => p.alive);

    if (alive.length < 4) {
      setPhase("battle");
      return;
    }

    const betrayer = alive[random(alive.length)];

    const sameFaction = alive.filter(
      (p) => p.faction === betrayer.faction && p.id !== betrayer.id
    );

    if (sameFaction.length === 0) {
      addLog(`${betrayer.name} has nobody to betray!`);
      setPhase("battle");
      return;
    }

    const victim =
      sameFaction[random(sameFaction.length)];

    const updated = players.map((player) => {
      if (player.id === victim.id) {
        return {
          ...player,
          faction:
            player.faction === "SUN"
              ? "MOON"
              : "SUN",
        };
      }

      return player;
    });

    setPlayers(updated);

    addLog(
      `${betrayer.name} BETRAYED ${victim.name}!`
    );

    setBetrayalChoice(false);
    setPhase("battle");
  };

  const peacefulEnd = () => {
    if (alivePlayers.length !== 2) return;

    const peacefulWinner =
      alivePlayers.find(
        (player) => player.id !== selectedPlayer
      ) || alivePlayers[0];

    determineEnding(
      peacefulWinner,
      "Aravinda Sametha Ending",
      players
    );
  };

  const forceFinalAttack = () => {
    if (alivePlayers.length !== 2) return;

    const [p1, p2] = alivePlayers;

    const attacker =
      Math.random() > 0.5 ? p1 : p2;

    const target =
      attacker.id === p1.id ? p2 : p1;

    const updated = players.map((player) => ({
      ...player,
    }));

    const targetIndex = updated.findIndex(
      (p) => p.id === target.id
    );

    updated[targetIndex].hp -= ATTACK_DAMAGE;

    updated[
      updated.findIndex((p) => p.id === attacker.id)
    ].damageDealt += ATTACK_DAMAGE;

    if (updated[targetIndex].hp <= 0) {
      updated[targetIndex].hp = 0;
      updated[targetIndex].alive = false;
    }

    setPlayers(updated);

    const remaining = updated.filter((p) => p.alive);

    if (remaining.length === 1) {
      determineWinner(remaining[0], updated);
    }
  };

  /*
    Random betrayal opportunity after faction rounds.
  */
  useEffect(() => {
    if (
      phase === "battle" &&
      round > 3 &&
      round % 3 === 0 &&
      alivePlayers.length > 2
    ) {
      if (Math.random() < 0.35) {
        setBetrayalChoice(true);
        setPhase("betrayal");
        addLog("BETRAYAL OPPORTUNITY!");
      }
    }
  }, [round]);

  return (
    <div className="battle-screen">
      <div className="pixel-sun" />

      <div className="battle-cloud cloud-a" />
      <div className="battle-cloud cloud-b" />

      <div className="battle-header">
        <div>
          <div className="game-logo">
            BATTLE ROYALE
          </div>
          <div className="game-subtitle">
            7 PLAYERS • ONE SURVIVOR
          </div>
        </div>

        <div className="round-box">
          <span>ROUND</span>
          <strong>{round}</strong>
        </div>
      </div>

      <main className="battle-layout">
        <section className="players-panel">
          <div className="section-title">
            PLAYERS
          </div>

          <div className="players-grid">
            {players.map((player) => (
              <div
                key={player.id}
                className={`player-card ${
                  !player.alive ? "dead" : ""
                } ${
                  selectedPlayer === player.id
                    ? "selected"
                    : ""
                } ${
                  selectedTarget === player.id
                    ? "targeted"
                    : ""
                }`}
                onClick={() =>
                  player.alive
                    ? selectPlayer(player.id)
                    : null
                }
              >
                <div
                  className="player-avatar"
                  style={{
                    background: player.color,
                  }}
                >
                  {player.name.charAt(0)}
                </div>

                <div className="player-info">
                  <div className="player-name">
                    {player.name}
                  </div>

                  <div className="hp-bar">
                    <div
                      className="hp-fill"
                      style={{
                        width: `${Math.max(
                          0,
                          player.hp
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="player-stats">
                    <span>
                      HP {player.hp}
                    </span>

                    {player.faction && (
                      <span>
                        {player.faction}
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
            ))}
          </div>
        </section>

        <section className="arena-panel">
          <div className="arena-title">
            ARENA
          </div>

          <div className="arena">
            <div className="arena-ground" />

            {players.map((player, index) => {
              const positions = [
                [50, 15],
                [22, 30],
                [78, 30],
                [15, 62],
                [85, 62],
                [32, 78],
                [68, 78],
              ];

              const [x, y] = positions[index];

              return (
                <button
                  key={player.id}
                  className={`arena-player ${
                    !player.alive ? "arena-dead" : ""
                  } ${
                    selectedPlayer === player.id
                      ? "arena-selected"
                      : ""
                  } ${
                    selectedTarget === player.id
                      ? "arena-target"
                      : ""
                  }`}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    "--player-color": player.color,
                  }}
                  onClick={() => {
                    if (!player.alive) return;

                    if (!selectedPlayer) {
                      selectPlayer(player.id);
                    } else {
                      selectTarget(player.id);
                    }
                  }}
                >
                  <span>
                    {player.name.charAt(0)}
                  </span>

                  <small>{player.hp}</small>
                </button>
              );
            })}
          </div>

          <div className="selection-info">
            <div>
              <span>PLAYER</span>
              <strong>
                {players.find(
                  (p) => p.id === selectedPlayer
                )?.name || "NONE"}
              </strong>
            </div>

            <div>
              <span>TARGET</span>
              <strong>
                {players.find(
                  (p) => p.id === selectedTarget
                )?.name || "NONE"}
              </strong>
            </div>
          </div>

          <div className="action-buttons">
            <button
              className="attack-button"
              disabled={phase !== "battle"}
              onClick={() => performAction("attack")}
            >
              ⚔ ATTACK
              <small>{attacksLeft} LEFT</small>
            </button>

            <button
              className="heal-button"
              disabled={phase !== "battle"}
              onClick={() => performAction("heal")}
            >
              ♥ HEAL
              <small>{healsLeft} LEFT</small>
            </button>
          </div>

          <div className="peace-button-container">
            <button
              className="peace-button"
              disabled={alivePlayers.length !== 2}
              onClick={peacefulEnd}
            >
              🕊 STOP FIGHTING
            </button>
          </div>
        </section>

        <aside className="side-panel">
          <div className="section-title">
            BATTLE LOG
          </div>

          <div className="battle-log">
            {log.map((message, index) => (
              <div
                className="log-line"
                key={`${message}-${index}`}
              >
                <span>&gt;</span>
                {message}
              </div>
            ))}
          </div>

          <div className="resource-box">
            <div>
              <span>ATTACKS</span>
              <strong>{attacksLeft}/20</strong>
            </div>

            <div>
              <span>HEALS</span>
              <strong>{healsLeft}/10</strong>
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
            onClick={resetGame}
          >
            RESTART GAME
          </button>
        </aside>
      </main>

      {/* FACTION POPUP */}
      {factionChoice && (
        <div className="game-overlay">
          <div className="game-popup">
            <button
              className="popup-x"
              onClick={() => {
                setFactionChoice(false);
                setPhase("battle");
              }}
            >
              X
            </button>

            <h2>CHOOSE FACTION</h2>

            <p>
              The battle has reached a turning point.
              Choose your allegiance.
            </p>

            <div className="faction-buttons">
              <button
                className="sun-faction"
                onClick={() => chooseFaction("SUN")}
              >
                ☀ SUN FACTION
              </button>

              <button
                className="moon-faction"
                onClick={() => chooseFaction("MOON")}
              >
                ☾ MOON FACTION
              </button>

              <button
                className="random-faction"
                onClick={() => chooseFaction("random")}
              >
                ? RANDOM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BETRAYAL POPUP */}
      {betrayalChoice && (
        <div className="game-overlay">
          <div className="game-popup betrayal-popup">
            <h2>BETRAYAL!</h2>

            <p>
              A chance to betray your current faction
              has appeared.
            </p>

            <button
              className="betray-button"
              onClick={triggerBetrayal}
            >
              BETRAY
            </button>

            <button
              className="ignore-button"
              onClick={() => {
                setBetrayalChoice(false);
                setPhase("battle");
              }}
            >
              STAY LOYAL
            </button>
          </div>
        </div>
      )}

      {/* FINAL TWO */}
      {phase === "final" && (
        <div className="game-overlay">
          <div className="game-popup">
            <h2>FINAL TWO!</h2>

            <p>
              Only two warriors remain.
              They must decide their fate.
            </p>

            <button
              className="final-attack-button"
              onClick={forceFinalAttack}
            >
              ⚔ FIGHT!
            </button>

            <button
              className="peace-button large"
              onClick={peacefulEnd}
            >
              🕊 GIVE UP & MAKE PEACE
            </button>
          </div>
        </div>
      )}

      {/* WINNER */}
      {phase === "finished" && winner && (
        <div className="game-overlay winner-overlay">
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
                <span>DAMAGE DEALT</span>
                <strong>
                  {winner.damageDealt}
                </strong>
              </div>

              <div>
                <span>HEALED</span>
                <strong>
                  {winner.damageHealed}
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

export default BattleRoyale;