import "./App.css";

export default function App() {
  return (
    <div className="screen">

      <div className="sun"></div>

      <div className="cloud cloud1"></div>
      <div className="cloud cloud2"></div>

      <div className="panel">

        <h1 className="logo">
          GFG
        </h1>

        <p className="subtitle">
          Games For Groups
        </p>

        <input
          placeholder="Nickname"
        />

        <input
          placeholder="Room Code"
        />

        <button className="join">
          JOIN ROOM
        </button>

        <button className="create">
          CREATE ROOM
        </button>

      </div>

      <div className="grass"></div>

    </div>
  );
}