const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, "public")));

let players = {};

io.on("connection", (socket) => {
  console.log("🔌 Connecté (ID) : " + socket.id);

  socket.on("join", (data) => {
    players[socket.id] = { name: data.name, id: socket.id };
    console.log("🎤 Joueur connecté : " + data.name);
    
    // Envoyer la liste à TOUT le monde
    io.emit("playersUpdate", Object.values(players));
    
    // Prévenir les autres qu'un nouveau joueur est arrivé
    socket.broadcast.emit("newPlayer", { id: socket.id });
  });

  // Relais WebRTC : offer
  socket.on("signal", ({ to, data }) => {
    socket.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("disconnect", () => {
    if (players[socket.id]) {
      console.log("❌ Déconnecté : " + players[socket.id].name);
      delete players[socket.id];
      io.emit("playersUpdate", Object.values(players));
      io.emit("playerLeft", { id: socket.id });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("✅ Serveur lancé sur le port " + PORT);
});
