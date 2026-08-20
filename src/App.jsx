import { useState } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import "./App.css";
import CreateRoom from "./create_room";
import { socket } from "./socket";
import BattleRoyale from "./assets/BattleRoyale";
import Catan from "./assets/Catan";

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

      console.log("Joined room:", response.room);

      // Close popup
      setShowJoinPopup(false);

      // Next step:
      // navigate(`/room/${code}`);
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

        <input
          placeholder="Room Code"
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
    <BrowserRouter>
      <Routes>

        <Route path="/" element={<Home />} />

        <Route
          path="/create-room"
          element={<CreateRoom />}
        />

        <Route
  path="/battle-royale"
  element={<BattleRoyale />}

/>
<Route
  path="/catan"
  element={<Catan />}
/>

      </Routes>
    </BrowserRouter>
  );
}