import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "../socket";
import { GAME_ROUTES, NETWORKED_GAMES } from "../gameConfig";

/**
 * Shared "what happens after this game ends" logic for every networked
 * game: listens for anyone starting a different game from this room's
 * list (so everyone sitting on the finished screen gets carried along),
 * and works out which game is "next" in the room's selection to offer as
 * a one-click option alongside a plain rematch.
 */
export function useGameTransitions({ code, room, currentGame }) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!code) return;

    const handleStarted = ({ game: startedGame }) => {
      const route = GAME_ROUTES[startedGame];
      if (!route) return;

      navigate(route, {
        replace: true,
        state: { code, room, game: startedGame },
      });
    };

    socket.on("game-started", handleStarted);
    return () => socket.off("game-started", handleStarted);
    // room is only used to pass along to the next page, not to decide
    // whether to (re)subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, navigate]);

  const playableGames = (room?.games || []).filter((g) => NETWORKED_GAMES.has(g));
  const currentIndex = playableGames.indexOf(currentGame);

  const nextGame =
    playableGames.length > 1 && currentIndex !== -1
      ? playableGames[(currentIndex + 1) % playableGames.length]
      : null;

  // Any player can trigger a rematch or start the next game -- not just
  // the host. Kept as its own value (rather than inlining `true` at every
  // call site) so the postgame-actions gate has one obvious place to
  // change if that ever needs to be restricted again.
  const canControl = true;

  const requestNextGame = () => {
    if (!nextGame) return;

    socket.emit("start-game", { code, game: nextGame }, (response) => {
      if (response?.success) return;

      alert(
        response?.error === "WRONG_PLAYER_COUNT"
          ? `Need the right number of players to start ${nextGame}.`
          : "Could not start the next game."
      );
    });
  };

  return { nextGame, requestNextGame, canControl };
}
