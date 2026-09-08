import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./SecretAgent.css";

const MIN_PLAYERS = 6;
const MAX_PLAYERS = 7;
// The case data is hardcoded for exactly 5 civilians (15-word sentences,
// 3 words each) -- so supporting a 6th player means dropping to 1 agent
// instead of 2, not stretching the civilian count.
const NUM_CIVILIANS = 5;

// Tuned by simulating 100 games per player count (see the "cool time"
// design note below) -- 60s keeps a 7-player mission (2 agents) close to a
// 50/50 outcome and a 6-player mission (1 agent, inherently an uphill
// fight) still winnable, while keeping real games in the 2-5 minute range
// instead of the old design's much slower ~10 minute pace.
const KILL_INTERVAL_SECONDS = 60;
// How long the group must wait after a vote resolves before calling
// another one -- long enough to actually talk, short enough that a 2-5
// minute game gets a real handful of vote attempts.
const VOTE_COOLDOWN_SECONDS = 90;
// Games now average 2-5 minutes (not the old design's ~10), so the
// fast/slow ending split is scaled down to match -- otherwise every game
// would land in the "fast" bucket and the "slow" flavor text would never
// fire.
const FAST_ENDING_SECONDS = 150;

// --- Design note: choosing KILL_INTERVAL_SECONDS ---
// Modeled each mission as: civilians have a small constant per-minute
// chance of piecing together the sentence (all words are visible from the
// start now, so this is deduction speed, not "waiting for reveals");
// agents kill one civilian every KILL_INTERVAL_SECONDS; a vote round fires
// every VOTE_COOLDOWN_SECONDS with an accuracy better than blind chance
// (decoy words and behavior give real tells) but not perfect. Simulating
// 100 games per candidate interval across both the 6-player (1 agent) and
// 7-player (2 agent) configurations, faster than ~45s produced unrealistic
// <90-second games (no time for a room to actually talk), while slower
// than ~120s let civilians' vote advantage dominate almost every game.
// 60s was the best shared compromise: 7-player lands near 50/50, 6-player
// stays a real (if uphill) fight for the lone agent, and both configs keep
// games in a human, several-minute pace.

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
  const numAgents = names.length - NUM_CIVILIANS;

  const order = shuffled(
    Array.from({ length: names.length }, (_, i) => i)
  );

  const agentIndexes = new Set(order.slice(0, numAgents));

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
      // "agent" (sniped, silenced) | "vote" (voted out) | null (still alive)
      eliminatedBy: null,
      words,
    };
  });

  return { caseFile, players, numAgents };
}

export default function SecretAgent() {
  const location = useLocation();
  const navigate = useNavigate();

  const room = location.state?.room;

  if (room && (room.players.length < MIN_PLAYERS || room.players.length > MAX_PLAYERS)) {
    return (
      <NotEnoughPlayers
        joined={room.players.length}
        onBack={() => navigate("/create-room")}
      />
    );
  }

  const names = room
    ? room.players.map((player) => player.nickname)
    : Array.from({ length: MAX_PLAYERS }, (_, i) => `Player ${i + 1}`);

  return <SecretAgentGame names={names} />;
}

function NotEnoughPlayers({ joined, onBack }) {
  return (
    <div className="agent-screen agent-gate">
      <div className="agent-popup">
        <h2>NEED {MIN_PLAYERS}-{MAX_PLAYERS} PLAYERS</h2>

        <p>
          Secret Agent needs {MIN_PLAYERS}-{MAX_PLAYERS} players.
          <br />
          {joined}/{MIN_PLAYERS}-{MAX_PLAYERS} have joined so far.
        </p>

        <button className="agent-reset-button" onClick={onBack}>
          BACK TO LOBBY
        </button>
      </div>
    </div>
  );
}

