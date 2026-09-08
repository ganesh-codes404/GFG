import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import ActionNotification from "../components/ActionNotification";
import GameLog from "../components/GameLog";
import PlayerStatus from "../components/PlayerStatus";
import RulesModal from "../components/RulesModal";
import { useNotifications } from "../hooks/useNotifications";
import { useGameTransitions } from "../hooks/useGameTransitions";
import { nameFor, logWithNicknames } from "../utils/nicknames";
import "./GuessWho.css";

const CURRENT_GAME = "Guess Who";

const RULES_SECTIONS = [
  { heading: "Objective", body: "Be the last player whose secret character hasn't been correctly guessed." },
  { heading: "Your character", body: "You're secretly assigned one character from the board. Only you know who you are until someone guesses it." },
  { heading: "Your turn", body: "Ask one opponent a yes/no question about their character, or make a guess at who they are -- pick one." },
  { heading: "Guessing", body: "Guess correctly and that opponent is revealed and out of the game. Guess wrong and nothing happens except your turn ends -- the wrong guess is still logged, so it's useful information for everyone." },
  { heading: "Winning", body: "The last player whose character is still a mystery wins." },
];

export default function GuessWho() {
  const location = useLocation();
  const navigate = useNavigate();
  const code = location.state?.code;
  const room = location.state?.room;

  if (!code) {
    return (
      <div className="gw-screen gw-gate">
        <div className="gw-popup">
          <h2>MULTIPLAYER ONLY</h2>
          <p>Guess Who needs a real room with 2-4 players.</p>
          <button className="gw-button" onClick={() => navigate("/create-room")}>
            CREATE A ROOM
          </button>
        </div>
      </div>
    );
  }

  return <NetworkedGuessWho code={code} room={room} />;
}

