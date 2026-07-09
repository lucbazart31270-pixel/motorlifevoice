const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, "public")));

let players = {};

io.on("connection", (socket) => {
  console.log("🔌 Connecté (ID) : " + socket.id);

  socket.on("join", (data) => {
    players[socket.id] = { name: data.name, id: socket.id };
    console.log("🎤 Joueur connecté : " + data.name);
    io.emit("playersUpdate", Object.values(players));
  });

  socket.on("voiceReady", () => {
    // Prévenir les autres joueurs déjà connectés qu'un nouveau est prêt en vocal
    for (const id in players) {
      if (id !== socket.id) {
        socket.to(id).emit("newPeer", { id: socket.id });
      }
    }
  });

  socket.on("offer", ({ to, offer }) => {
    socket.to(to).emit("offer", { from: socket.id, offer });
  });

  socket.on("answer", ({ to, answer }) => {
    socket.to(to).emit("answer", { from: socket.id, answer });
  });

  socket.on("iceCandidate", ({ to, candidate }) => {
    socket.to(to).emit("iceCandidate", { from: socket.id, candidate });
  });

  socket.on("disconnect", () => {
    if (players[socket.id]) {
      console.log("❌ Déconnecté : " + players[socket.id].name);
      delete players[socket.id];
      io.emit("playersUpdate", Object.values(players));
      io.emit("removePeer", { id: socket.id });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("✅ Serveur lancé sur le port " + PORT);
});
