const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const users = new Map(); // socket.id -> { username, position, linkId }
const pendingLinks = new Map(); // linkId -> { name, x, y, z }

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ROUTE POUR RECEVOIR LES POSITIONS DEPUIS BEAMMP
app.post("/api/positions", (req, res) => {
  const { players } = req.body;

  if (!players || !Array.isArray(players)) {
    return res.status(400).json({ error: "Format invalide" });
  }

  players.forEach((player) => {
    const { linkId, name, x, y, z } = player;

    pendingLinks.set(linkId, { name, x, y, z });

    for (const [socketId, user] of users.entries()) {
      if (user.linkId === linkId) {
        user.position = { x, y, z };
        user.username = name || user.username;

        io.emit("userPositionUpdate", {
          userId: socketId,
          username: user.username,
          x, y, z
        });
      }
    }
  });

  res.json({ success: true });
});

io.on("connection", (socket) => {
  console.log("✅ Nouvel utilisateur connecté :", socket.id);

  socket.on("register", ({ username, linkId }) => {
    users.set(socket.id, {
      id: socket.id,
      username,
      linkId,
      position: { x: 0, y: 0, z: 0 }
    });

    console.log(`📝 ${username} enregistré avec linkId: ${linkId}`);
    socket.emit("registered", { userId: socket.id });

    if (pendingLinks.has(linkId)) {
      const pending = pendingLinks.get(linkId);
      const user = users.get(socket.id);
      user.position = { x: pending.x, y: pending.y, z: pending.z };
      socket.emit("myPositionUpdate", pending);
    }

    socket.broadcast.emit("userJoined", { userId: socket.id, username });
    io.emit("usersList", { users: Array.from(users.values()) });
  });

  socket.on("getUsersList", () => {
    socket.emit("usersList", { users: Array.from(users.values()) });
  });

  socket.on("callUser", ({ to, username, isAuto }) => {
    console.log(`📞 Appel ${isAuto ? "AUTO" : "MANUEL"} vers ${to}`);
    io.to(to).emit("incomingCall", { from: socket.id, username });
  });

  socket.on("acceptCall", ({ to }) => {
    io.to(to).emit("callAccepted", { from: socket.id });
  });

  socket.on("rejectCall", ({ to }) => {
    io.to(to).emit("callRejected", { from: socket.id });
  });

  socket.on("signal", ({ to, data }) => {
    io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`🔴 ${user.username} déconnecté`);
      users.delete(socket.id);
      socket.broadcast.emit("userLeft", { userId: socket.id, username: user.username });
      io.emit("usersList", { users: Array.from(users.values()) });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
});
