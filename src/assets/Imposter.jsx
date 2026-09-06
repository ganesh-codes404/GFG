import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import RoundTablePlayers from "../components/RoundTablePlayers";
import ActionNotification from "../components/ActionNotification";
import GameLog from "../components/GameLog";
import PlayerStatus from "../components/PlayerStatus";
import RulesModal from "../components/RulesModal";
import { useNotifications } from "../hooks/useNotifications";
import { useGameTransitions } from "../hooks/useGameTransitions";
import { nameFor, logWithNicknames } from "../utils/nicknames";
import "./Imposter.css";

const CURRENT_GAME = "Imposter";

const RULES_SECTIONS = [
  { heading: "Objective", body: "Crew: catch both imposters. Imposters: survive until you equal or outnumber the crew." },
  { heading: "Your topic", body: "Everyone gets a topic. 2 players secretly get a very similar (but different) topic -- they don't even know it themselves." },
  { heading: "Talking", body: "Out loud, in person, take turns saying one word related to your topic. This app doesn't track that part." },
  { heading: "Voting", body: "When the group's ready, anyone can start a vote. Everyone picks who they think is an imposter." },
  { heading: "The reveal", body: "Whoever gets the most votes is out -- and everyone instantly learns whether they were really an imposter." },
  { heading: "Cooldown", body: "After every vote, there's a 1-minute cooldown before the next one can start -- time to talk it out." },
];

export default function Imposter() {
  const location = useLocation();
  const navigate = useNavigate();
  const code = location.state?.code;
  const room = location.state?.room;

  if (!code) {
    return (
      <div className="imp-screen imp-gate">
        <div className="imp-popup">
          <h2>MULTIPLAYER ONLY</h2>
          <p>Imposter needs a real room with 5-7 players.</p>
          <button className="imp-button" onClick={() => navigate("/create-room")}>
            CREATE A ROOM
          </button>
        </div>
      </div>
    );
  }

  return <NetworkedImposter code={code} room={room} />;
}

