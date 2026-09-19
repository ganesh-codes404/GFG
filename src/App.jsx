import { useEffect, useState } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import "./App.css";
import CreateRoom from "./create_room";
import Lobby from "./Lobby";
import ServerStatusBanner from "./ServerStatusBanner";
import BoredMeter from "./components/BoredMeter";
import { socket } from "./socket";
import BattleRoyale from "./assets/BattleRoyale";
import SecretAgent from "./assets/SecretAgent";
import Chess from "./assets/Chess";
import Connect4 from "./assets/Connect4";
import TicTacToe from "./assets/TicTacToe";
import Catan from "./assets/Catan";
import OneAndOnly from "./assets/OneAndOnly";
import AndhraBusiness from "./assets/AndhraBusiness";
import SnakesAndLadders from "./assets/SnakesAndLadders";
import Ludo from "./assets/Ludo";
import WordRush from "./assets/WordRush";
import Imposter from "./assets/Imposter";
import Pictionary from "./assets/Pictionary";
import Checkers from "./assets/Checkers";
import GuessWho from "./assets/GuessWho";
import Tambola from "./assets/Tambola";

function Home() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [showJoinPopup, setShowJoinPopup] = useState(false);
  const [roomCode, setRoomCode] = useState("");

  // Scanning a room's QR code lands here with ?join=CODE -- jump straight
  // into the join popup with the code already filled in, so the only thing
  // left to do is type a nickname.
  useEffect(() => {
    const joinCode = searchParams.get("join");
    if (!joinCode) return;

    setRoomCode(joinCode.trim().toUpperCase());
    setShowJoinPopup(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

const handleJoin = () => {
  const code = roomCode.trim().toUpperCase();

  if (!code) return;

  const nicknameInput = document.querySelector(
    '.panel input[placeholder="Nickname"]'
  );

  const nickname = nicknameInput?.value.trim();

  if (!nickname) {
    alert("Enter a nickname first!");
    return;
  }

  socket.emit(
    "join-room",
    {
      code,
      nickname,
    },
    (response) => {
      if (!response.success) {
        if (response.error === "ROOM_NOT_FOUND") {
          alert("Room doesn't exist!");
        }

        if (response.error === "ROOM_FULL") {
          alert("That room is full!");
        }

        if (response.error === "NICKNAME_TAKEN") {
          alert("That nickname is already taken!");
        }

        return;
      }

      setShowJoinPopup(false);

      navigate(`/room/${response.room.code}`, {
        state: { room: response.room },
      });
    }
  );
};

  return (
    <div className="screen">

      <div className="sun"></div>
      <div className="cloud cloud1"></div>
      <div className="cloud cloud2"></div>

      <div className="panel">

        <h1 className="logo">
          GFG
        </h1>

        <p className="subtitle">
          Games For Groups
        </p>

        <input
          placeholder="Nickname"
        />

        <button
          className="join"
          onClick={() => setShowJoinPopup(true)}
        >
          JOIN ROOM
        </button>

        <button
          className="create"
          onClick={() => navigate("/create-room")}
        >
          CREATE ROOM
        </button>

      </div>

      <div className="grass"></div>

      {showJoinPopup && (
        <div
          className="join-overlay"
          onClick={() => setShowJoinPopup(false)}
        >
          <div
            className="join-popup"
            onClick={(e) => e.stopPropagation()}
          >

            <button
              className="popup-close"
              onClick={() => setShowJoinPopup(false)}
            >
              X
            </button>

            <h2 className="join-popup-title">
              JOIN ROOM
            </h2>

            <p className="join-popup-subtitle">
              Enter your room code
            </p>

            <input
              autoFocus
              className="room-code-input"
              placeholder="ABC123"
              maxLength={6}
              value={roomCode}
              onChange={(e) =>
                setRoomCode(e.target.value.toUpperCase())
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleJoin();
                }
              }}
            />

            <button
              className="popup-join-button"
              onClick={handleJoin}
              disabled={roomCode.length === 0}
            >
              JOIN
            </button>

          </div>
        </div>
      )}

    </div>
  );
}

// Wraps a networked game's route with the shared bored-meter widget,
// without every one of the 13 game components needing to know it exists --
// it reads the same location state each game already gets navigated in
// with (code/room) and mounts entirely alongside, not inside, the game.
function GameShell({ name, children }) {
  const location = useLocation();
  const code = location.state?.code;
  const room = location.state?.room;

  return (
    <>
      {children}
      {code && <BoredMeter code={code} room={room} currentGame={name} />}
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <ServerStatusBanner />
      <Routes>

        <Route path="/" element={<Home />} />

        <Route
          path="/create-room"
          element={<CreateRoom />}
        />

        <Route
          path="/room/:code"
          element={<Lobby />}
        />

        <Route
          path="/battle-royale"
          element={<BattleRoyale />}
        />

        <Route
          path="/secret-agent"
          element={<SecretAgent />}
        />

        <Route
          path="/chess"
          element={<GameShell name="Chess"><Chess /></GameShell>}
        />

        <Route
          path="/connect-4"
          element={<GameShell name="Connect 4"><Connect4 /></GameShell>}
        />

        <Route
          path="/tic-tac-toe"
          element={<GameShell name="Tic Tac Toe"><TicTacToe /></GameShell>}
        />

        <Route
          path="/catan"
          element={<GameShell name="Catan"><Catan /></GameShell>}
        />

        <Route
          path="/one-and-only"
          element={<GameShell name="One and Only"><OneAndOnly /></GameShell>}
        />

        <Route
          path="/andhra-business"
          element={<GameShell name="Andhra Business"><AndhraBusiness /></GameShell>}
        />

        <Route
          path="/snakes-and-ladders"
          element={<GameShell name="Snakes and Ladders"><SnakesAndLadders /></GameShell>}
        />

        <Route
          path="/ludo"
          element={<GameShell name="Ludo"><Ludo /></GameShell>}
        />

        <Route
          path="/word-rush"
          element={<GameShell name="Word Rush"><WordRush /></GameShell>}
        />

        <Route
          path="/imposter"
          element={<GameShell name="Imposter"><Imposter /></GameShell>}
        />

        <Route
          path="/pictionary"
          element={<GameShell name="Pictionary"><Pictionary /></GameShell>}
        />

        <Route
          path="/checkers"
          element={<GameShell name="Checkers"><Checkers /></GameShell>}
        />

        <Route
          path="/guess-who"
          element={<GameShell name="Guess Who"><GuessWho /></GameShell>}
        />

        <Route
          path="/tambola"
          element={<GameShell name="Tambola"><Tambola /></GameShell>}
        />

        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </HashRouter>
  );
}