function NetworkedGuessWho({ code, room }) {
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
      <div className="gw-screen gw-gate">
        <div className="gw-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="gw-screen gw-gate">
        <div className="gw-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  return (
    <GuessWhoGame
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

function GuessWhoGame({ state, mySeat, dispatch, canControl, nextGame, onNextGame, onRematch }) {
  const [showRules, setShowRules] = useState(false);
  const [mode, setMode] = useState("ask"); // "ask" | "guess"
  const [targetSeat, setTargetSeat] = useState(null);
  const [questionId, setQuestionId] = useState(state.questions[0]?.id ?? null);
  const [selectedCharacterId, setSelectedCharacterId] = useState(null);
  const [crossedOff, setCrossedOff] = useState(() => new Set());
  const { notifications, push } = useNotifications();
  const lastLogLength = useRef(0);

  const me = state.players.find((p) => p.seat === mySeat);
  const isMyTurn = state.currentSeat === mySeat && !me?.eliminated;
  const myCharacter = state.characters.find((c) => c.id === state.myCharacterId);

  useEffect(() => {
    const newLines = state.log.slice(lastLogLength.current);
    lastLogLength.current = state.log.length;

    for (const line of newLines) {
      if (/correctly guessed/i.test(line)) push("REVEALED!", { tone: "danger" });
      else if (/-- WRONG/i.test(line)) push("WRONG GUESS", { tone: "info" });
      else if (/wins Guess Who/i.test(line)) push("WINNER!", { tone: "good" });
    }
  }, [state.log, push]);

  // Reset the pending target/character whenever the turn changes so a stale
  // selection from a previous turn can't accidentally get submitted.
  useEffect(() => {
    setTargetSeat(null);
    setSelectedCharacterId(null);
  }, [state.currentSeat]);

  const toggleCrossedOff = (characterId) => {
    setCrossedOff((current) => {
      const next = new Set(current);
      if (next.has(characterId)) next.delete(characterId);
      else next.add(characterId);
      return next;
    });
  };

  const activeOpponents = state.players.filter((p) => p.seat !== mySeat && !p.eliminated);

  const askQuestion = async () => {
    if (targetSeat === null || !questionId) return;
    const response = await dispatch("ask-question", { targetSeat, questionId });
    if (!response?.success) push(response?.error || "Could not ask", { tone: "danger", seat: mySeat });
  };

  const submitGuess = async () => {
    if (targetSeat === null || !selectedCharacterId) return;
    const response = await dispatch("make-guess", { targetSeat, characterId: selectedCharacterId });
    if (!response?.success) push(response?.error || "Could not guess", { tone: "danger", seat: mySeat });
    setSelectedCharacterId(null);
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

  return (
    <div className="gw-screen">
      <header className="gw-header">
        <h1 className="gw-logo">GUESS WHO</h1>
        <button className="gw-info-button" onClick={() => setShowRules(true)}>
          ⓘ
        </button>
      </header>

      <div className="gw-layout">
        <aside className="gw-side-col">
          {myCharacter && (
            <div className="gw-my-character">
              <div className="gw-section-title">YOUR CHARACTER</div>
              <div className="gw-my-character-card">
                <div className="gw-my-character-emoji">{myCharacter.emoji}</div>
                <div className="gw-my-character-name">{myCharacter.name}</div>
              </div>
            </div>
          )}

          <div className="gw-section-title">PLAYERS</div>
          <div className="gw-player-list">
            {state.players.map((player) => {
              const revealedCharacter = player.eliminated
                ? state.characters.find((c) => c.id === player.characterId)
                : null;
              return (
                <div
                  key={player.seat}
                  className={`gw-player-card ${player.seat === mySeat ? "self" : ""} ${player.eliminated ? "eliminated" : ""}`}
                >
                  <div className="gw-player-card-name">
                    {nameFor(state, player.seat)}
                    {player.seat === mySeat ? " (you)" : ""}
                  </div>
                  {player.eliminated ? (
                    <div className="gw-player-card-revealed">
                      {revealedCharacter?.emoji} OUT -- was {revealedCharacter?.name}
                    </div>
                  ) : (
                    <PlayerStatus isActive={state.currentSeat === player.seat} />
                  )}
                  <ActionNotification notifications={notifications.filter((n) => n.seat === player.seat)} />
                </div>
              );
            })}
          </div>

          {isMyTurn && (
            <div className="gw-action-panel">
              <div className="gw-mode-toggle">
                <button className={mode === "ask" ? "active" : ""} onClick={() => setMode("ask")}>
                  ❓ ASK
                </button>
                <button className={mode === "guess" ? "active" : ""} onClick={() => setMode("guess")}>
                  🎯 GUESS
                </button>
              </div>

              <div className="gw-section-title">TARGET</div>
              <div className="gw-target-row">
                {activeOpponents.map((p) => (
                  <button
                    key={p.seat}
                    className={targetSeat === p.seat ? "selected" : ""}
                    onClick={() => setTargetSeat(p.seat)}
                  >
                    {nameFor(state, p.seat)}
                  </button>
                ))}
              </div>

              {mode === "ask" ? (
                <>
                  <div className="gw-section-title">QUESTION</div>
                  <div className="gw-question-list">
                    {state.questions.map((q) => (
                      <button
                        key={q.id}
                        className={questionId === q.id ? "selected" : ""}
                        onClick={() => setQuestionId(q.id)}
                      >
                        {q.text}
                      </button>
                    ))}
                  </div>
                  <button className="gw-button" disabled={targetSeat === null || !questionId} onClick={askQuestion}>
                    ASK
                  </button>
                </>
              ) : (
                <>
                  <p className="gw-guess-hint">
                    {selectedCharacterId
                      ? `Guess ${state.characters.find((c) => c.id === selectedCharacterId)?.name} for ${
                          targetSeat !== null ? nameFor(state, targetSeat) : "..."
                        }?`
                      : "Pick a target above, then tap a character on the board to guess."}
                  </p>
                  <button
                    className="gw-button"
                    disabled={targetSeat === null || !selectedCharacterId}
                    onClick={submitGuess}
                  >
                    CONFIRM GUESS
                  </button>
                </>
              )}
            </div>
          )}
        </aside>

        <section className="gw-board-col">
          <div className="gw-section-title">CHARACTER BOARD</div>
          <p className="gw-board-hint">
            Tap a character to cross it off your own notes.
            {isMyTurn && mode === "guess" && " In GUESS mode, tapping instead selects your guess."}
          </p>

          <div className="gw-character-grid">
            {state.characters.map((character) => {
              const isCrossedOff = crossedOff.has(character.id);
              const isSelected = selectedCharacterId === character.id;
              const guessModeActive = isMyTurn && mode === "guess";

              return (
                <button
                  key={character.id}
                  className={`gw-character-card ${isCrossedOff ? "crossed" : ""} ${isSelected ? "selected" : ""}`}
                  onClick={() =>
                    guessModeActive ? setSelectedCharacterId(character.id) : toggleCrossedOff(character.id)
                  }
                >
                  <div className="gw-character-emoji">{character.emoji}</div>
                  <div className="gw-character-name">{character.name}</div>
                  {isCrossedOff && <div className="gw-character-strike" />}
                </button>
              );
            })}
          </div>

          <GameLog entries={logWithNicknames(state.log, state)} title="EVENTS" />
        </section>
      </div>

      {showRules && <RulesModal title="HOW TO PLAY" sections={RULES_SECTIONS} onClose={() => setShowRules(false)} />}
    </div>
  );
}

function VictoryScreen({ state, mySeat, canControl, nextGame, onNextGame, onRematch }) {
  return (
    <div className="gw-screen gw-gate">
      <div className="gw-popup gw-victory">
        <div className="gw-trophy">🏆</div>
        <h1>{nameFor(state, state.winner)} WINS!</h1>

        <div className="gw-final-stats">
          {state.players.map((p) => {
            const character = state.characters.find((c) => c.id === p.characterId);
            return (
              <div key={p.seat} className="gw-final-row">
                <span>
                  {nameFor(state, p.seat)}
                  {p.seat === mySeat ? " (you)" : ""}
                  {p.seat === state.winner ? " 👑" : ""}
                </span>
                <strong>
                  {character?.emoji} {character?.name}
                </strong>
              </div>
            );
          })}
        </div>

        {canControl ? (
          <div className="gw-postgame-actions">
            <button className="gw-button" onClick={onRematch}>
              REMATCH
            </button>
            {nextGame && (
              <button className="gw-button next" onClick={onNextGame}>
                NEXT GAME: {nextGame.toUpperCase()}
              </button>
            )}
          </div>
        ) : (
          <p className="gw-waiting-host">Waiting for the host to choose what's next...</p>
        )}
      </div>
    </div>
  );
}
