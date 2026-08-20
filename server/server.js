const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const rooms = new Map();

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code;

  do {
    code = "";

    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));

  return code;
}

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  // CREATE ROOM
  socket.on("create-room", ({ nickname, playerCount, games }, callback) => {
    const code = generateRoomCode();

    const room = {
      code,
      maxPlayers: playerCount,
      games,
      players: [
        {
          id: socket.id,
          nickname,
          isHost: true,
        },
      ],
    };

    rooms.set(code, room);

    socket.join(code);

    callback({
      success: true,
      room,
    });

    console.log(`Room ${code} created`);
  });

  // JOIN ROOM
  socket.on("join-room", ({ code, nickname }, callback) => {
    const roomCode = code.trim().toUpperCase();

    const room = rooms.get(roomCode);

    if (!room) {
      callback({
        success: false,
        error: "ROOM_NOT_FOUND",
      });

      return;
    }

    if (room.players.length >= room.maxPlayers) {
      callback({
        success: false,
        error: "ROOM_FULL",
      });

      return;
    }

    const alreadyJoined = room.players.some(
      (player) => player.nickname.toLowerCase() === nickname.toLowerCase()
    );

    if (alreadyJoined) {
      callback({
        success: false,
        error: "NICKNAME_TAKEN",
      });

      return;
    }

    const player = {
      id: socket.id,
      nickname,
      isHost: false,
    };

    room.players.push(player);

    socket.join(roomCode);

    callback({
      success: true,
      room,
    });

    // Tell everyone else in the room
    socket.to(roomCode).emit("player-joined", {
      player,
      players: room.players,
    });

    console.log(`${nickname} joined ${roomCode}`);
  });

  // DISCONNECT
  socket.on("disconnect", () => {
    for (const [code, room] of rooms.entries()) {
      const playerIndex = room.players.findIndex(
        (player) => player.id === socket.id
      );

      if (playerIndex === -1) continue;

      const [player] = room.players.splice(playerIndex, 1);

      io.to(code).emit("player-left", {
        player,
        players: room.players,
      });

      // Delete empty rooms
      if (room.players.length === 0) {
        rooms.delete(code);
      }

      console.log(`${player.nickname} left ${code}`);

      break;
    }
  });
});

app.get("/", (req, res) => {
  res.send("GFG server is running");
});

server.listen(3001, () => {
  console.log("GFG server running on http://localhost:3001");
});