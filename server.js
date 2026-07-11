const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, "public")));

const users = new Map();

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

io.on("connection", (socket) => {
  console.log("✅ Nouvel utilisateur connecté :", socket.id);

  socket.on("register", ({ username, position }) => {
    users.set(socket.id, {
      id: socket.id,
      username,
      position: position || { lat: 0, lng: 0 }
    });
    console.log(`📝 ${username} enregistré avec position [${position?.lat}, ${position?.lng}]`);
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
        lat: position.lat,
        lng: position.lng
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
