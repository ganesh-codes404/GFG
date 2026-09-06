import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import ActionNotification from "../components/ActionNotification";
import GameLog from "../components/GameLog";
import RulesModal from "../components/RulesModal";
import { useNotifications } from "../hooks/useNotifications";
import { useGameTransitions } from "../hooks/useGameTransitions";
import "./Pictionary.css";

const CURRENT_GAME = "Pictionary";

const CANVAS_W = 600;
const CANVAS_H = 450;
const COLORS = ["#1a1a1a", "#e0453f", "#3f7fe6", "#3fb968", "#f0c33c", "#a259d9", "#ff9a2e", "#ffffff"];
const SIZES = [3, 6, 12];
const STROKE_SEND_INTERVAL_MS = 70;

const RULES_SECTIONS = [
  { heading: "Objective", body: "Score the most points by guessing drawings fast, or by getting others to guess yours." },
  { heading: "Rounds", body: "The host picks 1-8 rounds. Every round, each player takes one turn drawing." },
  { heading: "Drawing", body: "Pick one of 3 words, then sketch it -- everyone else sees your lines appear live." },
  { heading: "Guessing", body: "Type what you think it is. The faster you guess right, the more points you earn." },
  { heading: "Scoring", body: "The drawer also earns points for every player who guesses correctly." },
  { heading: "Timing", body: "12 seconds to pick a word, 70 seconds to draw and guess, then a short reveal before the next turn." },
];

function makeStrokeId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function Pictionary() {
  const location = useLocation();
  const navigate = useNavigate();
  const code = location.state?.code;
  const room = location.state?.room;

  if (!code) {
    return (
      <div className="pic-screen pic-gate">
        <div className="pic-popup">
          <h2>MULTIPLAYER ONLY</h2>
          <p>Pictionary needs a real room with 5-7 players.</p>
          <button className="pic-button" onClick={() => navigate("/create-room")}>
            CREATE A ROOM
          </button>
        </div>
      </div>
    );
  }

  return <NetworkedPictionary code={code} room={room} />;
}

