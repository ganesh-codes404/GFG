import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { socket } from "../socket";
import ActionNotification from "../components/ActionNotification";
import GameLog from "../components/GameLog";
import RulesModal from "../components/RulesModal";
import { useNotifications } from "../hooks/useNotifications";
import { useGameTransitions } from "../hooks/useGameTransitions";
import { nameFor, logWithNicknames } from "../utils/nicknames";
import "./Tambola.css";

const CURRENT_GAME = "Tambola";

const RULES_SECTIONS = [
  { heading: "Objective", body: "Be the first to complete a prize pattern on your ticket as numbers are called." },
  { heading: "Your ticket", body: "You get one randomly generated 3x9 ticket with 15 numbers. Called numbers are marked on it automatically." },
  { heading: "Calling", body: "A new number is called automatically every few seconds -- no one needs to press anything for that part." },
  { heading: "Claiming", body: "The moment your ticket completes a prize pattern, tap CLAIM. First correct claim wins that prize; a wrong or late claim just does nothing." },
  { heading: "Prizes", body: "Early Five (first 5 marked), Top/Middle/Bottom Line (a full row), and Full House (the whole ticket) -- each can only be won once." },
  { heading: "Winning", body: "Whoever claims Full House wins and ends the game." },
];

function ticketNumbers(ticket) {
  return ticket.flat().filter((n) => n !== null);
}

function isLineComplete(row, calledSet) {
  return row.filter((n) => n !== null).every((n) => calledSet.has(n));
}

function countMarked(ticket, calledSet) {
  return ticketNumbers(ticket).filter((n) => calledSet.has(n)).length;
}

function isFullHouse(ticket, calledSet) {
  return ticketNumbers(ticket).every((n) => calledSet.has(n));
}

const PRIZE_ELIGIBILITY = {
  "early-five": (ticket, calledSet) => countMarked(ticket, calledSet) >= 5,
  "top-line": (ticket, calledSet) => isLineComplete(ticket[0], calledSet),
  "middle-line": (ticket, calledSet) => isLineComplete(ticket[1], calledSet),
  "bottom-line": (ticket, calledSet) => isLineComplete(ticket[2], calledSet),
  "full-house": (ticket, calledSet) => isFullHouse(ticket, calledSet),
};

function formatCountdown(ms) {
  return String(Math.max(0, Math.ceil(ms / 1000)));
}

export default function Tambola() {
  const location = useLocation();
  const navigate = useNavigate();
  const code = location.state?.code;
  const room = location.state?.room;

  if (!code) {
    return (
      <div className="tam-screen tam-gate">
        <div className="tam-popup">
          <h2>MULTIPLAYER ONLY</h2>
          <p>Tambola needs a real room with 2-7 players.</p>
          <button className="tam-button" onClick={() => navigate("/create-room")}>
            CREATE A ROOM
          </button>
        </div>
      </div>
    );
  }

  return <NetworkedTambola code={code} room={room} />;
}

