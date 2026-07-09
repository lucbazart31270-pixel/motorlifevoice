<script src="/socket.io/socket.io.js"></script>
<script>
  const socket = io();
  let myName = "";
  let localStream = null;
  let isMuted = false;
  const peers = {};

  const rtcConfig = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  };

  function joinChat() {
    const input = document.getElementById("nameInput");
    const name = input.value.trim();

    if (name === "") {
      alert("Merci d'entrer un nom !");
      return;
    }

    myName = name;
    socket.emit("join", { name: name });

    document.getElementById("joinScreen").style.display = "none";
    document.getElementById("chatScreen").style.display = "block";
    document.getElementById("myName").innerText = "Tu es connecté en tant que : " + name;

    startVoiceChat();
  }

  document.getElementById("joinBtn").addEventListener("click", joinChat);
  document.getElementById("nameInput").addEventListener("keypress", function(e) {
    if (e.key === "Enter") joinChat();
  });

  document.getElementById("muteBtn").addEventListener("click", function() {
    isMuted = !isMuted;
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
    const btn = document.getElementById("muteBtn");
    if (isMuted) {
      btn.innerText = "🔇 Micro coupé (clique pour activer)";
      btn.classList.add("muted");
    } else {
      btn.innerText = "🔊 Micro actif (clique pour couper)";
      btn.classList.remove("muted");
    }
  });

  socket.on("playersUpdate", (players) => {
    const list = document.getElementById("playersList");
    list.innerHTML = "";
    players.forEach((p) => {
      const li = document.createElement("li");
      li.innerText = "🎮 " + p.name + (p.id === socket.id ? " (toi)" : "");
      list.appendChild(li);
    });
  });

  // === MICRO ===
  async function startVoiceChat() {
    const statusEl = document.getElementById("status");
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      statusEl.innerText = "Micro activé ✅";
      socket.emit("voiceReady");
    } catch (err) {
      statusEl.innerText = "Erreur d'accès au micro ❌ : " + err.message;
      console.error(err);
    }
  }

  // === WEBRTC ===

  function createPeerConnection(remoteId) {
    const pc = new RTCPeerConnection(rtcConfig);

    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("iceCandidate", { to: remoteId, candidate: event.candidate });
      }
    };

    pc.ontrack = (event) => {
      let audioEl = document.getElementById("audio-" + remoteId);
      if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = "audio-" + remoteId;
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
      }
      audioEl.srcObject = event.streams[0];
    };

    peers[remoteId] = pc;
    return pc;
  }

  socket.on("newPeer", async ({ id }) => {
    if (id === socket.id) return;
    const pc = createPeerConnection(id);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit("offer", { to: id, offer });
  });

  socket.on("offer", async ({ from, offer }) => {
    let pc = peers[from];
    if (!pc) pc = createPeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", { to: from, answer });
  });

  socket.on("answer", async ({ from, answer }) => {
    const pc = peers[from];
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  });

  socket.on("iceCandidate", async ({ from, candidate }) => {
    const pc = peers[from];
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("Erreur ICE candidate:", e);
      }
    }
  });

  socket.on("removePeer", ({ id }) => {
    if (peers[id]) {
      peers[id].close();
      delete peers[id];
    }
    const audioEl = document.getElementById("audio-" + id);
    if (audioEl) audioEl.remove();
  });
</script>
