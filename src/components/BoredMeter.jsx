import { useEffect, useState } from "react";
import { socket } from "../socket";
import { useGameTransitions } from "../hooks/useGameTransitions";
import "./BoredMeter.css";

// A floating, top-right widget mounted alongside every networked game (see
// GameShell in App.jsx) -- entirely separate from any one game's own state,
// so it works identically everywhere without teaching each engine about it.
// Lets anyone flag "this game's dragging"; once half the table (or the
// host alone) has, it surfaces a one-tap skip. Also watches for the whole
// room's game lineup being exhausted and offers a way back to the lobby to
// pick more, without needing every game's own victory screen to know that.
export default function BoredMeter({ code, room, currentGame }) {
  const [mySeat, setMySeat] = useState(null);
  const [bored, setBored] = useState({ boredSeats: [], totalPlayers: 0, hostBored: false, canSkip: false });
  const [gameFinished, setGameFinished] = useState(false);
  const [freshRoom, setFreshRoom] = useState(null);
  const { nextGame, requestNextGame } = useGameTransitions({ code, room, currentGame });

  useEffect(() => {
    if (!code) return;

    // Both of these fire on mount AND every time the socket (re)connects --
    // a one-shot mount-only call left this widget permanently blank for
    // the rest of the game if the connection happened to be mid-reconnect
    // at that exact moment, with no way to recover even once it came back.
    const resync = () => {
      socket.emit("join-game", { code }, (response) => {
        if (response?.success) setMySeat(response.seat);
      });
      socket.emit("get-bored-state", { code }, (response) => {
        if (response?.success) setBored(response);
      });
    };

    resync();

    const handleBoredUpdate = (payload) => setBored(payload);
    const handleGameState = (payload) => setGameFinished(Boolean(payload?.finished));

    socket.on("connect", resync);
    socket.on("bored-update", handleBoredUpdate);
    socket.on("game-state", handleGameState);
    return () => {
      socket.off("connect", resync);
      socket.off("bored-update", handleBoredUpdate);
      socket.off("game-state", handleGameState);
    };
  }, [code]);

  // Once this game wraps up, check whether the room's whole lineup has now
  // been played through -- the `room` prop is just a snapshot from
  // whenever this page was navigated to, so this asks the server fresh
  // rather than trusting stale data.
  useEffect(() => {
    if (!gameFinished || !code) return;
    socket.emit("get-room", { code }, (response) => {
      if (response?.success) setFreshRoom(response.room);
    });
  }, [gameFinished, code]);

  if (!code || mySeat === null) return null;

  const amIBored = bored.boredSeats.includes(mySeat);
  const toggleBored = () => socket.emit("toggle-bored", { code });

  const handleSkip = () => {
    if (nextGame) requestNextGame();
    else socket.emit("end-game-session", { code });
  };

  const showAllPlayedBanner = gameFinished && freshRoom?.allGamesPlayed;

  return (
    <div className="bored-meter">
      <button
        className={`bored-toggle ${amIBored ? "active" : ""}`}
        onClick={toggleBored}
        title="Bored of this game?"
      >
        😴 {bored.boredSeats.length > 0 ? `${bored.boredSeats.length}/${bored.totalPlayers}` : "BORED?"}
      </button>

      {bored.canSkip && !gameFinished && (
        <div className="bored-banner">
          <span>
            {bored.totalPlayers === 2
              ? "Both players are bored!"
              : bored.hostBored
              ? "The host is bored!"
              : "Half the group is bored!"}
          </span>
          <button onClick={handleSkip}>
            {nextGame ? `SKIP TO ${nextGame.toUpperCase()}` : "SKIP -- PICK A NEW GAME"}
          </button>
        </div>
      )}

      {showAllPlayedBanner && (
        <div className="bored-banner postgame">
          <span>🎉 That's every game in this room's lineup!</span>
          <button onClick={() => socket.emit("end-game-session", { code })}>PLAY MORE GAMES</button>
        </div>
      )}
    </div>
  );
}
