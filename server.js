const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, "public")));

// Stockage des utilisateurs
const users = new Map();

io.on("connection", (socket) => {
  console.log(`✅ Nouvelle connexion : ${socket.id}`);

  socket.on("register", ({ username }) => {
    users.set(socket.id, { id: socket.id, username });
    console.log(`📝 ${username} enregistré (${socket.id})`);
    
    socket.emit("registered", { userId: socket.id });
    
    // Notifier les autres
    socket.broadcast.emit("userJoined", {
      userId: socket.id,
      username
    });
    
    // Envoyer la liste complète à tout le monde
    io.emit("usersList", { users: Array.from(users.values()) });
  });

  socket.on("getUsersList", () => {
    socket.emit("usersList", { users: Array.from(users.values()) });
  });

  socket.on("signal", ({ to, data }) => {
    console.log(`📡 Signal de ${socket.id} vers ${to} (type: ${data.type})`);
    io.to(to).emit("signal", { from: socket.id, data });
  });

  socket.on("disconnect", () => {
    const user = users.get(socket.id);
    if (user) {
      console.log(`🔴 ${user.username} déconnecté`);
      users.delete(socket.id);
      
      socket.broadcast.emit("userLeft", {
        userId: socket.id,
        username: user.username
      });
      
      io.emit("usersList", { users: Array.from(users.values()) });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Serveur lancé sur http://localhost:${PORT}`);
});
