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
    players[socket.id] = { name: data.name };
    console.log("🎤 Joueur connecté : " + data.name);

    // Envoie la liste mise à jour à TOUT LE MONDE
    io.emit("playersUpdate", Object.values(players));
  });

  socket.on("disconnect", () => {
    if (players[socket.id]) {
      console.log("❌ Déconnecté : " + players[socket.id].name);
      delete players[socket.id];
      io.emit("playersUpdate", Object.values(players));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("✅ Serveur lancé sur le port " + PORT);
});
