import { useEffect, useState } from "react";
import { socket } from "./socket";

// The backend can be a laptop's tunnel that's simply not running yet --
// give visitors real feedback instead of buttons that silently do nothing.
export default function ServerStatusBanner() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleDisconnect);

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleDisconnect);
    };
  }, []);

  if (connected) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: "8px 16px",
        textAlign: "center",
        fontFamily: "Pixelify Sans, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        color: "#fff",
        background: "#d94457",
        borderBottom: "3px solid #17101f",
      }}
    >
      Can't reach the game server -- ask the host to make sure their server
      and tunnel are running.
    </div>
  );
}
