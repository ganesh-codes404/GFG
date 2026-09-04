import { io } from "socket.io-client";

// Use whatever host the page itself was loaded from (not a hardcoded
// "localhost") so a friend opening your LAN IP reaches the same server
// your browser does, instead of their own machine.
const SERVER_URL = `http://${window.location.hostname}:3001`;

export const socket = io(SERVER_URL);