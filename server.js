const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Sert les fichiers du dossier "public"
app.use(express.static(path.join(__dirname, 'public')));

// Gestion des connexions WebSocket
wss.on('connection', (ws) => {
  console.log('Nouvelle connexion');

  ws.on('message', (message) => {
    // Renvoie le message à tous les autres clients connectés
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  ws.on('close', () => {
    console.log('Connexion fermée');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
