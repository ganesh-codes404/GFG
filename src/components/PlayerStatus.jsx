export default function PlayerStatus({ isActive }) {
  return (
    <div className={`player-status ${isActive ? "your-turn" : "waiting"}`}>
      {isActive ? "YOUR TURN" : "WAITING"}
    </div>
  );
}
