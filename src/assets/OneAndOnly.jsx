import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import RoundTablePlayers from "../components/RoundTablePlayers";
import DirectionIndicator from "../components/DirectionIndicator";
import ActionNotification from "../components/ActionNotification";
import GameLog from "../components/GameLog";
import PlayerStatus from "../components/PlayerStatus";
import RulesModal from "../components/RulesModal";
import Modal from "../components/Modal";
import { useNotifications } from "../hooks/useNotifications";
import { useGameTransitions } from "../hooks/useGameTransitions";
import "./OneAndOnly.css";

const CURRENT_GAME = "One and Only";

const COLOR_HEX = {
  ember: "#e0453f",
  tide: "#3f7fe6",
  verdant: "#3fb968",
  solar: "#f0c33c",
};

const COLOR_LABEL = {
  ember: "Ember",
  tide: "Tide",
  verdant: "Verdant",
  solar: "Solar",
};

const RULES_SECTIONS = [
  { heading: "Objective", body: "Be the first to play every card in your hand." },
  {
    heading: "Matching",
    body: "Play a card that shares the color, number, or type with the top of the discard pile.",
  },
  { heading: "Drawing", body: "Can't or won't play? Draw one card. If it's playable you may play it, otherwise pass." },
  { heading: "Block", body: "Skips the next player's turn." },
  { heading: "Switch", body: "Reverses turn direction (acts as a Block in a 2-player game)." },
  { heading: "+2", body: "The next player draws 2 cards and is skipped." },
  { heading: "Free", body: "A wild card -- choose the next color." },
  { heading: "+4", body: "A wild card -- the next player draws 4 and is skipped. Choose the next color." },
  { heading: "Winning", body: "The first player to empty their hand wins immediately." },
];

function cardLabel(card) {
  if (card.kind === "number") return String(card.value);
  if (card.kind === "action") return { block: "Block", switch: "Switch", plus2: "+2" }[card.value];
  return card.value === "plus4" ? "+4" : "Free";
}

function isPlayableClient(card, discardTop, activeColor) {
  if (card.kind === "wild") return true;
  if (card.color === activeColor) return true;
  return card.value === discardTop.value;
}

export default function OneAndOnly() {
  const location = useLocation();
  const navigate = useNavigate();
  const code = location.state?.code;
  const room = location.state?.room;

  if (!code) {
    return (
      <div className="ooo-screen ooo-gate">
        <div className="ooo-popup">
          <h2>MULTIPLAYER ONLY</h2>
          <p>One and Only needs a real room with 2-5 players.</p>
          <button className="ooo-button" onClick={() => navigate("/create-room")}>
            CREATE A ROOM
          </button>
        </div>
      </div>
    );
  }

  return <NetworkedOneAndOnly code={code} room={room} />;
}

