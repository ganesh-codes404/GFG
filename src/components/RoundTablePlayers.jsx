import "./GameUI.css";

/**
 * Arranges any number of players in an ellipse around a central table, with
 * arbitrary content (a card deck, a board, whatever) in the middle. Position
 * is computed from the player count, not hardcoded per-layout, so it adapts
 * to 2..N players automatically.
 */
export default function RoundTablePlayers({ players, renderPlayer, center, className = "" }) {
  const count = players.length;

  return (
    <div className={`round-table ${className}`}>
      <div className="round-table-center">{center}</div>

      {players.map((player, index) => {
        const angle = (360 / count) * index - 90; // start at top, go clockwise
        const rad = (angle * Math.PI) / 180;
        const x = 50 + 42 * Math.cos(rad);
        const y = 50 + 40 * Math.sin(rad);

        return (
          <div
            key={player.seat ?? index}
            className="round-table-seat"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            {renderPlayer(player, index)}
          </div>
        );
      })}
    </div>
  );
}
