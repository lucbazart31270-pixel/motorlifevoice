const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const VOICE_RANGE = 50;
const players = {}; // { socketId: { x, y, z, name } }

app.use(express.static(path.join(__dirname, "public")));

function getDistance(a, b) {
  return Math.sqrt(
    Math.pow(a.x - b.x, 2) +
    Math.pow(a.y - b.y, 2) +
    Math.pow(a.z - b.z, 2)
  );
}

function updateProximity() {
  const ids = Object.keys(players);

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const idA = ids[i];
      const idB = ids[j];
      const a = players[idA];
      const b = players[idB];

      const dist = getDistance(a, b);
      const inRange = dist <= VOICE_RANGE;

      // On informe les deux clients de leur état de proximité
      io.to(idA).emit("proximity", { id: idB, inRange, dist });
      io.to(idB).emit("proximity", { id: idA, inRange, dist });
    }
  }
}

io.on("connection", (socket) => {
  console.log("Connecté : " + socket.id);

  // Le mod BeamMP (ou le client web) envoie sa position
  socket.on("position", (data) => {
    players[socket.id] = {
      x: data.x,
      y: data.y,
      z: data.z,
      name: data.name || "Joueur"
    };
    updateProximity();
  });

  // Relais audio uniquement vers les joueurs à proximité
  socket.on("voice", (audioData) => {
    const me = players[socket.id];
    if (!me) return;

    for (const otherId in players) {
      if (otherId === socket.id) continue;
      const other = players[otherId];
      const dist = getDistance(me, other);
      if (dist <= VOICE_RANGE) {
        io.to(otherId).emit("voice", { from: socket.id, audio: audioData });
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("Déconnecté : " + socket.id);
    delete players[socket.id];
    updateProximity();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
