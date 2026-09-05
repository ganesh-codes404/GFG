import "./GameUI.css";

export default function GameLog({ entries, title = "GAME LOG" }) {
  return (
    <div className="game-log">
      <div className="game-log-title">{title}</div>
      <div className="game-log-body">
        {[...entries].reverse().map((line, i) => (
          <div key={i} className="game-log-line">
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
