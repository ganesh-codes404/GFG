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
import Dice from "../components/Dice";
import { useNotifications } from "../hooks/useNotifications";
import { useGameTransitions } from "../hooks/useGameTransitions";
import "./AndhraBusiness.css";

const CURRENT_GAME = "Andhra Business";

const GROUP_TYPES = ["property", "transport", "utility"];

const RULES_SECTIONS = [
  { heading: "Objective", body: "Buy, rent, and trade your way to being the last player who isn't bankrupt." },
  { heading: "Dice", body: "Roll two dice each turn and move that many spaces around the board." },
  { heading: "Buying", body: "Land on an unowned property, transport stop, or utility to buy it, or skip it." },
  { heading: "Rent", body: "Land on someone else's property and rent is charged automatically. Owning a full group doubles undeveloped rent." },
  { heading: "Development", body: "Own a full group? Develop any property in it for higher rent, up to a hotel level." },
  { heading: "Trading", body: "Propose cash and/or properties to another player; they can accept, reject, or you can cancel first." },
  { heading: "Events", body: "Event and Community spaces draw a card with a random effect -- money, movement, or jail." },
  { heading: "Bankruptcy", body: "Can't cover a debt even after mortgaging everything? You're out, and your properties return to the bank." },
];

function formatRupees(n) {
  const sign = n < 0 ? "-" : "";
  const digits = Math.abs(Math.round(n)).toString();
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${sign}₹${rest ? `${grouped},` : ""}${last3}`;
}

// Maps a board position (0-39) to a cell in an 11x11 perimeter grid.
function gridPosition(pos) {
  if (pos <= 10) return { row: 10, col: 10 - pos };
  if (pos <= 20) return { row: 10 - (pos - 10), col: 0 };
  if (pos <= 30) return { row: 0, col: pos - 20 };
  return { row: pos - 30, col: 10 };
}

export default function AndhraBusiness() {
  const location = useLocation();
  const navigate = useNavigate();
  const code = location.state?.code;
  const room = location.state?.room;

  if (!code) {
    return (
      <div className="ab-screen ab-gate">
        <div className="ab-popup">
          <h2>MULTIPLAYER ONLY</h2>
          <p>Andhra Business needs a real room with 4-7 players.</p>
          <button className="ab-button" onClick={() => navigate("/create-room")}>
            CREATE A ROOM
          </button>
        </div>
      </div>
    );
  }

  return <NetworkedAndhraBusiness code={code} room={room} />;
}

function NetworkedAndhraBusiness({ code, room }) {
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
      <div className="ab-screen ab-gate">
        <div className="ab-popup">
          <h2>CAN'T JOIN GAME</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="ab-screen ab-gate">
        <div className="ab-popup">
          <h2>CONNECTING...</h2>
        </div>
      </div>
    );
  }

  return (
    <AndhraBusinessGame
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

function AndhraBusinessGame({ state, mySeat, dispatch, isHost, nextGame, onNextGame, onRematch }) {
  const [showRules, setShowRules] = useState(false);
  const [showTrade, setShowTrade] = useState(false);
  const [showDevelop, setShowDevelop] = useState(false);
  const [rolling, setRolling] = useState(false);
  const { notifications, push } = useNotifications();
  const lastLogLength = useRef(0);

  const me = state.players.find((p) => p.seat === mySeat);
  const isMyTurn = state.currentSeat === mySeat && !me?.bankrupt;
  const mySpace = state.spaces[me?.position ?? 0];
  const myProp = state.properties[me?.position];

  useEffect(() => {
    const newLines = state.log.slice(lastLogLength.current);
    lastLogLength.current = state.log.length;

    for (const line of newLines) {
      if (/paid.*rent/i.test(line)) push("RENT PAID", { tone: "danger" });
      else if (/bought/i.test(line)) push("PROPERTY PURCHASED", { tone: "good" });
      else if (/bankrupt/i.test(line)) push("BANKRUPT", { tone: "danger" });
      else if (/tax/i.test(line)) push("TAX PAID", { tone: "danger" });
      else if (/collected/i.test(line)) push("+CASH", { tone: "good" });
      else if (/traded|trade/i.test(line)) push("PROPERTY TRADED", { tone: "info" });
    }
  }, [state.log, push]);

  const handleRoll = async () => {
    setRolling(true);
    await dispatch("roll-dice", {});
    setTimeout(() => setRolling(false), 500);
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

  const showBuyPrompt =
    isMyTurn &&
    state.phase === "main" &&
    mySpace &&
    GROUP_TYPES.includes(mySpace.type) &&
    myProp?.owner === null;

  const showJailPanel = isMyTurn && me?.inJail && state.phase !== "roll";

  const showDebtPanel = state.pendingDebt?.seat === mySeat;

  const players = state.players.map((p) => ({ seat: p.seat, ...p }));

  return (
    <div className="ab-screen">
      <header className="ab-header">
        <h1 className="ab-logo">ANDHRA BUSINESS</h1>
        <div className="ab-header-right">
          <DirectionIndicator clockwise />
          <button className="ab-info-button" onClick={() => setShowRules(true)}>
            ⓘ
          </button>
        </div>
      </header>

      <RoundTablePlayers
        className="ab-table"
        players={players}
        center={
          <Board state={state} />
        }
        renderPlayer={(player) => (
          <div className={`ab-seat ${player.seat === mySeat ? "self" : ""} ${player.bankrupt ? "bankrupt" : ""}`}>
            <div className="ab-seat-name" style={{ "--player-color": player.color }}>
              Player {player.seat + 1}
              {player.seat === mySeat ? " (you)" : ""}
            </div>
            {player.bankrupt ? (
              <div className="ab-seat-bankrupt">OUT</div>
            ) : (
              <>
                <div className="ab-seat-cash">{formatRupees(player.cash)}</div>
                <PlayerStatus isActive={state.currentSeat === player.seat} />
              </>
            )}
            <ActionNotification notifications={notifications.filter((n) => n.seat === player.seat)} />
          </div>
        )}
      />

      <div className="ab-controls">
        <div className="ab-dice-area">
          {state.lastRoll && <Dice values={[state.lastRoll.d1, state.lastRoll.d2]} rolling={rolling} total={state.lastRoll.total} />}
          <button className="ab-action-button roll" disabled={!isMyTurn || state.phase !== "roll"} onClick={handleRoll}>
            🎲 ROLL DICE
          </button>
        </div>

        <button className="ab-action-button" disabled={!isMyTurn || state.phase !== "main"} onClick={() => setShowDevelop(true)}>
          🏗 DEVELOP
        </button>

        <button className="ab-action-button" disabled={!isMyTurn || state.phase !== "main"} onClick={() => setShowTrade(true)}>
          🤝 TRADE
        </button>

        <button
          className="ab-action-button end-turn"
          disabled={!isMyTurn || state.phase !== "main"}
          onClick={() => dispatch("end-turn", {})}
        >
          END TURN
        </button>
      </div>

      {me && (
        <div className="ab-my-status">
          <span>YOUR CASH</span>
          <strong>{formatRupees(me.cash)}</strong>
        </div>
      )}

      <GameLog entries={state.log} title="EVENTS" />

      {state.tradeOffers.filter((t) => t.toSeat === mySeat || t.fromSeat === mySeat).length > 0 && (
        <div className="ab-trade-requests">
          <div className="ab-section-title">
            TRADE REQUESTS ({state.tradeOffers.filter((t) => t.toSeat === mySeat).length})
          </div>
          {state.tradeOffers
            .filter((t) => t.toSeat === mySeat || t.fromSeat === mySeat)
            .map((trade) => (
              <div key={trade.id} className="ab-trade-offer">
                <div>
                  Player {trade.fromSeat + 1} → Player {trade.toSeat + 1}
                </div>
                <div className="ab-trade-line">
                  Gives: {formatRupees(trade.giveCash)}
                  {trade.giveProperties.map((pos) => `, ${state.spaces[pos].name}`)}
                </div>
                <div className="ab-trade-line">
                  Wants: {formatRupees(trade.wantCash)}
                  {trade.wantProperties.map((pos) => `, ${state.spaces[pos].name}`)}
                </div>
                {trade.toSeat === mySeat && (
                  <div className="ab-trade-actions">
                    <button onClick={() => dispatch("respond-trade", { tradeId: trade.id, accept: true })}>ACCEPT</button>
                    <button onClick={() => dispatch("respond-trade", { tradeId: trade.id, accept: false })}>REJECT</button>
                  </div>
                )}
                {trade.fromSeat === mySeat && (
                  <div className="ab-trade-actions">
                    <button onClick={() => dispatch("cancel-trade", { tradeId: trade.id })}>CANCEL</button>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {showBuyPrompt && (
        <Modal onClose={() => {}}>
          <h2>{mySpace.name}</h2>
          <p>Purchase for {formatRupees(mySpace.price)}?</p>
          <div className="ab-confirm-row">
            <button className="ab-button" onClick={() => dispatch("buy-property", {})}>
              BUY
            </button>
            <button className="ab-button secondary" onClick={() => dispatch("skip-buy", {})}>
              SKIP
            </button>
          </div>
        </Modal>
      )}

      {showJailPanel && (
        <Modal onClose={() => {}}>
          <h2>TRAFFIC HALT</h2>
          <p>
            Attempt {me.jailTurns + 1} of 3. Roll doubles to escape, pay the fine, or use a
            get-out card.
          </p>
          <div className="ab-confirm-row">
            <button className="ab-button" onClick={handleRoll}>
              🎲 ROLL
            </button>
            <button className="ab-button secondary" disabled={me.cash < 10000} onClick={() => dispatch("pay-jail-fine", {})}>
              PAY FINE
            </button>
            {me.getOutOfJailCards > 0 && (
              <button className="ab-button secondary" onClick={() => dispatch("use-jail-card", {})}>
                USE CARD
              </button>
            )}
          </div>
        </Modal>
      )}

      {showDebtPanel && (
        <DebtModal state={state} mySeat={mySeat} dispatch={dispatch} />
      )}

      {showDevelop && (
        <DevelopModal state={state} mySeat={mySeat} dispatch={dispatch} onClose={() => setShowDevelop(false)} />
      )}

      {showTrade && (
        <TradeModal state={state} mySeat={mySeat} dispatch={dispatch} onClose={() => setShowTrade(false)} />
      )}

      {showRules && <RulesModal title="HOW TO PLAY" sections={RULES_SECTIONS} onClose={() => setShowRules(false)} />}
    </div>
  );
}

function Board({ state }) {
  return (
    <div className="ab-board">
      {state.spaces.map((space) => {
        const { row, col } = gridPosition(space.pos);
        const group = state.groups.find((g) => g.id === space.group);
        const prop = state.properties[space.pos];
        const occupants = state.players.filter((p) => p.position === space.pos && !p.bankrupt);

        return (
          <div
            key={space.pos}
            className={`ab-cell ab-cell-${space.type}`}
            style={{ gridRow: row + 1, gridColumn: col + 1 }}
          >
            {group && <div className="ab-cell-bar" style={{ background: group.color }} />}
            <div className="ab-cell-name">{space.name}</div>
            {space.price && <div className="ab-cell-price">{formatRupees(space.price)}</div>}
            {prop?.owner !== null && prop?.owner !== undefined && (
              <div
                className="ab-cell-owner"
                style={{ background: state.players[prop.owner]?.color }}
              />
            )}
            {prop?.houses > 0 && <div className="ab-cell-houses">{prop.houses === 5 ? "🏨" : "🏠".repeat(prop.houses)}</div>}
            {prop?.mortgaged && <div className="ab-cell-mortgaged">MORTGAGED</div>}
            <div className="ab-cell-tokens">
              {occupants.map((p) => (
                <span key={p.seat} className="ab-token" style={{ background: p.color }} title={`Player ${p.seat + 1}`} />
              ))}
            </div>
          </div>
        );
      })}
      <div className="ab-board-center-label">ANDHRA BUSINESS</div>
    </div>
  );
}

function DebtModal({ state, mySeat, dispatch }) {
  const myProps = Object.entries(state.properties).filter(([, prop]) => prop.owner === mySeat);

  return (
    <Modal onClose={() => {}}>
      <h2>SETTLE YOUR DEBT</h2>
      <p>You owe {formatRupees(state.pendingDebt.amount)}. Mortgage or sell developments to cover it.</p>

      <div className="ab-debt-list">
        {myProps.map(([pos, prop]) => {
          const space = state.spaces[pos];
          return (
            <div key={pos} className="ab-debt-row">
              <span>{space.name}</span>
              {prop.houses > 0 && (
                <button onClick={() => dispatch("sell-development", { pos: Number(pos) })}>SELL DEV</button>
              )}
              {!prop.mortgaged && prop.houses === 0 && (
                <button onClick={() => dispatch("mortgage", { pos: Number(pos) })}>MORTGAGE</button>
              )}
            </div>
          );
        })}
      </div>

      <button className="ab-button" onClick={() => dispatch("pay-debt", {})}>
        I'VE COVERED IT
      </button>
    </Modal>
  );
}

function DevelopModal({ state, mySeat, dispatch, onClose }) {
  const myProps = Object.entries(state.properties).filter(
    ([pos, prop]) => prop.owner === mySeat && state.spaces[pos].type === "property"
  );

  return (
    <Modal onClose={onClose}>
      <h2>DEVELOP PROPERTIES</h2>
      <div className="ab-develop-list">
        {myProps.length === 0 && <p>You don't own any developable properties.</p>}
        {myProps.map(([pos, prop]) => {
          const space = state.spaces[pos];
          return (
            <div key={pos} className="ab-develop-row">
              <span>{space.name}</span>
              <span>{prop.houses === 5 ? "Hotel" : `${prop.houses}/4 houses`}</span>
              <div className="ab-trade-actions">
                <button onClick={() => dispatch("develop", { pos: Number(pos) })}>
                  + {formatRupees(space.houseCost)}
                </button>
                {prop.houses > 0 && (
                  <button onClick={() => dispatch("sell-development", { pos: Number(pos) })}>SELL</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <button className="ab-button secondary" onClick={onClose}>
        CLOSE
      </button>
    </Modal>
  );
}

function TradeModal({ state, mySeat, dispatch, onClose }) {
  const [toSeat, setToSeat] = useState(null);
  const [giveCash, setGiveCash] = useState(0);
  const [wantCash, setWantCash] = useState(0);
  const [giveProperties, setGiveProperties] = useState([]);
  const [wantProperties, setWantProperties] = useState([]);

  const myProps = Object.entries(state.properties).filter(([, prop]) => prop.owner === mySeat);
  const theirProps = toSeat !== null ? Object.entries(state.properties).filter(([, prop]) => prop.owner === toSeat) : [];

  const toggle = (list, setList, pos) => {
    setList(list.includes(pos) ? list.filter((p) => p !== pos) : [...list, pos]);
  };

  const propose = async () => {
    if (toSeat === null) return;
    const resp = await dispatch("propose-trade", { toSeat, giveCash, wantCash, giveProperties, wantProperties });
    if (resp?.success) onClose();
  };

  return (
    <Modal onClose={onClose} className="ab-trade-modal">
      <h2>TRADE</h2>

      <div className="ab-player-select">
        {state.players
          .filter((p) => p.seat !== mySeat && !p.bankrupt)
          .map((p) => (
            <button key={p.seat} className={toSeat === p.seat ? "selected" : ""} onClick={() => setToSeat(p.seat)}>
              Player {p.seat + 1}
            </button>
          ))}
      </div>

      <div className="ab-trade-columns">
        <div>
          <div className="ab-trade-col-title">YOU GIVE</div>
          <label>
            Cash
            <input type="number" min="0" value={giveCash} onChange={(e) => setGiveCash(Number(e.target.value))} />
          </label>
          {myProps.map(([pos]) => (
            <label key={pos} className="ab-checkbox-row">
              <input
                type="checkbox"
                checked={giveProperties.includes(Number(pos))}
                onChange={() => toggle(giveProperties, setGiveProperties, Number(pos))}
              />
              {state.spaces[pos].name}
            </label>
          ))}
        </div>

        <div>
          <div className="ab-trade-col-title">YOU RECEIVE</div>
          <label>
            Cash
            <input type="number" min="0" value={wantCash} onChange={(e) => setWantCash(Number(e.target.value))} />
          </label>
          {theirProps.map(([pos]) => (
            <label key={pos} className="ab-checkbox-row">
              <input
                type="checkbox"
                checked={wantProperties.includes(Number(pos))}
                onChange={() => toggle(wantProperties, setWantProperties, Number(pos))}
              />
              {state.spaces[pos].name}
            </label>
          ))}
        </div>
      </div>

      <button className="ab-button" disabled={toSeat === null} onClick={propose}>
        PROPOSE TRADE
      </button>
      <button className="ab-button secondary" onClick={onClose}>
        CLOSE
      </button>
    </Modal>
  );
}

function VictoryScreen({ state, mySeat, isHost, nextGame, onNextGame, onRematch }) {
  const winner = state.players.find((p) => p.seat === state.winner);
  const propertyCounts = state.players.map(
    (p) => Object.values(state.properties).filter((prop) => prop.owner === p.seat).length
  );

  return (
    <div className="ab-screen ab-gate">
      <div className="ab-popup ab-victory">
        <div className="ab-trophy">🏆</div>
        <h1>ANDHRA BUSINESS WINNER</h1>
        <p>
          Player {state.winner + 1} · {formatRupees(winner?.cash ?? 0)} ·{" "}
          {propertyCounts[state.winner]} properties
        </p>

        <div className="ab-final-stats">
          {state.players.map((p, i) => (
            <div key={p.seat} className="ab-final-row" style={{ "--player-color": p.color }}>
              <span>
                Player {p.seat + 1}
                {p.seat === mySeat ? " (you)" : ""}
                {p.bankrupt ? " (bankrupt)" : ""}
              </span>
              <strong>{formatRupees(p.cash)}</strong>
              <small>{propertyCounts[i]} properties</small>
            </div>
          ))}
        </div>

        {isHost ? (
          <div className="ab-postgame-actions">
            <button className="ab-button" onClick={onRematch}>
              REMATCH
            </button>
            {nextGame && (
              <button className="ab-button next" onClick={onNextGame}>
                NEXT GAME: {nextGame.toUpperCase()}
              </button>
            )}
          </div>
        ) : (
          <p className="ab-waiting-host">Waiting for the host to choose what's next...</p>
        )}
      </div>
    </div>
  );
}
