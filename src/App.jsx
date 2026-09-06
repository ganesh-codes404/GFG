import { useState } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import "./App.css";
import CreateRoom from "./create_room";
import Lobby from "./Lobby";
import ServerStatusBanner from "./ServerStatusBanner";
import { socket } from "./socket";
import BattleRoyale from "./assets/BattleRoyale";
import SecretAgent from "./assets/SecretAgent";
import Chess from "./assets/Chess";
import Connect4 from "./assets/Connect4";
import Catan from "./assets/Catan";
import OneAndOnly from "./assets/OneAndOnly";
import AndhraBusiness from "./assets/AndhraBusiness";
import SnakesAndLadders from "./assets/SnakesAndLadders";
import Ludo from "./assets/Ludo";
import WordRush from "./assets/WordRush";
import Imposter from "./assets/Imposter";
import Pictionary from "./assets/Pictionary";
import Checkers from "./assets/Checkers";

function Home() {
  const navigate = useNavigate();

  const [showJoinPopup, setShowJoinPopup] = useState(false);
  const [roomCode, setRoomCode] = useState("");

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
          element={<Chess />}
        />

        <Route
          path="/connect-4"
          element={<Connect4 />}
        />

        <Route
          path="/catan"
          element={<Catan />}
        />

        <Route
          path="/one-and-only"
          element={<OneAndOnly />}
        />

        <Route
          path="/andhra-business"
          element={<AndhraBusiness />}
        />

        <Route
          path="/snakes-and-ladders"
          element={<SnakesAndLadders />}
        />

        <Route
          path="/ludo"
          element={<Ludo />}
        />

        <Route
          path="/word-rush"
          element={<WordRush />}
        />

        <Route
          path="/imposter"
          element={<Imposter />}
        />

        <Route
          path="/pictionary"
          element={<Pictionary />}
        />

        <Route
          path="/checkers"
          element={<Checkers />}
        />

        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>
    </HashRouter>
  );
}