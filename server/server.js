const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const GAMES = require("./games");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    // Reflects whatever origin the browser sends -- lets a friend on the
    // same network reach this server at your LAN IP instead of only
    // "localhost", without hardcoding every possible address here.
    origin: true,
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

const rooms = new Map();

// Games that don't have a server-side engine yet still get a shared
// "everyone starts together" signal, they just each run their own local
// simulation once there (see GAMES for the ones that are fully networked).
const LEGACY_REQUIRED_PLAYERS = {
  "Battle Royale": 7,
  "Secret Agent": 7,
};

function requiredPlayersFor(game) {
  return GAMES[game]?.requiredPlayers ?? LEGACY_REQUIRED_PLAYERS[game];
}

function publicRoom(room) {
  return {
    code: room.code,
    maxPlayers: room.maxPlayers,
    games: room.games,
    players: room.players,
  };
}

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
      room: publicRoom(room),
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
      room: publicRoom(room),
    });

    // Tell everyone else in the room
    socket.to(roomCode).emit("player-joined", {
      player,
      players: room.players,
    });

    console.log(`${nickname} joined ${roomCode}`);
  });

  // GET ROOM (used when landing on the lobby directly, e.g. a refresh)
  socket.on("get-room", ({ code }, callback) => {
    const room = rooms.get((code || "").trim().toUpperCase());

    if (!room) {
      callback({ success: false, error: "ROOM_NOT_FOUND" });
      return;
    }

    socket.join(room.code);

    callback({ success: true, room: publicRoom(room) });
  });

  // START GAME (host only) -- everyone in the room gets pushed to the
  // game's route together. Games with a server engine (see server/games)
  // also get an authoritative session created here.
  socket.on("start-game", ({ code, game }, callback) => {
    const room = rooms.get((code || "").trim().toUpperCase());

    if (!room) {
      callback({ success: false, error: "ROOM_NOT_FOUND" });
      return;
    }

    const requester = room.players.find((player) => player.id === socket.id);

    if (!requester?.isHost) {
      callback({ success: false, error: "NOT_HOST" });
      return;
    }

    const required = requiredPlayersFor(game);

    if (!required) {
      callback({ success: false, error: "UNKNOWN_GAME" });
      return;
    }

    if (room.players.length !== required) {
      callback({ success: false, error: "WRONG_PLAYER_COUNT" });
      return;
    }

    const engine = GAMES[game];

    room.game = engine
      ? {
          type: game,
          engine,
          state: engine.createInitialState(),
          // Snapshot of socket ids in join order -- this is what "seat 0",
          // "seat 1", etc. mean for the lifetime of this game session.
          seats: room.players.map((player) => player.id),
        }
      : null;

    io.to(room.code).emit("game-started", { code: room.code, game });

    callback({ success: true });

    console.log(`Room ${room.code} started ${game}`);
  });

  // JOIN GAME -- pulled by the game page once it mounts, so it always gets
  // the current state regardless of when its "game-state" listener attaches.
  socket.on("join-game", ({ code }, callback) => {
    const room = rooms.get((code || "").trim().toUpperCase());

    if (!room?.game) {
      callback({ success: false, error: "GAME_NOT_FOUND" });
      return;
    }

    const seat = room.game.seats.indexOf(socket.id);

    if (seat === -1) {
      callback({ success: false, error: "NOT_A_PLAYER" });
      return;
    }

    socket.join(room.code);

    callback({
      success: true,
      seat,
      state: room.game.engine.viewFor(room.game.state, seat),
    });
  });

  // GAME ACTION -- server validates and applies the move, then broadcasts
  // the resulting state to every seat (each seat can get its own view, for
  // games with hidden information).
  socket.on("game-action", ({ code, action, payload }, callback) => {
    const room = rooms.get((code || "").trim().toUpperCase());

    if (!room?.game) {
      callback({ success: false, error: "GAME_NOT_FOUND" });
      return;
    }

    const seat = room.game.seats.indexOf(socket.id);

    if (seat === -1) {
      callback({ success: false, error: "NOT_A_PLAYER" });
      return;
    }

    try {
      room.game.state = room.game.engine.applyAction(
        room.game.state,
        seat,
        action,
        payload
      );
    } catch (err) {
      callback({ success: false, error: err.message });
      return;
    }

    room.game.seats.forEach((playerId, seatIndex) => {
      io.to(playerId).emit(
        "game-state",
        room.game.engine.viewFor(room.game.state, seatIndex)
      );
    });

    callback({ success: true });
  });

  // RESET GAME -- either player can start a rematch once a game exists.
  socket.on("reset-game", ({ code }, callback) => {
    const room = rooms.get((code || "").trim().toUpperCase());

    if (!room?.game) {
      callback({ success: false, error: "GAME_NOT_FOUND" });
      return;
    }

    const seat = room.game.seats.indexOf(socket.id);

    if (seat === -1) {
      callback({ success: false, error: "NOT_A_PLAYER" });
      return;
    }

    room.game.state = room.game.engine.createInitialState();

    room.game.seats.forEach((playerId, seatIndex) => {
      io.to(playerId).emit(
        "game-state",
        room.game.engine.viewFor(room.game.state, seatIndex)
      );
    });

    callback({ success: true });
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