function NetworkedPictionary({ code, room }) {
  const [seat, setSeat] = useState(null);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  const { nextGame, requestNextGame, isHost } = useGameTransitions({
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
      <div className="pic-screen pic-gate">
        <div className="pic-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="pic-screen pic-gate">
        <div className="pic-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  return (
    <PictionaryGame
      state={state}
      mySeat={seat}
      dispatch={dispatch}
      isHost={isHost}
      nextGame={nextGame}
      onNextGame={requestNextGame}
      onRematch={() => socket.emit("reset-game", { code })}
    />
  );
}

function formatCountdown(ms) {
  return String(Math.max(0, Math.ceil(ms / 1000)));
}

function PictionaryGame({ state, mySeat, dispatch, isHost, nextGame, onNextGame, onRematch }) {
  const [showRules, setShowRules] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [guessText, setGuessText] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(SIZES[1]);
  const { notifications, push } = useNotifications();
  const lastLogLength = useRef(0);

  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const currentStrokeId = useRef(null);
  const pendingPoints = useRef([]);
  const lastSendRef = useRef(0);

  const deadline = state.choiceDeadline || state.drawDeadline || state.revealDeadline || null;

  useEffect(() => {
    if (!deadline) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [deadline]);

  useEffect(() => {
    const newLines = state.log.slice(lastLogLength.current);
    lastLogLength.current = state.log.length;
    for (const line of newLines) {
      if (/guessed the word/i.test(line)) push("CORRECT!", { tone: "good" });
      else if (/time's up/i.test(line)) push("TIME'S UP", { tone: "danger" });
    }
  }, [state.log, push]);

  // Redraw the whole canvas whenever the server's stroke list changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    for (const stroke of state.strokes) {
      if (!stroke.points.length) continue;
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        ctx.beginPath();
        ctx.arc((p.x / 100) * CANVAS_W, (p.y / 100) * CANVAS_H, stroke.size / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      ctx.beginPath();
      ctx.moveTo((stroke.points[0].x / 100) * CANVAS_W, (stroke.points[0].y / 100) * CANVAS_H);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo((stroke.points[i].x / 100) * CANVAS_W, (stroke.points[i].y / 100) * CANVAS_H);
      }
      ctx.stroke();
    }
  }, [state.strokes]);

  const pointFromEvent = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  };

  const flushPending = (strokeId) => {
    if (pendingPoints.current.length === 0) return;
    const points = pendingPoints.current;
    pendingPoints.current = [];
    dispatch("append-stroke", { strokeId, points });
  };

  const handlePointerDown = (e) => {
    if (!state.isDrawer || state.phase !== "drawing") return;
    e.preventDefault();
    drawingRef.current = true;
    const strokeId = makeStrokeId();
    currentStrokeId.current = strokeId;
    pendingPoints.current = [];
    lastSendRef.current = Date.now();
    dispatch("start-stroke", { strokeId, color, size: brushSize, point: pointFromEvent(e) });
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    pendingPoints.current.push(pointFromEvent(e));
    const now = Date.now();
    if (now - lastSendRef.current >= STROKE_SEND_INTERVAL_MS) {
      lastSendRef.current = now;
      flushPending(currentStrokeId.current);
    }
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    flushPending(currentStrokeId.current);
    currentStrokeId.current = null;
  };

  const handleClear = () => dispatch("clear-canvas", {});

  const handleChooseWord = (word) => dispatch("choose-word", { word });

  const handleSetRounds = (rounds) => dispatch("set-rounds", { rounds });

  const handleSubmitGuess = async (e) => {
    e.preventDefault();
    if (!guessText.trim()) return;
    const text = guessText;
    setGuessText("");
    const response = await dispatch("submit-guess", { text });
    if (!response?.success) push(response?.error || "Guess failed", { tone: "danger" });
  };

  if (state.finished) {
    return (
      <VictoryScreen
        state={state}
        mySeat={mySeat}
        isHost={isHost}
        nextGame={nextGame}
        onNextGame={onNextGame}
        onRematch={onRematch}
      />
    );
  }

  const seatCount = state.scores.length;
  const players = Array.from({ length: seatCount }, (_, seat) => seat);
  const blanks = state.wordLength ? "_ ".repeat(state.wordLength).trim() : "";

  return (
    <div className="pic-screen">
      <header className="pic-header">
        <h1 className="pic-logo">PICTIONARY</h1>
        <div className="pic-header-right">
          {state.numRounds && <span className="pic-round">RD {state.round}/{state.numRounds}</span>}
          {deadline && <span className="pic-timer">{formatCountdown(deadline - now)}s</span>}
          <button className="pic-info-button" onClick={() => setShowRules(true)}>
            ⓘ
          </button>
        </div>
      </header>

      <div className="pic-score-strip">
        {players.map((seat) => (
          <div
            key={seat}
            className={`pic-score-chip ${seat === mySeat ? "self" : ""} ${seat === state.currentDrawer ? "drawing" : ""}`}
          >
            <span className="pic-score-name">
              {seat === state.currentDrawer && "✏️ "}
              P{seat + 1}
            </span>
            <span className="pic-score-value">{state.scores[seat]}</span>
            <ActionNotification notifications={notifications.filter((n) => n.seat === seat)} />
          </div>
        ))}
      </div>

      {state.phase === "setup" && (
        <SetupPanel isHost={isHost} onSetRounds={handleSetRounds} />
      )}

      {state.phase === "choosing" && (
        <ChoosingPanel state={state} onChooseWord={handleChooseWord} />
      )}

      {state.phase === "reveal" && (
        <div className="pic-reveal">
          <div className="pic-reveal-word">The word was "{state.lastReveal?.word}"</div>
          <div className="pic-reveal-sub">
            {state.lastReveal?.correctSeats.length || 0} player(s) guessed it right
          </div>
        </div>
      )}

      {(state.phase === "drawing" || state.phase === "reveal") && (
        <>
          <div className="pic-word-row">
            {state.isDrawer ? (
              <span className="pic-word-drawer">DRAW: {state.secretWord}</span>
            ) : (
              <span className="pic-word-blanks">{blanks || "..."}</span>
            )}
            <span className="pic-guess-progress">
              {state.correctCount}/{state.guessersNeeded} guessed
            </span>
          </div>

          <div className="pic-canvas-wrap">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className={`pic-canvas ${state.isDrawer && state.phase === "drawing" ? "drawable" : ""}`}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
            />
          </div>

          {state.isDrawer && state.phase === "drawing" && (
            <div className="pic-toolbar">
              <div className="pic-swatches">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`pic-swatch ${color === c ? "active" : ""}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
              <div className="pic-sizes">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    className={`pic-size-button ${brushSize === s ? "active" : ""}`}
                    onClick={() => setBrushSize(s)}
                  >
                    <span style={{ width: s, height: s }} />
                  </button>
                ))}
              </div>
              <button className="pic-clear-button" onClick={handleClear}>
                CLEAR
              </button>
            </div>
          )}

          {!state.isDrawer && state.phase === "drawing" && (
            <form className="pic-guess-row" onSubmit={handleSubmitGuess}>
              <input
                className="pic-guess-input"
                placeholder={state.haveIGuessed ? "You got it!" : "Type your guess..."}
                value={guessText}
                disabled={state.haveIGuessed}
                onChange={(e) => setGuessText(e.target.value)}
                maxLength={40}
              />
              <button className="pic-guess-submit" type="submit" disabled={state.haveIGuessed}>
                GO
              </button>
            </form>
          )}

          <div className="pic-guess-feed">
            {state.guessLog.slice(-8).map((g, i) => (
              <div key={i} className={`pic-guess-entry ${g.correct ? "correct" : ""}`}>
                <strong>P{g.seat + 1}:</strong> {g.correct ? "guessed the word!" : g.text}
              </div>
            ))}
          </div>
        </>
      )}

      <GameLog entries={state.log} title="EVENTS" />

      {showRules && (
        <RulesModal title="HOW TO PLAY" sections={RULES_SECTIONS} onClose={() => setShowRules(false)} />
      )}
    </div>
  );
}

function SetupPanel({ isHost, onSetRounds }) {
  const [rounds, setRounds] = useState(3);

  if (!isHost) {
    return (
      <div className="pic-setup">
        <p>Waiting for the host to choose how many rounds to play...</p>
      </div>
    );
  }

  return (
    <div className="pic-setup">
      <p>How many rounds? (each round = everyone draws once)</p>
      <div className="pic-rounds-grid">
        {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            className={`pic-round-button ${rounds === n ? "selected" : ""}`}
            onClick={() => setRounds(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <button className="pic-button" onClick={() => onSetRounds(rounds)}>
        START
      </button>
    </div>
  );
}

function ChoosingPanel({ state, onChooseWord }) {
  if (!state.isDrawer) {
    return (
      <div className="pic-setup">
        <p>Player {state.currentDrawer + 1} is choosing a word...</p>
      </div>
    );
  }

  return (
    <div className="pic-setup">
      <p>Pick a word to draw:</p>
      <div className="pic-word-choices">
        {state.wordChoices.map((word) => (
          <button key={word} className="pic-button" onClick={() => onChooseWord(word)}>
            {word}
          </button>
        ))}
      </div>
    </div>
  );
}

function VictoryScreen({ state, mySeat, isHost, nextGame, onNextGame, onRematch }) {
  const ranked = state.scores
    .map((score, seat) => ({ seat, score }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="pic-screen pic-gate">
      <div className="pic-popup pic-victory">
        <div className="pic-trophy">🏆</div>
        <h1>Player {state.finished.winner + 1} Wins!</h1>
        <div className="pic-final-stats">
          {ranked.map((p, i) => (
            <div key={p.seat} className="pic-final-row">
              <span>
                #{i + 1} Player {p.seat + 1}
                {p.seat === mySeat ? " (you)" : ""}
              </span>
              <strong>{p.score} pts</strong>
            </div>
          ))}
        </div>

        {isHost ? (
          <div className="pic-postgame-actions">
            <button className="pic-button" onClick={onRematch}>
              REMATCH
            </button>
            {nextGame && (
              <button className="pic-button next" onClick={onNextGame}>
                NEXT GAME: {nextGame.toUpperCase()}
              </button>
            )}
          </div>
        ) : (
          <p className="pic-waiting-host">Waiting for the host to choose what's next...</p>
        )}
      </div>
    </div>
  );
}
