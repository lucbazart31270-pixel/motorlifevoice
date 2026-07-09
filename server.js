const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const VOICE_RANGE = 50;
const players = {};       // { socketId: { x, y, z, name } }
const beamPlayers = {};   // { playerID: { x, y, z, name, token, socketId } }

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json()); // ⚠️ nécessaire pour lire le JSON envoyé par BeamMP

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

      io.to(idA).emit("proximity", { id: idB, inRange, dist });
      io.to(idB).emit("proximity", { id: idA, inRange, dist });
    }
  }
}

// ─────────────────────────────
// ROUTE : réception des positions envoyées par le serveur BeamMP (main.lua)
// ─────────────────────────────
app.post("/api/update-position", (req, res) => {
  const data = req.body;

  if (!data || data.playerID === undefined) {
    return res.status(400).json({ error: "Données invalides" });
  }

  // Joueur déconnecté du serveur BeamMP
  if (data.disconnect) {
    const old = beamPlayers[data.playerID];
    if (old && old.socketId && players[old.socketId]) {
      delete players[old.socketId];
      updateProximity();
    }
    delete beamPlayers[data.playerID];
    console.log("Joueur BeamMP déconnecté :", data.playerID);
    return res.json({ ok: true });
  }

  // Stocke/actualise les infos du joueur BeamMP
  beamPlayers[data.playerID] = {
    ...beamPlayers[data.playerID],
    x: data.x,
    y: data.y,
    z: data.z,
    name: data.name,
    token: data.token,
    playerID: data.playerID,
  };

  // Si ce joueur a déjà une connexion web (socket) liée à son token, on met à jour sa position
  const linked = beamPlayers[data.playerID];
  if (linked.socketId && players[linked.socketId]) {
    players[linked.socketId].x = data.x;
    players[linked.socketId].y = data.y;
    players[linked.socketId].z = data.z;
    players[linked.socketId].name = data.name;
    updateProximity();
  }

  res.json({ ok: true });
});

// ─────────────────────────────
// ROUTE : page vocale (le lien /voice envoyé aux joueurs)
// ─────────────────────────────
app.get("/voice", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "voice.html"));
});

// ─────────────────────────────
// SOCKET.IO — connexion des clients web (navigateur du joueur)
// ─────────────────────────────
io.on("connection", (socket) => {
  console.log("Connecté : " + socket.id);

  // Le client web envoie son token pour se relier à son joueur BeamMP
  socket.on("register", (data) => {
    const { token, playerID } = data;
    console.log("Enregistrement socket pour playerID:", playerID, "token:", token);

    // Vérifie que le token correspond bien à ce playerID
    const beamPlayer = beamPlayers[playerID];
    if (!beamPlayer || beamPlayer.token !== token) {
      socket.emit("register_error", { message: "Token invalide" });
      return;
    }

    beamPlayer.socketId = socket.id;
    players[socket.id] = {
      x: beamPlayer.x || 0,
      y: beamPlayer.y || 0,
      z: beamPlayer.z || 0,
      name: beamPlayer.name || "Joueur",
    };

    socket.emit("registered", { ok: true });
    updateProximity();
  });

  // Position envoyée directement par un client web (fallback si pas via BeamMP)
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

    // Nettoyage du lien dans beamPlayers
    for (const pid in beamPlayers) {
      if (beamPlayers[pid].socketId === socket.id) {
        beamPlayers[pid].socketId = null;
      }
    }

    updateProximity();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
