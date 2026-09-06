import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import "./create_room.css";
import { socket } from "./socket";
import {
  GAME_ROUTES,
  playerCountRequirementLabel,
  playerCountSatisfied,
} from "./gameConfig";

export default function Lobby() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [room, setRoom] = useState(location.state?.room || null);
  const [notFound, setNotFound] = useState(false);

  const roomRef = useRef(room);
  roomRef.current = room;

  // Fetch the room if we landed here without it in navigation state
  // (a direct link or a refresh).
  useEffect(() => {
    if (roomRef.current) return;

    socket.emit("get-room", { code }, (response) => {
      if (!response.success) {
        setNotFound(true);
        return;
      }

      setRoom(response.room);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    const handleJoined = ({ players }) => {
      setRoom((current) => (current ? { ...current, players } : current));
    };

    const handleLeft = ({ players }) => {
      setRoom((current) => (current ? { ...current, players } : current));
    };

    const handleStarted = ({ game }) => {
      const route = GAME_ROUTES[game];
      if (!route) return;

      navigate(route, { state: { code, room: roomRef.current, game } });
    };

    socket.on("player-joined", handleJoined);
    socket.on("player-left", handleLeft);
    socket.on("game-started", handleStarted);

    return () => {
      socket.off("player-joined", handleJoined);
      socket.off("player-left", handleLeft);
      socket.off("game-started", handleStarted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // If a game is already in progress (e.g. the player hit "back" mid-game,
  // or reloaded the lobby), rejoin it instead of showing a stale "pick a
  // game" screen -- clicking Start again here would otherwise wipe out the
  // game everyone's already playing.
  useEffect(() => {
    if (!room?.activeGame) return;

    const route = GAME_ROUTES[room.activeGame];
    if (!route) return;

    navigate(route, {
      replace: true,
      state: { code, room, game: room.activeGame },
    });
  }, [room, code, navigate]);

  if (room?.activeGame) {
    return (
      <main className="create-room-screen">
        <section className="create-room-panel">
          <h1 className="create-room-logo">REJOINING...</h1>
        </section>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="create-room-screen">
        <section className="create-room-panel">
          <h1 className="create-room-logo">ROOM NOT FOUND</h1>

          <p className="create-room-subtitle">
            That room code doesn't exist (or the room closed).
          </p>

          <button className="create-room-button" onClick={() => navigate("/")}>
            BACK HOME
          </button>
        </section>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="create-room-screen">
        <section className="create-room-panel">
          <h1 className="create-room-logo">LOADING...</h1>
        </section>
      </main>
    );
  }

  const canStart = (game) => {
    if (!GAME_ROUTES[game]) return false;

    return playerCountSatisfied(game, room.players.length, room.maxPlayers);
  };

  const startGame = (game) => {
    socket.emit("start-game", { code, game }, (response) => {
      if (response.success) return;

      if (response.error === "WRONG_PLAYER_COUNT") {
        alert("Wrong number of players to start this game.");
      } else {
        alert("Could not start the game.");
      }
    });
  };

  return (
    <main className="create-room-screen">
      <div className="create-room-sun" />
      <div className="create-room-cloud create-room-cloud-1" />
      <div className="create-room-cloud create-room-cloud-2" />

      <section className="create-room-panel">
        <h1 className="create-room-logo">LOBBY</h1>

        <div className="room-created">
          <div className="room-created-title">ROOM {room.code}</div>

          <div className="room-code">{room.code}</div>

          <p>
            Share this code with your friends.
            <br />
            {room.players.length}/{room.maxPlayers} players joined
          </p>

          <div className="lobby-players">
            {room.players.map((player) => (
              <span key={player.id} className="lobby-player">
                {player.nickname}
                {player.isHost && <em>HOST</em>}
              </span>
            ))}
          </div>

          <div className="lobby-games">
            {room.games.map((game) => {
              const hasRoute = Boolean(GAME_ROUTES[game]);
              const ready = canStart(game);

              return (
                <div key={game} className="lobby-game-row">
                  <span className="lobby-game-name">{game}</span>

                  {hasRoute ? (
                    <button
                      type="button"
                      className="lobby-start-button"
                      disabled={!ready}
                      onClick={() => startGame(game)}
                    >
                      {ready ? "START GAME" : playerCountRequirementLabel(game)}
                    </button>
                  ) : (
                    <span className="lobby-start-button waiting">COMING SOON</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="create-room-grass" />
    </main>
  );
}
