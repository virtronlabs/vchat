// chat.js

const socket = io();

let username; // Set this after login
let socketId;

// Set username and notify server
function setUsername(name) {
  username = name;
  socket.emit("userOnline", username);
}

// Send private message
function sendPrivateMessage(to, message) {
  socket.emit("privateMessage", { to, message });
}

// Receive private message
socket.on("privateMessage", (data) => {
  console.log(`Message from ${data.from}: ${data.message}`);
  // Display the message in the UI
});

// Update online users list
socket.on("updateOnlineUsers", (users) => {
  console.log("Online users:", users);
  // Update the UI with the list of online users
});

// Handle socket ID
socket.on("socketId", (id) => {
  socketId = id;
  console.log("Your socket ID:", socketId);
});