function SecretAgentGame({ names }) {
  const numAgents = names.length - NUM_CIVILIANS;
  const [game, setGame] = useState(() => setupGame(names));
  const [logs, setLogs] = useState([
    "SECRET AGENT MISSION STARTED!",
    `${numAgents} agent${numAgents === 1 ? " is" : "s are"} hiding among ${NUM_CIVILIANS} civilians.`,
    "Everyone's words are shown below their name -- nobody's role is ever shown. Talk it out, then guess the sentence or vote someone out.",
  ]);

  const [killTimer, setKillTimer] = useState(KILL_INTERVAL_SECONDS);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);

  const [showKillPopup, setShowKillPopup] = useState(false);
  const [killNotice, setKillNotice] = useState(null);
  const [guess, setGuess] = useState("");

  // "playing" | "voting" | "finished"
  const [phase, setPhase] = useState("playing");
  // Starts at 0 (not VOTE_COOLDOWN_SECONDS) -- the cooldown only applies
  // *between* vote rounds, so the group can call the very first vote
  // whenever they're ready instead of being blocked for a minute and a
  // half at the start of every mission.
  const [voteCooldown, setVoteCooldown] = useState(0);
  const [voteQueue, setVoteQueue] = useState([]);
  const [voteQueueIndex, setVoteQueueIndex] = useState(0);
  const [votes, setVotes] = useState({});

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [ending, setEnding] = useState(null);
  const [outcome, setOutcome] = useState(null);

  const players = game.players;
  const alivePlayers = players.filter((p) => p.alive);
  const aliveCivilians = players.filter((p) => p.role === "civilian" && p.alive);
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
    setKillNotice(null);
    setGuess("");
    setPhase("playing");
    setVoteCooldown(0);
    setVoteQueue([]);
    setVoteQueueIndex(0);
    setVotes({});
    setEnding(null);
    setOutcome(null);

    setLogs([
      "NEW MISSION STARTED!",
      `${numAgents} agent${numAgents === 1 ? " is" : "s are"} hiding among ${NUM_CIVILIANS} civilians.`,
      "Everyone's words are shown below their name -- nobody's role is ever shown. Talk it out, then guess the sentence or vote someone out.",
    ]);
  };

  // Real-time countdown to the next sniper kill and the next available
  // vote, plus the overall mission clock. All pause together whenever
  // something needs the group's full attention (a kill or a vote).
  useEffect(() => {
    if (phase !== "playing" || paused || showKillPopup || killNotice) return;

    const interval = setInterval(() => {
      setElapsed((value) => value + 1);
      setVoteCooldown((value) => (value > 0 ? value - 1 : 0));

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
  }, [phase, paused, showKillPopup, killNotice]);

  const killPlayer = (targetId) => {
    const target = players.find((p) => p.id === targetId);
    if (!target?.alive) return;

    const updatedPlayers = players.map((player) =>
      player.id === targetId ? { ...player, alive: false, eliminatedBy: "agent" } : player
    );

    setGame((current) => ({ ...current, players: updatedPlayers }));

    addLog(`${target.name} WAS ELIMINATED BY THE AGENTS!`);

    setShowKillPopup(false);
    setKillTimer(KILL_INTERVAL_SECONDS);
    setKillNotice(target.name);

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

  const startVote = () => {
    if (phase !== "playing" || voteCooldown > 0) return;

    setVoteQueue(alivePlayers.map((p) => p.id));
    setVoteQueueIndex(0);
    setVotes({});
    setPhase("voting");
    addLog("A VOTE HAS BEEN CALLED -- EVERYONE WILL VOTE IN TURN.");
  };

  const castVote = (targetId) => {
    const voterId = voteQueue[voteQueueIndex];
    if (voterId === undefined) return;

    const nextVotes = { ...votes, [voterId]: targetId };
    setVotes(nextVotes);

    if (voteQueueIndex + 1 < voteQueue.length) {
      setVoteQueueIndex((index) => index + 1);
    } else {
      resolveVote(nextVotes);
    }
  };

  const resolveVote = (finalVotes) => {
    const tally = {};
    Object.values(finalVotes).forEach((targetId) => {
      tally[targetId] = (tally[targetId] || 0) + 1;
    });

    const entries = Object.entries(tally);
    let eliminatedId = null;

    if (entries.length > 0) {
      entries.sort((a, b) => b[1] - a[1]);
      const topCount = entries[0][1];
      const topEntries = entries.filter(([, count]) => count === topCount);
      if (topEntries.length === 1) eliminatedId = Number(topEntries[0][0]);
    }

    setPhase("playing");
    setVoteCooldown(VOTE_COOLDOWN_SECONDS);
    setVoteQueue([]);
    setVoteQueueIndex(0);
    setVotes({});

    if (eliminatedId === null) {
      addLog("THE VOTE WAS TIED -- NO ONE WAS ELIMINATED.");
      return;
    }

    const target = players.find((p) => p.id === eliminatedId);
    const updatedPlayers = players.map((p) =>
      p.id === eliminatedId ? { ...p, alive: false, eliminatedBy: "vote" } : p
    );

    setGame((current) => ({ ...current, players: updatedPlayers }));

    addLog(
      `${target.name} WAS VOTED OUT -- THEY ${target.role === "agent" ? "WERE" : "were NOT".toUpperCase()} AN AGENT!`
    );

    const remainingAgents = updatedPlayers.filter((p) => p.role === "agent" && p.alive);
    const remainingCivilians = updatedPlayers.filter((p) => p.role === "civilian" && p.alive);

    if (remainingAgents.length === 0) {
      finishGame(
        "civilians",
        elapsed < FAST_ENDING_SECONDS ? "Goodachari Ending" : "Slow and Steady Ending"
      );
    } else if (remainingCivilians.length === 0) {
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

  const currentVoter = phase === "voting" ? players.find((p) => p.id === voteQueue[voteQueueIndex]) : null;

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

          <div className={`timer-box ${killTimer <= 15 ? "danger" : ""}`}>
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
                    <div className="agent-status-dead">
                      {player.eliminatedBy === "agent" ? "🔇 SILENCED" : "OUT (VOTED)"}
                    </div>
                  )}

                  <div className="agent-word-row">
                    {player.words.map((word, wordIndex) => (
                      <span key={wordIndex} className="agent-word-chip revealed">
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CASE BOARD */}

        <section className="agent-case-panel">
          <div className="agent-section-title">THE CASE</div>

          <p className="agent-case-hint">
            Every word from every player is already on the board below --
            piece them into the secret sentence. Some are decoys planted by
            the agents. Nobody's role is ever shown; vote someone out if you
            think you've spotted one.
          </p>

          <div className="agent-word-pool">
            {players.flatMap((player) =>
              player.words.map((word, i) => (
                <span className="agent-pool-word" key={`${player.id}-${i}`}>
                  {word}
                </span>
              ))
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

            <button
              className="agent-vote-button"
              onClick={startVote}
              disabled={phase !== "playing" || voteCooldown > 0}
            >
              {voteCooldown > 0 ? `🗳 VOTE IN ${formatTime(voteCooldown)}` : "🗳 CALL A VOTE"}
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
              <strong>{aliveCivilians.length}/{NUM_CIVILIANS}</strong>
            </div>

            <div>
              <span>AGENTS ALIVE</span>
              <strong>{aliveAgents.length}/{numAgents}</strong>
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

      {/* VOTE POPUP */}

      {phase === "voting" && currentVoter && (
        <div className="agent-overlay">
          <div className="agent-popup">
            <h2>CAST YOUR VOTE</h2>

            <p>
              {currentVoter.name}, who do you suspect is an agent?
              <br />
              (Pass the device/look away, everyone else!)
            </p>

            <div className="agent-kill-targets">
              {alivePlayers
                .filter((p) => p.id !== currentVoter.id)
                .map((suspect) => (
                  <button
                    key={suspect.id}
                    className="agent-kill-target"
                    onClick={() => castVote(suspect.id)}
                  >
                    {suspect.name}
                  </button>
                ))}
            </div>

            <p className="agent-vote-progress">
              {voteQueueIndex}/{voteQueue.length} have voted
            </p>
          </div>
        </div>
      )}

      {/* KILL NOTICE -- stays up until dismissed, and the player's card
          stays marked "SILENCED" for the rest of the game either way. */}

      {killNotice && (
        <div className="agent-kill-notice">
          <div className="agent-kill-notice-icon">🔇</div>
          <h1>{killNotice}</h1>
          <p>YOU WERE KILLED</p>
          <p className="agent-kill-notice-sub">Don't speak for the rest of the game.</p>
          <button className="agent-restart-winning" onClick={() => setKillNotice(null)}>
            I UNDERSTAND
          </button>
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
                : "The secret sentence was cracked (or every agent was voted out)!"}
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
