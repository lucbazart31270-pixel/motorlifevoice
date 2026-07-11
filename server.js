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

const users = new Map(); // Utilisateurs connectés via Socket.io (navigateur/site)
const PROXIMITY_RANGE = 50; // 50 mètres en jeu (ajuste selon tes besoins)

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ✅ ROUTE POUR RECEVOIR LES POSITIONS DEPUIS BEAMMP (Lua)
app.post("/api/positions", (req, res) => {
  const { players } = req.body;

  if (!players || !Array.isArray(players)) {
    return res.status(400).json({ error: "Format invalide" });
  }

  players.forEach((player) => {
    const { playerId, name, x, y, z } = player;

    // On enregistre/actualise la position dans notre Map
    const existing = users.get(playerId);
    users.set(playerId, {
      id: playerId,
      username: name,
      position: { x, y, z },
      fromBeamMP: true
    });

    // Diffuser la nouvelle position aux clients web connectés
    io.emit("userPositionUpdate", {
      userId: playerId,
      username: name,
      x, y, z
    });

    // Si nouveau joueur, prévenir tout le monde
    if (!existing) {
      io.emit("userJoined", { userId: playerId, username: name });
    }
  });

  // Mettre à jour la liste globale
  io.emit("usersList", { users: Array.from(users.values()) });

  res.json({ success: true });
});

// Calcul distance 3D (BeamMP)
function getDistance3D(pos1, pos2) {
  const dx = pos1.x - pos2.x;
  const dy = pos1.y - pos2.y;
  const dz = pos1.z - pos2.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

io.on("connection", (socket) => {
  console.log("✅ Nouvel utilisateur connecté :", socket.id);

  socket.on("register", ({ username, position }) => {
    users.set(socket.id, {
      id: socket.id,
      username,
      position: position || { x: 0, y: 0, z: 0 }
    });
    console.log(`📝 ${username} enregistré`);
    socket.emit("registered", { userId: socket.id });
    socket.broadcast.emit("userJoined", { userId: socket.id, username });
    io.emit("usersList", { users: Array.from(users.values()) });
  });

  socket.on("updatePosition", (position) => {
    const user = users.get(socket.id);
    if (user) {
      user.position = position;
      socket.broadcast.emit("userPositionUpdate", {
        userId: socket.id,
        username: user.username,
        x: position.x,
        y: position.y,
        z: position.z
      });
    }
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
