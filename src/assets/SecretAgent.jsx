import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./SecretAgent.css";

const REQUIRED_PLAYERS = 7;
const NUM_AGENTS = 2;

const KILL_INTERVAL_SECONDS = 4 * 60;
const FAST_ENDING_SECONDS = 10 * 60;

const COLORS = [
  "#ff6b6b",
  "#6ba8ff",
  "#7de89a",
  "#ffcf5c",
  "#c78cff",
  "#ff8fc7",
  "#5ce1e6",
];

// Each sentence is exactly 15 words: 3 words for each of the 5 civilians.
// The decoy bank supplies exactly 6 words: 3 for each of the 2 agents.
const CASES = [
  {
    sentence:
      "THE TREASURE IS HIDDEN BENEATH THE OLD BANYAN TREE NEAR THE RIVER BRIDGE AT MIDNIGHT",
    decoys: ["GOLD", "SNAKE", "TEMPLE", "WHISPER", "SHADOW", "LANTERN"],
  },
  {
    sentence:
      "MEET ME AT THE ABANDONED FACTORY BEHIND THE RAILWAY STATION BEFORE THE CLOCK STRIKES TEN",
    decoys: ["MIRROR", "SECRET", "ENGINE", "VELVET", "CIPHER", "ECHO"],
  },
  {
    sentence:
      "THE PASSWORD TO THE VAULT IS WRITTEN INSIDE THE RED BOOK ON THE THIRD SHELF",
    decoys: ["GHOST", "IRON", "STORM", "VIOLET", "ANCHOR", "EMBER"],
  },
];

