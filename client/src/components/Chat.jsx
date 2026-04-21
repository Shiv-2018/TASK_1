import { useEffect, useRef, useState } from "react";

export default function Chat({ socket, username, room }) {
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  const sendMessage = (dataOverride = null) => {
    const msgData = dataOverride || {
      room,
      author: username,
      type: "text",
      message: message,
      time: new Date().toLocaleTimeString(),
    };
    socket.emit("send_message", msgData);
    setMessageList((list) => [...list, msgData]);
    setMessage("");
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 1. Capture Original Specifications
    const originalSize = file.size;
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      const reader = new FileReader();
      reader.onload = () => {
        const imageData = {
          room,
          author: username,
          type: "image",
          message: reader.result, // Base64 Data
          specs: {
            size: originalSize,
            width: img.width,
            height: img.height,
            name: file.name
          },
          time: new Date().toLocaleTimeString(),
        };
        sendMessage(imageData);
        URL.revokeObjectURL(objectUrl);
      };
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  };

  // Algorithm to calculate loss
  const calculateLoss = (originalSpecs, receivedMessage) => {
    // Calculate size of base64 received
    const stringLength = receivedMessage.length - "data:image/png;base64,".length;
    const receivedSizeInBytes = Math.floor(stringLength * (3 / 4));
    
    const sizeDiff = originalSpecs.size - receivedSizeInBytes;
    const lossPercentage = ((sizeDiff / originalSpecs.size) * 100).toFixed(4);

    return {
      receivedSize: receivedSizeInBytes,
      loss: lossPercentage <= 0 ? "0% (Lossless)" : `${lossPercentage}%`
    };
  };

  useEffect(() => {
    socket.on("receive_message", (data) => {
      setMessageList((list) => [...list, data]);
    });
    return () => socket.off("receive_message");
  }, [socket]);

  return (
    <div className="flex flex-col h-screen bg-[#efeae2]">
      {/* HEADER */}
      <header className="bg-[#075e54] text-white p-4 shadow-lg flex justify-between">
        <span className="font-bold">Room: {room}</span>
        <span className="text-xs">User: {username}</span>
      </header>

      {/* CHAT AREA */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messageList.map((msg, i) => {
          const isOwn = msg.author === username;
          let stats = null;
          if (msg.type === "image") {
            stats = calculateLoss(msg.specs, msg.message);
          }

          return (
            <div key={i} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
              <div className={`p-2 rounded-lg max-w-sm shadow ${isOwn ? "bg-[#dcf8c6]" : "bg-white"}`}>
                <p className="text-[10px] font-bold text-blue-600 mb-1">{msg.author}</p>
                
                {msg.type === "image" ? (
                  <div className="space-y-2">
                    <img src={msg.message} className="rounded border" alt="sent" />
                    
                    {/* SPECIFICATION OUTPUT */}
                    <div className="bg-black/5 p-2 rounded text-[10px] font-mono text-gray-700">
                      <p className="border-b border-gray-300 pb-1 mb-1 font-bold">DATA INTEGRITY LOG</p>
                      <p>Sent Size: {msg.specs.size.toLocaleString()} bytes</p>
                      <p>Recv Size: {stats.receivedSize.toLocaleString()} bytes</p>
                      <p>Dimensions: {msg.specs.width}x{msg.specs.height}</p>
                      <p className="text-emerald-700 font-bold">Integrity Loss: {stats.loss}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm">{msg.message}</p>
                )}
                <p className="text-[9px] text-right mt-1 opacity-50">{msg.time}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </main>

      {/* FOOTER */}
      <footer className="p-3 bg-gray-100 flex gap-2">
        <input type="file" className="hidden" ref={fileInputRef} onChange={handleImageChange} accept="image/*" />
        <button onClick={() => fileInputRef.current.click()} className="bg-gray-300 p-2 rounded-full">📎</button>
        <input 
          className="flex-1 rounded-full px-4 border" 
          value={message} 
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button onClick={() => sendMessage()} className="bg-[#00a884] text-white px-4 py-2 rounded-full">Send</button>
      </footer>
    </div>
  );
}