function NetworkedOneAndOnly({ code, room }) {
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
      <div className="ooo-screen ooo-gate">
        <div className="ooo-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="ooo-screen ooo-gate">
        <div className="ooo-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  return (
    <OneAndOnlyGame
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

function OneAndOnlyGame({ state, mySeat, dispatch, isHost, nextGame, onNextGame, onRematch }) {
  const [showRules, setShowRules] = useState(false);
  const [pendingWildCardId, setPendingWildCardId] = useState(null);
  const { notifications, push } = useNotifications();
  const lastLogLength = useRef(0);

  useEffect(() => {
    const newLines = state.log.slice(lastLogLength.current);
    lastLogLength.current = state.log.length;

    for (const line of newLines) {
      if (/is blocked/i.test(line)) push("BLOCKED", { tone: "danger" });
      else if (/direction changed/i.test(line)) push("DIRECTION CHANGED", { tone: "info" });
      else if (/draws 4/i.test(line)) push("+4", { tone: "danger" });
      else if (/draws 2/i.test(line)) push("+2", { tone: "danger" });
    }
  }, [state.log, push]);

  const isMyTurn = state.currentSeat === mySeat;
  const discardTop = state.discardTop;

  const handleDraw = async () => {
    await dispatch("draw-card", {});
  };

  const handlePass = async () => {
    await dispatch("pass-turn", {});
  };

  const attemptPlay = (card) => {
    if (!isMyTurn) return;
    if (!isPlayableClient(card, discardTop, state.activeColor)) return;

    if (card.kind === "wild") {
      setPendingWildCardId(card.id);
      return;
    }

    dispatch("play-card", { cardId: card.id });
  };

  const confirmWildColor = async (color) => {
    if (!pendingWildCardId) return;
    await dispatch("play-card", { cardId: pendingWildCardId, chosenColor: color });
    setPendingWildCardId(null);
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

  const players = Array.from({ length: state.handCounts.length }, (_, seat) => ({
    seat,
    count: state.handCounts[seat],
  }));

  return (
    <div className="ooo-screen">
      <header className="ooo-header">
        <h1 className="ooo-logo">ONE &amp; ONLY</h1>
        <button className="ooo-info-button" onClick={() => setShowRules(true)}>
          ⓘ
        </button>
      </header>

      <div className="ooo-direction-row">
        <DirectionIndicator clockwise={state.direction === 1} />
      </div>

      <RoundTablePlayers
        className="ooo-table"
        players={players}
        center={
          <div className="ooo-piles">
            <button className="ooo-draw-pile" onClick={handleDraw} disabled={!isMyTurn || state.hasDrawnThisTurn}>
              <span>DRAW</span>
              <small>{state.drawPileCount} left</small>
            </button>

            {discardTop && (
              <div className="ooo-discard-top">
                <PlayingCard card={discardTop} />
                <div className="ooo-active-color" style={{ background: COLOR_HEX[state.activeColor] }}>
                  {COLOR_LABEL[state.activeColor]}
                </div>
              </div>
            )}
          </div>
        }
        renderPlayer={(player) => (
          <div className={`ooo-seat ${player.seat === mySeat ? "self" : ""}`}>
            <div className="ooo-seat-name">
              Player {player.seat + 1}
              {player.seat === mySeat ? " (you)" : ""}
            </div>
            <div className="ooo-seat-count">{player.count} cards</div>
            <PlayerStatus isActive={state.currentSeat === player.seat} />
            <ActionNotification notifications={notifications.filter((n) => n.seat === player.seat)} />
          </div>
        )}
      />

      {isMyTurn && state.hasDrawnThisTurn && (
        <div className="ooo-pass-row">
          <button className="ooo-button" onClick={handlePass}>
            PASS TURN
          </button>
        </div>
      )}

      <footer className="ooo-hand-wrap">
        <div className="ooo-hand">
          {state.myHand.map((card) => {
            const playable = isMyTurn && isPlayableClient(card, discardTop, state.activeColor);
            return (
              <button
                key={card.id}
                className={`ooo-hand-card ${playable ? "playable" : "dim"}`}
                onClick={() => attemptPlay(card)}
                disabled={!isMyTurn}
              >
                <PlayingCard card={card} />
              </button>
            );
          })}
        </div>
      </footer>

      <GameLog entries={state.log} title="EVENTS" />

      {pendingWildCardId && (
        <Modal onClose={() => setPendingWildCardId(null)}>
          <h2>CHOOSE THE NEXT COLOR</h2>
          <div className="ooo-color-grid">
            {Object.keys(COLOR_HEX).map((color) => (
              <button
                key={color}
                className="ooo-color-choice"
                style={{ background: COLOR_HEX[color] }}
                onClick={() => confirmWildColor(color)}
              >
                {COLOR_LABEL[color]}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {showRules && (
        <RulesModal title="HOW TO PLAY" sections={RULES_SECTIONS} onClose={() => setShowRules(false)} />
      )}
    </div>
  );
}

function PlayingCard({ card }) {
  if (card.kind === "wild") {
    return (
      <div className="ooo-card wild">
        <div className="ooo-card-quad">
          <span style={{ background: COLOR_HEX.ember }} />
          <span style={{ background: COLOR_HEX.tide }} />
          <span style={{ background: COLOR_HEX.verdant }} />
          <span style={{ background: COLOR_HEX.solar }} />
        </div>
        <div className="ooo-card-main wild-text">{cardLabel(card)}</div>
      </div>
    );
  }

  return (
    <div className="ooo-card" style={{ background: COLOR_HEX[card.color] }}>
      <div className="ooo-card-corner">{cardLabel(card)}</div>
      <div className="ooo-card-main">{cardLabel(card)}</div>
    </div>
  );
}

function VictoryScreen({ state, mySeat, isHost, nextGame, onNextGame, onRematch }) {
  return (
    <div className="ooo-screen ooo-gate">
      <div className="ooo-popup ooo-victory">
        <div className="ooo-trophy">🎉</div>
        <h1>Player {state.winner + 1} Wins!</h1>
        <div className="ooo-final-stats">
          {state.handCounts.map((count, seat) => (
            <div key={seat} className="ooo-final-row">
              <span>
                Player {seat + 1}
                {seat === mySeat ? " (you)" : ""}
              </span>
              <strong>{count} cards left</strong>
            </div>
          ))}
        </div>

        {isHost ? (
          <div className="ooo-postgame-actions">
            <button className="ooo-button" onClick={onRematch}>
              REMATCH
            </button>
            {nextGame && (
              <button className="ooo-button next" onClick={onNextGame}>
                NEXT GAME: {nextGame.toUpperCase()}
              </button>
            )}
          </div>
        ) : (
          <p className="ooo-waiting-host">Waiting for the host to choose what's next...</p>
        )}
      </div>
    </div>
  );
}
