import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import QRCode from "react-qr-code";
import "./create_room.css";
import { socket } from "./socket";
import {
  GAME_ROUTES,
  GAMES_BY_PLAYERS,
  MAX_GAMES,
  playerCountRequirementLabel,
  playerCountSatisfied,
} from "./gameConfig";

export default function Lobby() {
  const { code } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const [room, setRoom] = useState(location.state?.room || null);
  const [notFound, setNotFound] = useState(false);
  const [pickingGames, setPickingGames] = useState(false);
  const [selectedGames, setSelectedGames] = useState([]);
  const [copied, setCopied] = useState(false);

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

    // Someone (any player, not just whoever's looking at the lobby right
    // now) confirmed a fresh lineup -- pick up the new list and close the
    // picker if it happened to be open here too.
    const handleGamesUpdated = ({ games }) => {
      setRoom((current) => (current ? { ...current, games, allGamesPlayed: false } : current));
      setPickingGames(false);
      setSelectedGames([]);
    };

    socket.on("player-joined", handleJoined);
    socket.on("player-left", handleLeft);
    socket.on("game-started", handleStarted);
    socket.on("room-games-updated", handleGamesUpdated);

    return () => {
      socket.off("player-joined", handleJoined);
      socket.off("player-left", handleLeft);
      socket.off("game-started", handleStarted);
      socket.off("room-games-updated", handleGamesUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // The room's just played through its entire lineup -- proactively offer
  // a fresh one instead of leaving the group to just keep re-cycling the
  // same games (or stuck with no obvious way to pick something new).
  useEffect(() => {
    if (room?.allGamesPlayed) setPickingGames(true);
  }, [room?.allGamesPlayed]);

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

  // Web Share API hands the room code straight to whatever messaging app
  // the player picks from their device's native share sheet (WhatsApp,
  // iMessage/SMS, Telegram, etc.) -- the fastest possible path on mobile.
  // Desktop browsers mostly don't support it, so fall back to a clipboard
  // copy there (with a brief "COPIED!" confirmation, since there's no
  // built-in share-sheet feedback to rely on).
  const shareRoom = async () => {
    const joinUrl = `${window.location.origin}${window.location.pathname}#/?join=${room.code}`;
    const text = `Join my Games For Groups room! Code: ${room.code}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Games For Groups", text, url: joinUrl });
      } catch {
        // User backed out of the share sheet -- not worth surfacing.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(`${text}\n${joinUrl}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access blocked -- nothing more we can do silently.
    }
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

  // Lets the group tweak their lineup at any time, not just after they've
  // burned through it -- pre-fills the picker with the current games so
  // this reads as "edit," not "start over from nothing."
  const openGameEditor = () => {
    setSelectedGames(room.games);
    setPickingGames(true);
  };

  const toggleGame = (game) => {
    setSelectedGames((current) => {
      if (current.includes(game)) return current.filter((item) => item !== game);
      if (current.length >= MAX_GAMES) return current;
      return [...current, game];
    });
  };

  const confirmNewGames = () => {
    socket.emit("update-room-games", { code, games: selectedGames }, (response) => {
      if (!response?.success) {
        alert("Could not update the games.");
        return;
      }

      setRoom(response.room);
      setPickingGames(false);
      setSelectedGames([]);
    });
  };

  // Games available for a room this size -- keyed by capacity, not how
  // many have actually joined yet, so the picker doesn't shrink out from
  // under a group that's temporarily short a player. GAMES_BY_PLAYERS also
  // lists planned-but-not-built games (see gameConfig.js), so filter down
  // to ones with an actual route -- otherwise picking one here would just
  // land back on a permanent "COMING SOON" row.
  const availableGames = (GAMES_BY_PLAYERS[room.maxPlayers] || []).filter((game) => GAME_ROUTES[game]);

  if (pickingGames) {
    return (
      <main className="create-room-screen">
        <div className="create-room-sun" />
        <div className="create-room-cloud create-room-cloud-1" />
        <div className="create-room-cloud create-room-cloud-2" />

        <section className="create-room-panel">
          <h1 className="create-room-logo">{room.allGamesPlayed ? "PLAY MORE?" : "EDIT GAMES"}</h1>

          <p className="create-room-subtitle">
            {room.allGamesPlayed
              ? "You've played every game in this room's lineup! Pick up to "
              : "Pick up to "}
            {MAX_GAMES} for {room.maxPlayers} players.
          </p>

          <div className="game-grid">
            {availableGames.map((game, index) => {
              const selected = selectedGames.includes(game);
              const disabled = !selected && selectedGames.length >= MAX_GAMES;

              return (
                <button
                  key={game}
                  type="button"
                  disabled={disabled}
                  className={`game-card ${selected ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                  onClick={() => toggleGame(game)}
                >
                  <span className="game-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="game-name">{game}</span>
                  <span className="game-check">{selected ? "✓" : "+"}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="create-room-button"
            disabled={selectedGames.length === 0}
            onClick={confirmNewGames}
          >
            CONFIRM GAMES
          </button>

          <button
            type="button"
            className="create-room-button secondary"
            onClick={() => {
              setPickingGames(false);
              setSelectedGames([]);
            }}
          >
            {room.allGamesPlayed ? "KEEP THE CURRENT LINEUP" : "CANCEL"}
          </button>
        </section>

        <div className="create-room-grass" />
      </main>
    );
  }

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

          <button type="button" className="room-share-button" onClick={shareRoom}>
            {copied ? "COPIED!" : "📤 SHARE ROOM CODE"}
          </button>

          <div className="room-qr">
            <div className="room-qr-code">
              <QRCode
                value={`${window.location.origin}${window.location.pathname}#/?join=${room.code}`}
                size={128}
                viewBox="0 0 128 128"
              />
            </div>
            <span className="room-qr-label">SCAN TO JOIN</span>
          </div>

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

          <div className="lobby-games-header">
            <span className="create-room-label">GAMES IN THIS ROOM</span>
            <button type="button" className="lobby-edit-games-button" onClick={openGameEditor}>
              🎮 CHANGE GAMES
            </button>
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
