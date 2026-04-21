import React, { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

const socket = io.connect("http://localhost:3001");

function App() {
  const [pin, setPin] = useState("");
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const scrollRef = useRef();

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
    socket.on("receive_message", (data) => {
      setChat((prev) => [...prev, data]);
    });
    return () => socket.off("receive_message");
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const handleLogin = () => {
    if (username.trim() && pin.length >= 4) setIsLoggedIn(true);
  };

  const sendMessage = () => {
    if (message.trim() !== "") {
      const messageData = {
        author: username,
        text: message,
        type: "text",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
      };
      socket.emit("send_message", messageData);
      setMessage("");
    }
  };

  // 1. Send the image with the hidden "originalSize"
  const sendImage = (e) => {
    const file = e.target.files[0];
    if (file) {
      const originalSizeBytes = file.size; // Hidden actual size
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = {
          author: username,
          text: event.target.result, // Base64 String
          type: "image",
          originalSize: originalSizeBytes, // Sent hidden in payload
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
        };
        socket.emit("send_message", imageData);
      };
      reader.readAsDataURL(file);
    }
  };

  // 2. Helper to calculate received Base64 byte size & compression %
  const getCompressionDetails = (base64String, originalSize) => {
    if (!base64String || !originalSize) return null;

    // Isolate the base64 data from the prefix (data:image/png;base64,...)
    const base64Data = base64String.split(',')[1];
    if (!base64Data) return null;

    // Calculate exact bytes from Base64 string length
    const padding = (base64Data.match(/(=+)$/) || [,''])[1].length;
    const receivedBytes = (base64Data.length * 3 / 4) - padding;

    const receivedKB = (receivedBytes / 1024).toFixed(2);
    const originalKB = (originalSize / 1024).toFixed(2);
    
    // Calculate percentage
    let percent = ((receivedBytes / originalSize) * 100).toFixed(1);
    
    // Account for minor JS floating point variations
    if (percent > 99.5) percent = 100;

    return { receivedKB, originalKB, percent };
  };

  if (!isLoggedIn) {
    return (
      <div style={styles.loginOverlay}>
        <div style={styles.loginBox}>
          <h2 style={{ marginBottom: '20px', color: '#e9edef' }}>WhatsApp Clone</h2>
          <input style={styles.inputField} placeholder="Username" onChange={(e) => setUsername(e.target.value)} />
          <input style={styles.inputField} type="password" placeholder="4-Digit PIN" maxLength={4} onChange={(e) => setPin(e.target.value)} />
          <button style={styles.loginBtn} onClick={handleLogin}>JOIN CHAT</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appContainer}>
      <style>{`
        body { margin: 0; background-color: #0b141a; font-family: 'Segoe UI', sans-serif; }
        .chat-area::-webkit-scrollbar { width: 5px; }
        .chat-area::-webkit-scrollbar-thumb { background-color: #37414b; border-radius: 10px; }
      `}</style>

      <header style={styles.header}>
        <div style={styles.avatar}>{username[0]?.toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '600', color: '#e9edef' }}>{username}</div>
          <div style={{ fontSize: '12px', color: '#8696a0' }}>Online</div>
        </div>
      </header>

      <main className="chat-area" style={styles.chatMain}>
        {chat.map((msg, index) => {
          const isMe = msg.author === username;
          
          // 3. Dynamically process image details on the receiving side
          let imageDetails = null;
          if (msg.type === "image" && msg.originalSize) {
            imageDetails = getCompressionDetails(msg.text, msg.originalSize);
          }

          return (
            <div key={index} style={{ ...styles.messageRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{ 
                ...styles.bubble, 
                backgroundColor: isMe ? '#005c4b' : '#202c33', 
                borderTopRightRadius: isMe ? '0' : '8px', 
                borderTopLeftRadius: isMe ? '8px' : '0' 
              }}>
                {!isMe && <div style={styles.authorName}>{msg.author}</div>}
                
                {msg.type === "text" ? (
                  <div style={styles.messageText}>{msg.text}</div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <img src={msg.text} alt="Shared" style={styles.sentImage} />
                    
                    {/* Render dynamically calculated details */}
                    {imageDetails && (
                      <div style={styles.qualityBadge}>
                        Size: {imageDetails.receivedKB}KB / {imageDetails.originalKB}KB 
                        <br/>
                        Quality Retained: {imageDetails.percent}%
                      </div>
                    )}
                  </div>
                )}
                
                <div style={styles.timestamp}>
                  {msg.time} {isMe && <span style={{ color: '#53bdeb', marginLeft: '3px' }}>✓✓</span>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={scrollRef} />
      </main>

      <footer style={styles.footer}>
        <label style={styles.iconBtn}>
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={sendImage} />
          <span>📎</span>
        </label>
        <input 
          style={styles.chatInput} 
          value={message} 
          placeholder="Type a message" 
          onChange={(e) => setMessage(e.target.value)} 
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button style={styles.iconBtn} onClick={sendMessage}>➤</button>
      </footer>
    </div>
  );
}

const styles = {
  appContainer: { display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', maxWidth: '600px', margin: '0 auto', backgroundColor: '#0b141a', border: '1px solid #222d34' },
  header: { display: 'flex', alignItems: 'center', padding: '10px 16px', backgroundColor: '#202c33', zIndex: 10 },
  avatar: { width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#6a7175', marginRight: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' },
  chatMain: { flex: 1, overflowY: 'auto', padding: '15px', backgroundImage: `url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')`, backgroundSize: 'contain', display: 'flex', flexDirection: 'column', gap: '8px' },
  messageRow: { display: 'flex', width: '100%' },
  bubble: { maxWidth: '85%', padding: '6px 10px', borderRadius: '8px', boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)', position: 'relative', color: '#e9edef' },
  authorName: { fontSize: '12px', fontWeight: 'bold', color: '#e1b12c', marginBottom: '2px' },
  messageText: { fontSize: '14.5px', lineHeight: '19px', paddingRight: '40px', wordBreak: 'break-word' },
  timestamp: { fontSize: '10px', color: '#8696a0', textAlign: 'right', marginTop: '4px' },
  sentImage: { maxWidth: '100%', borderRadius: '6px', marginTop: '5px', display: 'block' },
  qualityBadge: { fontSize: '10px', backgroundColor: 'rgba(11, 20, 26, 0.85)', color: '#00ffa3', padding: '4px 6px', borderRadius: '4px', marginTop: '6px', display: 'inline-block', border: '1px solid #005c4b', lineHeight: '1.4' },
  footer: { display: 'flex', alignItems: 'center', padding: '10px', backgroundColor: '#202c33', gap: '10px' },
  chatInput: { flex: 1, backgroundColor: '#2a3942', border: 'none', borderRadius: '20px', padding: '10px 15px', color: 'white', outline: 'none', fontSize: '15px' },
  iconBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: '#8696a0' },
  loginOverlay: { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111b21' },
  loginBox: { backgroundColor: '#202c33', padding: '40px', borderRadius: '10px', width: '300px', textAlign: 'center' },
  inputField: { width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '8px', border: 'none', backgroundColor: '#2a3942', color: 'white' },
  loginBtn: { width: '100%', padding: '12px', backgroundColor: '#00a884', color: '#111b21', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }
};

export default App;