function NetworkedImposter({ code, room }) {
  const [seat, setSeat] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  const { nextGame, requestNextGame, canControl } = useGameTransitions({
    code,
    room,
    currentGame: CURRENT_GAME,
  });

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

  const dispatch = (action, payload) =>
    new Promise((resolve) => {
      socket.emit("game-action", { code, action, payload }, (response) => resolve(response));
    });

  if (error) {
    return (
      <div className="imp-screen imp-gate">
        <div className="imp-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="imp-screen imp-gate">
        <div className="imp-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  return (
    <ImposterGame
      state={state}
      mySeat={seat}
      dispatch={dispatch}
      canControl={canControl}
      nextGame={nextGame}
      onNextGame={requestNextGame}
      onRematch={() => socket.emit("reset-game", { code })}
    />
  );
}

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function ImposterGame({ state, mySeat, dispatch, canControl, nextGame, onNextGame, onRematch }) {
  const [showRules, setShowRules] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { notifications, push } = useNotifications();
  const lastLogLength = useRef(0);

  useEffect(() => {
    if (!state.cooldownEndsAt) return;
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [state.cooldownEndsAt]);

  useEffect(() => {
    const newLines = state.log.slice(lastLogLength.current);
    lastLogLength.current = state.log.length;

    for (const line of newLines) {
      const match = line.match(/^Player (\d+) was voted out -- they (WERE|were NOT)/);
      if (match) {
        const seat = Number(match[1]) - 1;
        const wasImposter = match[2] === "WERE";
        push(wasImposter ? "WAS AN IMPOSTER!" : "NOT AN IMPOSTER", {
          tone: wasImposter ? "danger" : "good",
          seat,
        });
      } else if (/vote was tied/i.test(line)) {
        push("TIED -- NO ONE OUT", { tone: "info" });
      }
    }
  }, [state.log, push]);

  const cooldownRemaining = state.cooldownEndsAt ? state.cooldownEndsAt - now : 0;
  const onCooldown = cooldownRemaining > 0;
  const canStartVote = state.myAlive && state.phase === "discussion" && !onCooldown;

  const handleStartVoting = async () => {
    const response = await dispatch("start-voting", {});
    if (!response?.success) push(response?.error || "Could not start the vote", { tone: "danger", seat: mySeat });
  };

  const handleVote = async (targetSeat) => {
    const response = await dispatch("submit-vote", { targetSeat });
    if (!response?.success) push(response?.error || "Vote failed", { tone: "danger", seat: mySeat });
  };

  if (state.finished) {
    return (
      <VictoryScreen
        state={state}
        mySeat={mySeat}
        canControl={canControl}
        nextGame={nextGame}
        onNextGame={onNextGame}
        onRematch={onRematch}
      />
    );
  }

  const notificationsBySeat = (seat) => notifications.filter((n) => n.seat === seat);

  return (
    <div className="imp-screen">
      <header className="imp-header">
        <h1 className="imp-logo">IMPOSTER</h1>
        <button className="imp-info-button" onClick={() => setShowRules(true)}>
          ⓘ
        </button>
      </header>

      <div className="imp-topic-card">
        <span className="imp-topic-label">YOUR TOPIC</span>
        <span className="imp-topic-value">{state.myTopic}</span>
        {!state.myAlive && <span className="imp-spectating">SPECTATING</span>}
      </div>

      {state.lastElimination && (
        <div className={`imp-reveal ${state.lastElimination.wasImposter ? "danger" : "good"}`}>
          {nameFor(state, state.lastElimination.seat)} was voted out -- they{" "}
          {state.lastElimination.wasImposter ? "WERE an imposter!" : "were NOT an imposter."}
        </div>
      )}

      <RoundTablePlayers
        className="imp-table"
        players={state.players}
        center={
          <div className="imp-center">
            {state.phase === "voting" ? (
              <>
                <div className="imp-center-title">VOTING</div>
                <div className="imp-center-sub">
                  {state.votesIn}/{state.votesNeeded} votes in
                </div>
              </>
            ) : onCooldown ? (
              <>
                <div className="imp-center-title">COOLDOWN</div>
                <div className="imp-center-sub">Next vote in {formatCountdown(cooldownRemaining)}</div>
              </>
            ) : (
              <div className="imp-center-title">TALK IT OUT</div>
            )}
          </div>
        }
        renderPlayer={(player) => {
          const isMe = player.seat === mySeat;
          const votable =
            state.phase === "voting" && state.myAlive && !state.haveIVoted && player.alive && !isMe;

          return (
            <button
              type="button"
              className={`imp-seat ${isMe ? "self" : ""} ${!player.alive ? "eliminated" : ""} ${votable ? "votable" : ""}`}
              disabled={!votable}
              onClick={() => votable && handleVote(player.seat)}
            >
              <div className="imp-seat-name">
                {nameFor(state, player.seat)}
                {isMe ? " (you)" : ""}
              </div>
              {!player.alive ? (
                <div className="imp-seat-out">OUT</div>
              ) : isMe && state.phase === "voting" ? (
                <PlayerStatus isActive={!state.haveIVoted} />
              ) : votable ? (
                <div className="imp-seat-vote-hint">TAP TO VOTE</div>
              ) : null}
              <ActionNotification notifications={notificationsBySeat(player.seat)} />
            </button>
          );
        }}
      />

      {canStartVote && (
        <div className="imp-controls">
          <button className="imp-action-button" onClick={handleStartVoting}>
            🗳 START VOTE
          </button>
        </div>
      )}

      <GameLog entries={logWithNicknames(state.log, state)} title="EVENTS" />

      {showRules && (
        <RulesModal title="HOW TO PLAY" sections={RULES_SECTIONS} onClose={() => setShowRules(false)} />
      )}
    </div>
  );
}

function VictoryScreen({ state, mySeat, canControl, nextGame, onNextGame, onRematch }) {
  const { winner, topicMain, topicImposter, imposterSeats } = state.finished;

  return (
    <div className="imp-screen imp-gate">
      <div className="imp-popup imp-victory">
        <div className="imp-trophy">{winner === "crew" ? "🕵️" : "🎭"}</div>
        <h1>{winner === "crew" ? "CREW WINS!" : "IMPOSTERS WIN!"}</h1>

        <div className="imp-reveal-topics">
          <div>
            <span>MAIN TOPIC</span>
            <strong>{topicMain}</strong>
          </div>
          <div>
            <span>IMPOSTER TOPIC</span>
            <strong>{topicImposter}</strong>
          </div>
        </div>

        <div className="imp-final-stats">
          {state.players.map((p) => (
            <div key={p.seat} className={`imp-final-row ${imposterSeats.includes(p.seat) ? "was-imposter" : ""}`}>
              <span>
                {nameFor(state, p.seat)}
                {p.seat === mySeat ? " (you)" : ""}
              </span>
              <strong>{imposterSeats.includes(p.seat) ? "IMPOSTER" : "CREW"}</strong>
            </div>
          ))}
        </div>

        {canControl ? (
          <div className="imp-postgame-actions">
            <button className="imp-button" onClick={onRematch}>
              REMATCH
            </button>
            {nextGame && (
              <button className="imp-button next" onClick={onNextGame}>
                NEXT GAME: {nextGame.toUpperCase()}
              </button>
            )}
          </div>
        ) : (
          <p className="imp-waiting-host">Waiting for the host to choose what's next...</p>
        )}
      </div>
    </div>
  );
}
