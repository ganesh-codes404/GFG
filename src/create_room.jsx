import React, { useState } from "react";
import "./create_room.css";
import { socket } from "./socket";

const GAMES_BY_PLAYERS = {
  2: ["Chess", "Connect 4", "Tic Tac Toe", "Checkers", "Pong","Cricket"],
  3: ["Ludo", "UNO", "Dots & Boxes", "Carrom", "Word Rush","Snakes and Ladders","Catan"],
  4: ["Codenames", "Monopoly", "Pictionary", "Trivia","Ludo","Snakes and Ladders","Catan","UNO"],
  5: ["Werewolf", "Mafia", "Musical Chairs", "Quiz Battle", "Snakes and Ladders","Imposter","UNO","Catan","Monopoly"],
  6: ["Among Us", "Hide & Seek", "Team Trivia", "Bomb Tag", "Capture the Flag","Chinese Whisper","Pictonary"],
  7: ["Battle Royale", "Secret Agent", "UNO","Snakes and Ladders","Pictonary","Word Rush"],
};

const MAX_GAMES = 4;

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export default function CreateRoom({ onRoomCreated }) {
  const [playerCount, setPlayerCount] = useState(null);
  const [selectedGames, setSelectedGames] = useState([]);
  const [roomCode, setRoomCode] = useState("");

  const games = playerCount ? GAMES_BY_PLAYERS[playerCount] : [];

  const selectPlayers = (count) => {
    setPlayerCount(count);
    setSelectedGames([]);
    setRoomCode("");
  };

  const toggleGame = (game) => {
    setRoomCode("");

    setSelectedGames((current) => {
      if (current.includes(game)) {
        return current.filter((item) => item !== game);
      }

      if (current.length >= MAX_GAMES) return current;

      return [...current, game];
    });
  };

const createRoom = () => {
  if (!playerCount || selectedGames.length === 0) return;

  socket.emit(
    "create-room",
    {
      nickname: "YOUR_NICKNAME_HERE",
      playerCount,
      games: selectedGames,
    },
    (response) => {
      if (!response.success) return;

      console.log("Room created:", response.room);

      setRoomCode(response.room.code);
    }
  );
};

  return (
    <main className="create-room-screen">
      <div className="create-room-sun" />
      <div className="create-room-cloud create-room-cloud-1" />
      <div className="create-room-cloud create-room-cloud-2" />

      <section className="create-room-panel">
        <h1 className="create-room-logo">CREATE ROOM</h1>

        <p className="create-room-subtitle">
          Pick your players. Pick your games. Let the chaos begin.
        </p>

        <div className="create-room-section">
          <div className="create-room-label">
            <span>1.</span> PLAYERS
          </div>

          <div className="player-grid">
            {[2, 3, 4, 5, 6, 7].map((count) => (
              <button
                key={count}
                type="button"
                className={`player-button ${
                  playerCount === count ? "selected" : ""
                }`}
                onClick={() => selectPlayers(count)}
              >
                <strong>{count}</strong>
                <span>PLAYERS</span>
              </button>
            ))}
          </div>
        </div>

        {playerCount && (
          <div className="create-room-section games-section">
            <div className="create-room-label">
              <span>2.</span> CHOOSE GAMES
            </div>

            <div className="game-help">
              Choose up to {MAX_GAMES} games.
              <b>{selectedGames.length}/{MAX_GAMES}</b>
            </div>

            <div className="game-grid">
              {games.map((game, index) => {
                const selected = selectedGames.includes(game);
                const disabled =
                  !selected && selectedGames.length >= MAX_GAMES;

                return (
                  <button
                    key={game}
                    type="button"
                    disabled={disabled}
                    className={`game-card ${selected ? "selected" : ""} ${
                      disabled ? "disabled" : ""
                    }`}
                    onClick={() => toggleGame(game)}
                  >
                    <span className="game-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>

                    <span className="game-name">{game}</span>

                    <span className="game-check">
                      {selected ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="create-room-button"
              disabled={selectedGames.length === 0}
              onClick={createRoom}
            >
              CREATE ROOM
            </button>
          </div>
        )}

        {roomCode && (
          <div className="room-created">
            <div className="room-created-title">ROOM CREATED!</div>

            <div className="room-code">{roomCode}</div>

            <p>
              Share this code with your friends.
              <br />
              {playerCount} players · {selectedGames.length} game
              {selectedGames.length !== 1 ? "s" : ""}
            </p>

            <div className="selected-game-list">
              {selectedGames.map((game) => (
                <span key={game}>{game}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="create-room-grass" />
    </main>
  );
}