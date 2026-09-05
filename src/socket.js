import { io } from "socket.io-client";

// When the frontend is deployed somewhere separate from the backend (e.g.
// GitHub Pages talking to a tunnel URL on someone's laptop), the server
// address can't be inferred from the page's own host -- it has to be baked
// in at build time via VITE_SERVER_URL. Local/LAN dev keeps working exactly
// as before: whatever host the page itself was loaded from, so a friend on
// your network reaches the same server your browser does.
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;

export const socket = io(SERVER_URL, {
  // Retry at a steady, quick pace so ServerStatusBanner (and the host
  // coming back online) reflects reality within a couple of seconds.
  reconnectionDelay: 1500,
  reconnectionDelayMax: 5000,
});