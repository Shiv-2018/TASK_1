const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Check if your Vite port matches this!
    methods: ["GET", "POST"],
  },
  maxHttpBufferSize: 1e8, // 100MB buffer for large file transfers
});

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // Standard message relay
  socket.on("send_message", (data) => {
    io.emit("receive_message", data);
  });

  // Packet relay for audio/large data
  socket.on("audio_packet", (data) => {
    io.emit("audio_packet", data);
  });

  socket.on("disconnect", () => {
    console.log("User Disconnected", socket.id);
  });
});

server.listen(3001, () => {
  console.log("SERVER RUNNING ON PORT 3001");
});