import React, { useEffect, useState, useRef } from "react";
import io from "socket.io-client";

const socket = io.connect("http://localhost:3001");
const CHUNK_SIZE = 16384; // 16KB packets

function App() {
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [isRecording, setIsRecording] = useState(false);

  const scrollRef = useRef();
  const mediaRecorder = useRef(null);
  const incomingChunks = useRef({}); 

  // --- PERSISTENCE & SOCKETS ---

  useEffect(() => {
    if (isLoggedIn) {
      const savedChat = localStorage.getItem(`chat_history_${username}`);
      if (savedChat) setChat(JSON.parse(savedChat));
    }
  }, [isLoggedIn, username]);

  useEffect(() => {
    if (isLoggedIn && chat.length > 0) {
      localStorage.setItem(`chat_history_${username}`, JSON.stringify(chat));
    }
  }, [chat, isLoggedIn, username]);

  useEffect(() => {
    // Handling incoming packets
    socket.on("audio_packet", (data) => {
      const { msgId, chunk, isLast, metadata } = data;

      if (!incomingChunks.current[msgId]) {
        incomingChunks.current[msgId] = [];
      }

      incomingChunks.current[msgId].push(chunk);

      if (isLast) {
        console.log("All packets received. Reassembling...");
        const fullBlob = new Blob(incomingChunks.current[msgId], {
          type: "audio/webm",
        });
        
        const reader = new FileReader();
        reader.onload = () => {
          setChat((prev) => [
            ...prev,
            {
              ...metadata,
              text: reader.result, // We keep Base64 here for LocalStorage persistence
              type: "audio",
            },
          ]);
          delete incomingChunks.current[msgId];
        };
        reader.readAsDataURL(fullBlob);
      }
    });

    socket.on("receive_message", (data) => {
      setChat((prev) => [...prev, data]);
    });

    return () => {
      socket.off("audio_packet");
      socket.off("receive_message");
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // --- IMAGE COMPRESSION LOGIC ---

  const sendImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const originalSize = file.size;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        let scale = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scale;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.6);

        socket.emit("send_message", {
          author: username,
          text: compressedBase64,
          type: "image",
          originalSize,
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        });
      };
    };
    reader.readAsDataURL(file);
  };

  // --- AUDIO PACKET LOGIC ---

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      
      mediaRecorder.current = new MediaRecorder(stream, { 
        mimeType,
        audioBitsPerSecond: 32000 
      });
      
      const chunks = [];
      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: mimeType });
        const originalSize = audioBlob.size;
        const msgId = "audio_" + Date.now();

        const metadata = {
          author: username,
          originalSize,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        // SEQUENTIAL SENDING to maintain chunk order
        for (let i = 0; i < audioBlob.size; i += CHUNK_SIZE) {
          const chunkSlice = audioBlob.slice(i, i + CHUNK_SIZE);
          const isLast = (i + CHUNK_SIZE) >= audioBlob.size;
          
          // Using await to ensure this packet is sent before the next one starts reading
          const buffer = await chunkSlice.arrayBuffer();
          
          socket.emit("audio_packet", { 
            msgId, 
            chunk: buffer, 
            isLast, 
            metadata 
          });
          
          if (isLast) console.log("Final packet sent.");
        }
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Mic Error:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  // --- HELPERS ---

  const calculateQuality = (base64, originalSize) => {
    if (!base64 || !originalSize) return "100%";
    const base64Data = base64.split(",")[1];
    const receivedBytes = (base64Data.length * 3) / 4 - (base64Data.endsWith("==") ? 2 : 1);
    return ((receivedBytes / originalSize) * 100).toFixed(1) + "%";
  };

  const handleLogin = () => {
    if (username && pin.length === 4) setIsLoggedIn(true);
  };

  if (!isLoggedIn) {
    return (
      <div style={styles.loginOverlay}>
        <div style={styles.loginBox}>
          <h2 style={{ color: "#e9edef", marginBottom: "20px" }}>Secure Login</h2>
          <input style={styles.inputField} placeholder="Username" onChange={(e) => setUsername(e.target.value)} />
          <input style={styles.inputField} type="password" placeholder="4-Digit PIN" maxLength={4} onChange={(e) => setPin(e.target.value)} />
          <button style={styles.loginBtn} onClick={handleLogin}>JOIN</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appContainer}>
      <header style={styles.header}>
        <div style={styles.avatar}>{username[0]?.toUpperCase()}</div>
        <div style={{ flex: 1, color: "#e9edef" }}>
          <div style={{ fontWeight: "bold" }}>{username}</div>
          <div style={{ fontSize: "11px", color: "#00a884" }}>Packet Stream Active</div>
        </div>
      </header>

      <main style={styles.chatMain}>
        {chat.map((msg, index) => {
          const isMe = msg.author === username;
          return (
            <div key={index} style={{ ...styles.messageRow, justifyContent: isMe ? "flex-end" : "flex-start" }}>
              <div style={{ ...styles.bubble, backgroundColor: isMe ? "#005c4b" : "#202c33" }}>
                {!isMe && <div style={styles.authorName}>{msg.author}</div>}

                {msg.type === "text" && <div style={styles.messageText}>{msg.text}</div>}

                {msg.type === "image" && (
                  <div style={{ textAlign: "center" }}>
                    <img src={msg.text} alt="shared" style={styles.sentMedia} />
                    <div style={styles.statLabel}>Quality: {calculateQuality(msg.text, msg.originalSize)}</div>
                  </div>
                )}

                {msg.type === "audio" && (
                  <div>
                    <audio controls src={msg.text} style={styles.audioPlayer} />
                    <div style={styles.statLabel}>Compression: {calculateQuality(msg.text, msg.originalSize)}</div>
                  </div>
                )}

                <div style={styles.timestamp}>{msg.time}</div>
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </main>

      <footer style={styles.footer}>
        <label style={styles.iconBtn}>
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={sendImage} />
          🖼️
        </label>
        <button style={{ ...styles.iconBtn, color: isRecording ? "#ff3b30" : "#8696a0" }} onClick={isRecording ? stopRecording : startRecording}>
          {isRecording ? "⏹" : "🎤"}
        </button>
        <input
          style={styles.chatInput}
          value={message}
          placeholder="Message"
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && socket.emit("send_message", { author: username, text: message, type: "text", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}
        />
      </footer>
    </div>
  );
}

const styles = {
  appContainer: { display: "flex", flexDirection: "column", height: "100vh", width: "100%", maxWidth: "500px", margin: "0 auto", backgroundColor: "#0b141a", fontFamily: "sans-serif" },
  header: { display: "flex", alignItems: "center", padding: "10px 15px", backgroundColor: "#202c33" },
  avatar: { width: "38px", height: "38px", borderRadius: "50%", backgroundColor: "#6a7175", marginRight: "12px", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: "bold" },
  chatMain: { flex: 1, overflowY: "auto", padding: "15px", backgroundImage: `url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')`, backgroundSize: "contain", display: "flex", flexDirection: "column", gap: "8px" },
  messageRow: { display: "flex", width: "100%" },
  bubble: { maxWidth: "85%", padding: "8px", color: "#e9edef", borderRadius: "8px" },
  authorName: { fontSize: "11px", fontWeight: "bold", color: "#e1b12c", marginBottom: "4px" },
  messageText: { fontSize: "14px" },
  sentMedia: { maxWidth: "100%", borderRadius: "6px" },
  audioPlayer: { width: "220px", height: "30px", marginTop: "5px" },
  statLabel: { fontSize: "10px", color: "#00ffa3", marginTop: "5px", borderTop: "1px solid #37414b", paddingTop: "3px" },
  timestamp: { fontSize: "9px", color: "#8696a0", textAlign: "right", marginTop: "4px" },
  footer: { display: "flex", padding: "10px", backgroundColor: "#202c33", gap: "10px", alignItems: "center" },
  chatInput: { flex: 1, backgroundColor: "#2a3942", border: "none", borderRadius: "20px", padding: "10px 15px", color: "white", outline: "none" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: "20px" },
  loginOverlay: { height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#111b21" },
  loginBox: { backgroundColor: "#202c33", padding: "30px", borderRadius: "12px", width: "280px", textAlign: "center" },
  inputField: { width: "100%", padding: "10px", marginBottom: "15px", borderRadius: "6px", border: "none", backgroundColor: "#2a3942", color: "white", boxSizing: "border-box" },
  loginBtn: { width: "100%", padding: "10px", backgroundColor: "#00a884", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "bold" },
};

export default App;