function NetworkedTambola({ code, room }) {
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
      <div className="tam-screen tam-gate">
        <div className="tam-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="tam-screen tam-gate">
        <div className="tam-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  return (
    <TambolaGame
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

function TambolaGame({ state, mySeat, dispatch, canControl, nextGame, onNextGame, onRematch }) {
  const [showRules, setShowRules] = useState(false);
  const [now, setNow] = useState(Date.now());
  const { notifications, push } = useNotifications();
  const lastLogLength = useRef(0);

  useEffect(() => {
    if (!state.nextCallAt) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [state.nextCallAt]);

  useEffect(() => {
    const newLines = state.log.slice(lastLogLength.current);
    lastLogLength.current = state.log.length;

    for (const line of newLines) {
      if (/wins Tambola/i.test(line)) push("WINNER!", { tone: "good" });
      else if (/claims/i.test(line)) push("PRIZE CLAIMED!", { tone: "good" });
    }
  }, [state.log, push]);

  const calledSet = new Set(state.calledNumbers);
  const myTicket = state.myTicket;

  const claimPrize = async (prizeId) => {
    const response = await dispatch("claim-prize", { prizeId });
    if (!response?.success) push(response?.error || "Not yet!", { tone: "danger", seat: mySeat });
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
    <div className="tam-screen">
      <header className="tam-header">
        <h1 className="tam-logo">TAMBOLA</h1>
        <div className="tam-header-right">
          {state.nextCallAt && (
            <div className="tam-next-call">
              NEXT NUMBER
              <strong>{formatCountdown(state.nextCallAt - now)}s</strong>
            </div>
          )}
          <button className="tam-info-button" onClick={() => setShowRules(true)}>
            ⓘ
          </button>
        </div>
      </header>

      <div className="tam-layout">
        <aside className="tam-side-col">
          <div className="tam-section-title">PRIZES</div>
          <div className="tam-prize-list">
            {state.prizes.map((prize) => {
              const claimedSeat = state.claims[prize.id];
              const eligible = myTicket ? PRIZE_ELIGIBILITY[prize.id](myTicket, calledSet) : false;
              return (
                <div key={prize.id} className={`tam-prize-row ${claimedSeat !== null ? "claimed" : ""}`}>
                  <div className="tam-prize-label">{prize.label}</div>
                  {claimedSeat !== null ? (
                    <div className="tam-prize-winner">🏆 {nameFor(state, claimedSeat)}</div>
                  ) : (
                    <button className="tam-claim-button" disabled={!eligible} onClick={() => claimPrize(prize.id)}>
                      CLAIM
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="tam-section-title">PLAYERS</div>
          <div className="tam-player-list">
            {state.players.map((player) => {
              const wonCount = Object.values(state.claims).filter((s) => s === player.seat).length;
              return (
                <div
                  key={player.seat}
                  className={`tam-player-row ${player.seat === mySeat ? "self" : ""}`}
                >
                  <span>
                    {nameFor(state, player.seat)}
                    {player.seat === mySeat ? " (you)" : ""}
                  </span>
                  {wonCount > 0 && <strong>🏆 x{wonCount}</strong>}
                </div>
              );
            })}
          </div>
        </aside>

        <section className="tam-board-col">
          <div className="tam-last-called">
            <span>LAST CALLED</span>
            <strong>{state.lastCalled ?? "--"}</strong>
          </div>

          <div className="tam-number-board">
            {Array.from({ length: 90 }, (_, i) => i + 1).map((n) => (
              <div
                key={n}
                className={`tam-number-cell ${calledSet.has(n) ? "called" : ""} ${n === state.lastCalled ? "latest" : ""}`}
              >
                {n}
              </div>
            ))}
          </div>

          {myTicket && (
            <>
              <div className="tam-section-title">MY TICKET</div>
              <div className="tam-ticket">
                {myTicket.map((row, rowIndex) => (
                  <div className="tam-ticket-row" key={rowIndex}>
                    {row.map((num, colIndex) => (
                      <div
                        key={colIndex}
                        className={`tam-ticket-cell ${num === null ? "blank" : ""} ${
                          num !== null && calledSet.has(num) ? "marked" : ""
                        }`}
                      >
                        {num ?? ""}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          <GameLog entries={logWithNicknames(state.log, state)} title="EVENTS" />
        </section>
      </div>

      {showRules && <RulesModal title="HOW TO PLAY" sections={RULES_SECTIONS} onClose={() => setShowRules(false)} />}

      <ActionNotification notifications={notifications} />
    </div>
  );
}

function VictoryScreen({ state, mySeat, canControl, nextGame, onNextGame, onRematch }) {
  return (
    <div className="tam-screen tam-gate">
      <div className="tam-popup tam-victory">
        <div className="tam-trophy">🏆</div>
        <h1>{nameFor(state, state.winner)} WINS!</h1>
        <p>Full House complete!</p>

        <div className="tam-final-stats">
          {state.prizes.map((prize) => {
            const claimedSeat = state.claims[prize.id];
            return (
              <div key={prize.id} className="tam-final-row">
                <span>{prize.label}</span>
                <strong>{claimedSeat !== null ? nameFor(state, claimedSeat) : "unclaimed"}</strong>
              </div>
            );
          })}
        </div>

        {canControl ? (
          <div className="tam-postgame-actions">
            <button className="tam-button" onClick={onRematch}>
              REMATCH
            </button>
            {nextGame && (
              <button className="tam-button next" onClick={onNextGame}>
                NEXT GAME: {nextGame.toUpperCase()}
              </button>
            )}
          </div>
        ) : (
          <p className="tam-waiting-host">Waiting for the host to choose what's next...</p>
        )}
      </div>
    </div>
  );
}
