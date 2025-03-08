const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const cookieParser = require("cookie-parser");
const authenticateToken = require("./middlewares/auth");
const { Server } = require("socket.io");
require("dotenv").config();
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const Message = require("./models/Message"); // Assuming you have a Message model

const SECRET_KEY = process.env.JWT_SECRET;

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 3000;

// Import Routes
const viewRoutes = require("./routes/viewRoutes");
const apiRoutes = require("./routes/apiRoutes");

// Connect to MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/vchat");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => console.log("Connected to MongoDB"));

// Use Routes
app.use("/", viewRoutes);
app.use("/api", apiRoutes);

// === SOCKET.IO LOGIC - ENHANCED FOR REAL-TIME CHAT ===
const usersOnline = new Map(); // username -> socketId
const socketToUser = new Map(); // socketId -> username

// Socket.io middleware to authenticate users
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error("Authentication error: No token provided"));
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    socket.user = decoded;
    next();
  } catch (err) {
    return next(new Error("Authentication error: Invalid token"));
  }
});

io.on("connection", async (socket) => {
  console.log(`New socket connection: ${socket.id} for user ${socket.user.username}`);
  
  // Add user to online users map
  usersOnline.set(socket.user.username, socket.id);
  socketToUser.set(socket.id, socket.user.username);
  
  // Broadcast user online status to all clients
  io.emit("updateOnlineUsers", Array.from(usersOnline.keys()));
  
  // Join user-specific room for private messages
  socket.join(socket.user.username);
  
  // Handle new message
  socket.on("sendMessage", async (data) => {
    try {
      const { recipient, content } = data;
      
      if (!recipient || !content) {
        return socket.emit("error", "Recipient and message content are required");
      }
      
      // Fetch user IDs
      const sender = await User.findOne({ username: socket.user.username });
      const recipientUser = await User.findOne({ username: recipient });
      
      if (!recipientUser) {
        return socket.emit("error", "Recipient not found");
      }
      
      // Create and save message to database
      const newMessage = new Message({
        sender: sender._id,
        recipient: recipientUser._id,
        content: content,
        read: false,
        createdAt: new Date()
      });
      
      await newMessage.save();
      
      // Format message for sending
      const formattedMessage = {
        _id: newMessage._id,
        content: content,
        sender: sender._id,
        recipient: recipientUser._id,
        isSender: true,
        senderName: sender.username,
        createdAt: newMessage.createdAt,
        read: false
      };
      
      // Send to sender's client
      socket.emit("newMessage", formattedMessage);
      
      // Check if recipient is online
      if (usersOnline.has(recipient)) {
        // Format message for recipient
        const recipientMessage = {
          ...formattedMessage,
          isSender: false,
          senderName: sender.username
        };
        
        // Send to recipient's client
        io.to(recipient).emit("newMessage", recipientMessage);
        
        // Also emit a message notification
        io.to(recipient).emit("messageNotification", {
          from: sender.username,
          message: content.substring(0, 50) + (content.length > 50 ? "..." : "")
        });
      }
      
      // Update or create conversation
      const existingConversation = await Conversation.findOne({
        $or: [
          { participants: [sender._id, recipientUser._id] },
          { participants: [recipientUser._id, sender._id] }
        ]
      });
      
      if (existingConversation) {
        existingConversation.lastMessage = content;
        existingConversation.lastMessageTime = new Date();
        existingConversation.lastMessageSender = sender._id;
        await existingConversation.save();
      } else {
        const newConversation = new Conversation({
          participants: [sender._id, recipientUser._id],
          lastMessage: content,
          lastMessageTime: new Date(),
          lastMessageSender: sender._id
        });
        await newConversation.save();
      }
      
      // Broadcast updated conversation list to both users
      socket.emit("updateConversations");
      if (usersOnline.has(recipient)) {
        io.to(recipient).emit("updateConversations");
      }
      
    } catch (error) {
      console.error("Error sending message:", error);
      socket.emit("error", "Failed to send message");
    }
  });
  
  // Mark messages as read
  socket.on("markMessagesAsRead", async (data) => {
    try {
      const { sender } = data;
      
      const currentUser = await User.findOne({ username: socket.user.username });
      const senderUser = await User.findOne({ username: sender });
      
      if (!senderUser) {
        return socket.emit("error", "Sender not found");
      }
      
      // Update messages to read status
      await Message.updateMany(
        { 
          sender: senderUser._id,
          recipient: currentUser._id,
          read: false
        },
        { $set: { read: true } }
      );
      
      // Notify sender that messages were read
      if (usersOnline.has(sender)) {
        io.to(sender).emit("messagesRead", { by: socket.user.username });
      }
      
    } catch (error) {
      console.error("Error marking messages as read:", error);
      socket.emit("error", "Failed to mark messages as read");
    }
  });
  
  // Handle typing indicators
  socket.on("typingStarted", (data) => {
    const { recipient } = data;
    if (usersOnline.has(recipient)) {
      io.to(recipient).emit("userTyping", { user: socket.user.username });
    }
  });
  
  socket.on("typingStopped", (data) => {
    const { recipient } = data;
    if (usersOnline.has(recipient)) {
      io.to(recipient).emit("userStoppedTyping", { user: socket.user.username });
    }
  });
  
  // Handle user online/offline status
  socket.on("getOnlineStatus", async (usernames) => {
    try {
      const statusMap = {};
      usernames.forEach(username => {
        statusMap[username] = usersOnline.has(username);
      });
      socket.emit("onlineStatusResult", statusMap);
    } catch (error) {
      console.error("Error getting online status:", error);
      socket.emit("error", "Failed to get online status");
    }
  });
  
  // Handle disconnect
  socket.on("disconnect", () => {
    const username = socketToUser.get(socket.id);
    if (username) {
      usersOnline.delete(username);
      socketToUser.delete(socket.id);
      io.emit("updateOnlineUsers", Array.from(usersOnline.keys()));
      io.emit("userOffline", { username });
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Update the API routes to use Socket.IO for real-time communication

// Get all conversations for the current user
app.get("/api/conversations", authenticateToken, async (req, res) => {
  try {
    const currentUser = await User.findOne({ username: req.user.username });
    
    // Find all messages where current user is either sender or recipient
    const conversations = await Conversation.aggregate([
      {
        $match: {
          participants: currentUser._id
        }
      },
      {
        $sort: { lastMessageTime: -1 }
      },
      {
        $lookup: {
          from: "users",
          localField: "participants",
          foreignField: "_id",
          as: "participantDetails"
        }
      },
      {
        $project: {
          participants: 1,
          lastMessage: 1,
          lastMessageTime: 1,
          lastMessageSender: 1,
          participantDetails: {
            $filter: {
              input: "$participantDetails",
              as: "participant",
              cond: { $ne: ["$$participant._id", currentUser._id] }
            }
          }
        }
      },
      {
        $unwind: "$participantDetails"
      },
      {
        $project: {
          _id: 1,
          username: "$participantDetails.username",
          userId: "$participantDetails._id",
          lastMessage: 1,
          lastMessageTime: 1,
          isLastMessageFromMe: { $eq: ["$lastMessageSender", currentUser._id] }
        }
      }
    ]);
    
    // Get unread count for each conversation
    const conversationsWithUnreadCount = await Promise.all(
      conversations.map(async (conv) => {
        const unreadCount = await Message.countDocuments({
          sender: conv.userId,
          recipient: currentUser._id,
          read: false
        });
        
        return {
          ...conv,
          unreadCount
        };
      })
    );
    
    res.json(conversationsWithUnreadCount);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ message: "Error fetching conversations", error });
  }
});

// Get message history between current user and another user
app.get("/api/messages/:otherUser", authenticateToken, async (req, res) => {
  try {
    const currentUser = await User.findOne({ username: req.user.username });
    const otherUser = await User.findOne({ username: req.params.otherUser });
    
    if (!currentUser || !otherUser) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Find messages between the two users (in both directions)
    const messages = await Message.find({
      $or: [
        { sender: currentUser._id, recipient: otherUser._id },
        { sender: otherUser._id, recipient: currentUser._id }
      ]
    })
    .sort({ createdAt: 1 })
    .lean();
    
    // Mark messages as read if recipient is current user
    if (messages.length > 0) {
      await Message.updateMany(
        { 
          recipient: currentUser._id,
          sender: otherUser._id,
          read: false
        },
        { $set: { read: true } }
      );
      
      // Notify the other user that messages were read (if online)
      if (usersOnline.has(otherUser.username)) {
        io.to(otherUser.username).emit("messagesRead", { by: currentUser.username });
      }
    }
    
    // Format messages for display
    const formattedMessages = messages.map(msg => ({
      ...msg,
      isSender: msg.sender.equals(currentUser._id),
      senderName: msg.sender.equals(currentUser._id) ? currentUser.username : otherUser.username
    }));
    
    res.json(formattedMessages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ message: "Error fetching messages", error });
  }
});

// Start server with Socket.IO
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});