function shuffled(array) {
  const copy = [...array];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

function normalize(text) {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function setupGame(names) {
  const caseFile = CASES[Math.floor(Math.random() * CASES.length)];

  const order = shuffled(
    Array.from({ length: REQUIRED_PLAYERS }, (_, i) => i)
  );

  const agentIndexes = new Set(order.slice(0, NUM_AGENTS));

  const civilianWords = shuffled(caseFile.sentence.split(" "));
  const agentWords = shuffled(caseFile.decoys);

  let civilianCursor = 0;
  let agentCursor = 0;

  const players = names.map((name, index) => {
    const isAgent = agentIndexes.has(index);

    const words = isAgent
      ? agentWords.slice(agentCursor, agentCursor + 3)
      : civilianWords.slice(civilianCursor, civilianCursor + 3);

    if (isAgent) {
      agentCursor += 3;
    } else {
      civilianCursor += 3;
    }

    return {
      id: index + 1,
      name,
      role: isAgent ? "agent" : "civilian",
      alive: true,
      flipped: false,
      words: words.map((word) => ({ word, revealed: false })),
    };
  });

  return { caseFile, players };
}

export default function SecretAgent() {
  const location = useLocation();
  const navigate = useNavigate();

  const room = location.state?.room;

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

  return <SecretAgentGame names={names} />;
}

function NotEnoughPlayers({ joined, onBack }) {
  return (
    <div className="agent-screen agent-gate">
      <div className="agent-popup">
        <h2>NEED {REQUIRED_PLAYERS} PLAYERS</h2>

        <p>
          Secret Agent only starts with exactly {REQUIRED_PLAYERS} players.
          <br />
          {joined}/{REQUIRED_PLAYERS} have joined so far.
        </p>

        <button className="agent-reset-button" onClick={onBack}>
          BACK TO LOBBY
        </button>
      </div>
    </div>
  );
}

function SecretAgentGame({ names }) {
  const [game, setGame] = useState(() => setupGame(names));
  const [logs, setLogs] = useState([
    "SECRET AGENT MISSION STARTED!",
    "2 agents are hiding among 5 civilians.",
    "Tap your card to view your role and words.",
  ]);

  const [killTimer, setKillTimer] = useState(KILL_INTERVAL_SECONDS);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);

  const [showKillPopup, setShowKillPopup] = useState(false);
  const [guess, setGuess] = useState("");

  const [phase, setPhase] = useState("playing");
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [ending, setEnding] = useState(null);
  const [outcome, setOutcome] = useState(null);

  const players = game.players;
  const aliveCivilians = players.filter(
    (p) => p.role === "civilian" && p.alive
  );
  const aliveAgents = players.filter((p) => p.role === "agent" && p.alive);

  const addLog = (message) => {
    setLogs((current) => [message, ...current].slice(0, 15));
  };

  const resetGame = () => {
    setGame(setupGame(names));
    setKillTimer(KILL_INTERVAL_SECONDS);
    setElapsed(0);
    setPaused(false);
    setShowKillPopup(false);
    setGuess("");
    setPhase("playing");
    setEnding(null);
    setOutcome(null);

    setLogs([
      "NEW MISSION STARTED!",
      "2 agents are hiding among 5 civilians.",
      "Tap your card to view your role and words.",
    ]);
  };

  // Real-time countdown to the next sniper kill, plus the overall mission clock.
  useEffect(() => {
    if (phase !== "playing" || paused || showKillPopup) return;

    const interval = setInterval(() => {
      setElapsed((value) => value + 1);

      setKillTimer((value) => {
        if (value <= 1) {
          setShowKillPopup(true);
          addLog("THE AGENTS ARE TAKING AIM!");
          return 0;
        }

        return value - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, paused, showKillPopup]);

  const flipCard = (id) => {
    setGame((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === id
          ? { ...player, flipped: !player.flipped }
          : player
      ),
    }));
  };

  const revealWord = (playerId, wordIndex) => {
    if (phase !== "playing") return;

    const player = players.find((p) => p.id === playerId);
    if (!player?.alive) return;

    setGame((current) => ({
      ...current,
      players: current.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              words: p.words.map((w, index) =>
                index === wordIndex ? { ...w, revealed: true } : w
              ),
            }
          : p
      ),
    }));

    addLog(`${player.name} revealed a word.`);
  };

  const killPlayer = (targetId) => {
    const target = players.find((p) => p.id === targetId);
    if (!target?.alive) return;

    const updatedPlayers = players.map((player) =>
      player.id === targetId ? { ...player, alive: false } : player
    );

    setGame((current) => ({ ...current, players: updatedPlayers }));

    addLog(`${target.name} WAS ELIMINATED BY THE AGENTS!`);

    setShowKillPopup(false);
    setKillTimer(KILL_INTERVAL_SECONDS);

    const remainingCivilians = updatedPlayers.filter(
      (p) => p.role === "civilian" && p.alive
    );

    if (remainingCivilians.length === 0) {
      finishGame(
        "agents",
        elapsed < FAST_ENDING_SECONDS ? "Dhurandhar Ending" : "The Long Game Ending"
      );
    }
  };

  const submitGuess = () => {
    if (phase !== "playing" || !guess.trim()) return;

    const correct = normalize(guess) === normalize(game.caseFile.sentence);

    if (correct) {
      finishGame(
        "civilians",
        elapsed < FAST_ENDING_SECONDS ? "Goodachari Ending" : "Slow and Steady Ending"
      );
      return;
    }

    addLog(`INCORRECT GUESS: "${guess.toUpperCase()}"`);
    setGuess("");
  };

  const finishGame = (winningSide, endingName) => {
    setOutcome(winningSide);
    setEnding(endingName);
    setPhase("finished");

    addLog(`${endingName.toUpperCase()}!`);
    addLog(
      winningSide === "agents"
        ? "THE AGENTS HAVE SILENCED EVERYONE!"
        : "THE CIVILIANS CRACKED THE CASE!"
    );
  };

  const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  };

  return (
    <div className="agent-screen">
      <div className="agent-pixel-moon" />
      <div className="agent-cloud cloud-a" />
      <div className="agent-cloud cloud-b" />

      {/* HEADER */}

      <header className="agent-header">
        <div>
          <h1 className="agent-logo">SECRET AGENT</h1>
          <p className="agent-subtitle">GAMES FOR GROUPS</p>
        </div>

        <div className="agent-timers">
          <div className="timer-box">
            <span>MISSION TIME</span>
            <strong>{formatTime(elapsed)}</strong>
          </div>

          <div className={`timer-box ${killTimer <= 30 ? "danger" : ""}`}>
            <span>NEXT SNIPE</span>
            <strong>{formatTime(killTimer)}</strong>
          </div>
        </div>
      </header>

      {/* MAIN */}

      <main className="agent-layout">
        {/* PLAYERS */}

        <section className="agent-players-panel">
          <div className="agent-section-title">AGENTS ROSTER</div>

          <div className="agent-players-grid">
            {players.map((player, index) => (
              <div
                key={player.id}
                className={`agent-card ${!player.alive ? "dead" : ""}`}
              >
                <div
                  className="agent-avatar"
                  style={{ background: COLORS[index] }}
                >
                  {player.name.charAt(0).toUpperCase()}
                </div>

                <div className="agent-info">
                  <div className="agent-name">{player.name}</div>

                  {!player.alive && (
                    <div className="agent-status-dead">ELIMINATED</div>
                  )}

                  {player.alive && !player.flipped && (
                    <button
                      className="agent-flip-button"
                      onClick={() => flipCard(player.id)}
                    >
                      TAP TO VIEW ROLE
                    </button>
                  )}

                  {player.alive && player.flipped && (
                    <div className="agent-role-reveal">
                      <span
                        className={`agent-role-tag ${player.role}`}
                      >
                        {player.role === "agent" ? "AGENT" : "CIVILIAN"}
                      </span>

                      <div className="agent-word-row">
                        {player.words.map((w, wordIndex) => (
                          <button
                            key={wordIndex}
                            className={`agent-word-chip ${
                              w.revealed ? "revealed" : ""
                            }`}
                            disabled={w.revealed}
                            onClick={() =>
                              revealWord(player.id, wordIndex)
                            }
                          >
                            {w.revealed ? w.word : "?????"}
                          </button>
                        ))}
                      </div>

                      <button
                        className="agent-flip-button hide"
                        onClick={() => flipCard(player.id)}
                      >
                        HIDE
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CASE BOARD */}

        <section className="agent-case-panel">
          <div className="agent-section-title">THE CASE</div>

          <p className="agent-case-hint">
            Piece together the revealed words below into the secret
            sentence. Some words are decoys planted by the agents.
          </p>

          <div className="agent-word-pool">
            {players.flatMap((player) =>
              player.words
                .filter((w) => w.revealed)
                .map((w, i) => (
                  <span
                    className="agent-pool-word"
                    key={`${player.id}-${i}`}
                  >
                    {w.word}
                  </span>
                ))
            )}

            {players.every((p) => p.words.every((w) => !w.revealed)) && (
              <span className="agent-pool-empty">
                No words revealed yet.
              </span>
            )}
          </div>

          <div className="agent-guess-row">
            <input
              className="agent-guess-input"
              placeholder="Type the full secret sentence..."
              value={guess}
              disabled={phase !== "playing"}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitGuess()}
            />

            <button
              className="agent-guess-button"
              disabled={phase !== "playing"}
              onClick={submitGuess}
            >
              SUBMIT GUESS
            </button>
          </div>

          <div className="agent-controls-row">
            <button
              className="agent-pause-button"
              onClick={() => setPaused((value) => !value)}
              disabled={phase !== "playing"}
            >
              {paused ? "▶ RESUME TIMERS" : "⏸ PAUSE TIMERS"}
            </button>
          </div>
        </section>

        {/* LOG */}

        <aside className="agent-side-panel">
          <div className="agent-section-title">MISSION LOG</div>

          <div className="agent-log">
            {logs.map((message, index) => (
              <div className="agent-log-line" key={`${message}-${index}`}>
                <span>&gt;</span>
                {message}
              </div>
            ))}
          </div>

          <div className="agent-resource-box">
            <div>
              <span>CIVILIANS ALIVE</span>
              <strong>{aliveCivilians.length}/5</strong>
            </div>

            <div>
              <span>AGENTS ALIVE</span>
              <strong>{aliveAgents.length}/2</strong>
            </div>
          </div>

          <button
            className="agent-reset-button"
            onClick={() => setConfirmingReset(true)}
          >
            RESTART MISSION
          </button>
        </aside>
      </main>

      {/* RESTART CONFIRMATION */}

      {confirmingReset && (
        <div className="agent-overlay">
          <div className="agent-popup">
            <h2>RESTART MISSION?</h2>
            <p>This will end the current mission and start a new one.</p>

            <div className="agent-confirm-grid">
              <button
                className="agent-confirm-yes"
                onClick={() => {
                  setConfirmingReset(false);
                  resetGame();
                }}
              >
                YES, RESTART
              </button>

              <button
                className="agent-confirm-no"
                onClick={() => setConfirmingReset(false)}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KILL POPUP */}

      {showKillPopup && (
        <div className="agent-overlay">
          <div className="agent-popup">
            <h2>THE AGENTS STRIKE</h2>

            <p>Choose a civilian to eliminate.</p>

            <div className="agent-kill-targets">
              {aliveCivilians.map((civilian) => (
                <button
                  key={civilian.id}
                  className="agent-kill-target"
                  onClick={() => killPlayer(civilian.id)}
                >
                  {civilian.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* WINNER */}

      {phase === "finished" && (
        <div className="agent-overlay">
          <div className="agent-winner-popup">
            <div className="agent-winner-icon">
              {outcome === "agents" ? "🕶" : "🕵"}
            </div>

            <div className="agent-ending-label">{ending}</div>

            <h1>
              {outcome === "agents" ? "AGENTS WIN" : "CIVILIANS WIN"}
            </h1>

            <p>
              {outcome === "agents"
                ? "Every civilian was silenced."
                : "The secret sentence was cracked!"}
            </p>

            <div className="agent-solution">
              <span>THE SECRET SENTENCE WAS</span>
              <strong>{game.caseFile.sentence}</strong>
            </div>

            <div className="agent-reveal-roles">
              {players
                .filter((p) => p.role === "agent")
                .map((p) => (
                  <span key={p.id}>{p.name} was an AGENT</span>
                ))}
            </div>

            <button className="agent-restart-winning" onClick={resetGame}>
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}

      <div className="agent-grass-floor" />
    </div>
  );
}
