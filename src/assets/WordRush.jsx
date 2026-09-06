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
import "./WordRush.css";

const CURRENT_GAME = "Word Rush";

const RULES_SECTIONS = [
  { heading: "Objective", body: "Score the most round wins across the game." },
  { heading: "Each round", body: "Everyone races to guess the same secret 5-letter word at the same time." },
  { heading: "Feedback", body: "Green = right letter, right spot. Yellow = right letter, wrong spot. Gray = not in the word." },
  { heading: "Guesses", body: "You get 6 guesses per round. Run out and you're done for that round." },
  { heading: "Winning a round", body: "First correct guess wins the round and scores a point -- the word is then revealed to everyone." },
  { heading: "Winning the game", body: "After 5 rounds, the highest score wins. A tie plays a sudden-death round." },
];

function TileRow({ word, feedback }) {
  const letters = word.split("");

  return (
    <div className="wr-row">
      {letters.map((letter, i) => (
        <span key={i} className={`wr-tile ${feedback[i]}`}>
          {letter.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

function EmptyRow() {
  return (
    <div className="wr-row">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="wr-tile empty" />
      ))}
    </div>
  );
}

export default function WordRush() {
  const location = useLocation();
  const navigate = useNavigate();
  const code = location.state?.code;
  const room = location.state?.room;

  if (!code) {
    return (
      <div className="wr-screen wr-gate">
        <div className="wr-popup">
          <h2>MULTIPLAYER ONLY</h2>
          <p>Word Rush needs a real room with 2-7 players.</p>
          <button className="wr-button" onClick={() => navigate("/create-room")}>
            CREATE A ROOM
          </button>
        </div>
      </div>
    );
  }

  return <NetworkedWordRush code={code} room={room} />;
}

function NetworkedWordRush({ code, room }) {
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
      <div className="wr-screen wr-gate">
        <div className="wr-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="wr-screen wr-gate">
        <div className="wr-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  return (
    <WordRushGame
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

function WordRushGame({ state, mySeat, dispatch, canControl, nextGame, onNextGame, onRematch }) {
  const [showRules, setShowRules] = useState(false);
  const [guess, setGuess] = useState("");
  const { notifications, push } = useNotifications();
  const lastLogLength = useRef(0);

  useEffect(() => {
    setGuess("");
  }, [state.round]);

  useEffect(() => {
    const newLines = state.log.slice(lastLogLength.current);
    lastLogLength.current = state.log.length;

    for (const line of newLines) {
      const match = line.match(/^Player (\d+)/);
      const seat = match ? Number(match[1]) - 1 : null;

      if (/takes the round/i.test(line)) push("SOLVED IT!", { tone: "good", seat });
      else if (/out of guesses/i.test(line)) push("OUT OF GUESSES", { tone: "danger", seat });
    }
  }, [state.log, push]);

  const submitGuess = async (e) => {
    e.preventDefault();
    const normalized = guess.trim().toLowerCase();
    if (normalized.length !== state.wordLength) return;

    const response = await dispatch("submit-guess", { guess: normalized });
    if (response?.success) {
      setGuess("");
    } else {
      push(response?.error || "Invalid guess", { tone: "danger", seat: mySeat });
    }
  };

  const handleNextRound = async () => {
    await dispatch("next-round", {});
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

  const canGuess = !state.roundOver && !state.mySolved && !state.myOutOfGuesses;
  const notificationsBySeat = (seat) => notifications.filter((n) => n.seat === seat);

  const players = state.scores.map((s) => ({ seat: s.seat }));

  return (
    <div className="wr-screen">
      <header className="wr-header">
        <h1 className="wr-logo">WORD RUSH</h1>
        <button className="wr-info-button" onClick={() => setShowRules(true)}>
          ⓘ
        </button>
      </header>

      <div className="wr-round-banner">
        ROUND {state.round}
        {state.round <= state.totalRounds ? ` / ${state.totalRounds}` : " (SUDDEN DEATH)"}
      </div>

      <RoundTablePlayers
        className="wr-table"
        players={players}
        center={
          <div className="wr-board">
            {state.myGuesses.map((g, i) => (
              <TileRow key={i} word={g.word} feedback={g.feedback} />
            ))}
            {canGuess && (
              <form className="wr-guess-row" onSubmit={submitGuess}>
                <input
                  className="wr-guess-input"
                  value={guess}
                  maxLength={state.wordLength}
                  autoFocus
                  autoCapitalize="characters"
                  autoComplete="off"
                  onChange={(e) => setGuess(e.target.value.replace(/[^a-zA-Z]/g, ""))}
                  placeholder="GUESS"
                />
                <button type="submit" className="wr-submit-button" disabled={guess.length !== state.wordLength}>
                  GO
                </button>
              </form>
            )}
            {Array.from({
              length: Math.max(0, state.maxGuesses - state.myGuesses.length - (canGuess ? 1 : 0)),
            }).map((_, i) => (
              <EmptyRow key={`empty-${i}`} />
            ))}

            {state.roundOver && (
              <div className="wr-round-result">
                <p>
                  The word was <strong>{state.secretWord?.toUpperCase()}</strong>
                </p>
                {state.roundWinner !== null ? (
                  <p>{nameFor(state, state.roundWinner)} won the round!</p>
                ) : (
                  <p>Nobody solved it this round.</p>
                )}
                <button className="wr-button" onClick={handleNextRound}>
                  NEXT ROUND
                </button>
              </div>
            )}
          </div>
        }
        renderPlayer={(player) => {
          const isMe = player.seat === mySeat;
          const scoreEntry = state.scores.find((s) => s.seat === player.seat);
          const other = state.others.find((o) => o.seat === player.seat);

          return (
            <div className={`wr-seat ${isMe ? "self" : ""}`}>
              <div className="wr-seat-name">
                {nameFor(state, player.seat)}
                {isMe ? " (you)" : ""}
              </div>
              <div className="wr-seat-score">{scoreEntry?.score ?? 0} pts</div>
              {isMe ? (
                <div className="wr-seat-progress">
                  {state.mySolved ? "SOLVED" : state.myOutOfGuesses ? "OUT" : `${state.myGuesses.length}/${state.maxGuesses}`}
                </div>
              ) : (
                <div className="wr-seat-progress">
                  {other?.solved ? "SOLVED" : other?.outOfGuesses ? "OUT" : `${other?.guessCount ?? 0}/${state.maxGuesses}`}
                </div>
              )}
              {!isMe && state.roundOver && other?.guesses && (
                <div className="wr-recap">
                  {other.guesses.map((g, i) => (
                    <TileRow key={i} word={g.word} feedback={g.feedback} />
                  ))}
                </div>
              )}
              <PlayerStatus isActive={isMe ? canGuess : Boolean(other && !other.solved && !other.outOfGuesses && !state.roundOver)} />
              <ActionNotification notifications={notificationsBySeat(player.seat)} />
            </div>
          );
        }}
      />

      <GameLog entries={logWithNicknames(state.log, state)} title="EVENTS" />

      {showRules && (
        <RulesModal title="HOW TO PLAY" sections={RULES_SECTIONS} onClose={() => setShowRules(false)} />
      )}
    </div>
  );
}

function VictoryScreen({ state, mySeat, canControl, nextGame, onNextGame, onRematch }) {
  const sorted = [...state.scores].sort((a, b) => b.score - a.score);

  return (
    <div className="wr-screen wr-gate">
      <div className="wr-popup wr-victory">
        <div className="wr-trophy">🎉</div>
        <h1>{nameFor(state, state.winner)} Wins!</h1>
        <div className="wr-final-stats">
          {sorted.map((s) => (
            <div key={s.seat} className="wr-final-row">
              <span>
                {nameFor(state, s.seat)}
                {s.seat === mySeat ? " (you)" : ""}
              </span>
              <strong>{s.score} pts</strong>
            </div>
          ))}
        </div>

        {canControl ? (
          <div className="wr-postgame-actions">
            <button className="wr-button" onClick={onRematch}>
              REMATCH
            </button>
            {nextGame && (
              <button className="wr-button next" onClick={onNextGame}>
                NEXT GAME: {nextGame.toUpperCase()}
              </button>
            )}
          </div>
        ) : (
          <p className="wr-waiting-host">Waiting for the host to choose what's next...</p>
        )}
      </div>
    </div>
  );
}
