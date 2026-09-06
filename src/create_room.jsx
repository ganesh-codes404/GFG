import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./create_room.css";
import { socket } from "./socket";

const GAMES_BY_PLAYERS = {
  2: ["Chess", "Connect 4", "One and Only", "Word Rush", "Tic Tac Toe", "Checkers", "Pong","Cricket"],
  3: ["Ludo", "One and Only", "Dots & Boxes", "Carrom", "Word Rush","Snakes and Ladders","Catan"],
  4: ["Codenames", "Andhra Business", "Trivia","Ludo","Word Rush","Snakes and Ladders","Catan","One and Only"],
  5: ["Werewolf", "Mafia", "Musical Chairs", "Quiz Battle", "Snakes and Ladders","Imposter","One and Only","Catan","Andhra Business","Word Rush","Pictionary"],
  6: ["Among Us", "Hide & Seek", "Team Trivia", "Bomb Tag", "Capture the Flag","Chinese Whisper","Andhra Business","Snakes and Ladders","Word Rush","Imposter","Pictionary"],
  7: ["Battle Royale", "Secret Agent", "Andhra Business","Snakes and Ladders","Word Rush","Imposter","Pictionary"],
};

const MAX_GAMES = 4;

export default function CreateRoom() {
  const navigate = useNavigate();

  const [nickname, setNickname] = useState("");
  const [playerCount, setPlayerCount] = useState(null);
  const [selectedGames, setSelectedGames] = useState([]);

  const games = playerCount ? GAMES_BY_PLAYERS[playerCount] : [];

  const selectPlayers = (count) => {
    setPlayerCount(count);
    setSelectedGames([]);
  };

  const toggleGame = (game) => {
    setSelectedGames((current) => {
      if (current.includes(game)) {
        return current.filter((item) => item !== game);
      }

      if (current.length >= MAX_GAMES) return current;

      return [...current, game];
    });
  };

  const createRoom = () => {
    if (!nickname.trim() || !playerCount || selectedGames.length === 0) return;

    socket.emit(
      "create-room",
      {
        nickname: nickname.trim(),
        playerCount,
        games: selectedGames,
      },
      (response) => {
        if (!response.success) return;

        navigate(`/room/${response.room.code}`, {
          state: { room: response.room },
        });
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
            <span>1.</span> YOUR NICKNAME
          </div>

          <input
            className="create-room-nickname"
            placeholder="Nickname"
            maxLength={20}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>

        <div className="create-room-section">
          <div className="create-room-label">
            <span>2.</span> PLAYERS
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
              <span>3.</span> CHOOSE GAMES
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
              disabled={!nickname.trim() || selectedGames.length === 0}
              onClick={createRoom}
            >
              CREATE ROOM
            </button>
          </div>
        )}
      </section>

      <div className="create-room-grass" />
    </main>
  );
}
