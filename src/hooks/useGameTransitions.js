import { useEffect, useState } from "react";
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

  // `room` is just whatever navigation-state snapshot got handed down the
  // chain of game-to-game redirects -- often stale by the time a game
  // actually finishes (it doesn't get updated as playedGames accumulates).
  // Refetch fresh so "next game" and "anything left to play" are computed
  // from the room's real current state, not a leftover snapshot.
  const [freshRoom, setFreshRoom] = useState(room || null);

  useEffect(() => {
    if (!code) return;

    const refetch = () => {
      socket.emit("get-room", { code }, (response) => {
        if (response?.success) setFreshRoom(response.room);
      });
    };

    refetch();

    const handleStarted = ({ game: startedGame }) => {
      const route = GAME_ROUTES[startedGame];
      if (!route) return;

      navigate(route, {
        replace: true,
        state: { code, room, game: startedGame },
      });
    };

    // The room's game session was ended without a next game to jump to
    // (everyone bored-skipped with nowhere left to go, or the group is
    // done with this lineup) -- send everyone back to the lobby together.
    const handleReturnToLobby = () => {
      navigate(`/room/${code}`, { replace: true, state: { code, room } });
    };

    // The lineup itself changed (someone edited games from the lobby
    // mid-session) -- keep our "what's next" math in sync with it too.
    socket.on("room-games-updated", refetch);
    socket.on("game-started", handleStarted);
    socket.on("return-to-lobby", handleReturnToLobby);
    return () => {
      socket.off("room-games-updated", refetch);
      socket.off("game-started", handleStarted);
      socket.off("return-to-lobby", handleReturnToLobby);
    };
    // room is only used to pass along to the next page, not to decide
    // whether to (re)subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, navigate]);

  const playableGames = (freshRoom?.games || []).filter((g) => NETWORKED_GAMES.has(g));
  const playedGames = new Set(freshRoom?.playedGames || []);
  const currentIndex = playableGames.indexOf(currentGame);

  // The next game still worth playing -- the first UNPLAYED game found
  // walking forward from here (wrapping once), not just "whatever's next
  // by list position." Without this, finishing (or bored-skipping) the
  // last unplayed game in the lineup would cycle back to a game already
  // played instead of correctly recognizing nothing fresh is left and
  // routing back to the lobby to pick a new lineup.
  let nextGame = null;
  if (currentIndex !== -1 && playableGames.length > 1) {
    for (let step = 1; step < playableGames.length; step++) {
      const candidate = playableGames[(currentIndex + step) % playableGames.length];
      if (!playedGames.has(candidate)) {
        nextGame = candidate;
        break;
      }
    }
  }

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
