const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const cookieParser = require("cookie-parser");
const authenticateToken = require("./middlewares/auth");
const { Server } = require("socket.io"); // Import Socket.IO
require("dotenv").config();
const User = require("./models/User")
const Conversation = require("./models/Conversation")

const SECRET_KEY = process.env.JWT_SECRET;

const app = express();
const server = http.createServer(app); // Use http server for socket.io
const io = new Server(server); // Pass the server to socket.io
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

// === SOCKET.IO LOGIC ===
const usersOnline = new Map();

io.on("connection", (socket) => {
  console.log("New socket connection:", socket.id);

  // Send the socket ID to the client on connection
  socket.emit("socketId", socket.id);

  socket.on("userOnline", () => {
    const username = socket.user.username; // Get the username from the authenticated user
    usersOnline.set(username, socket.id);
    socket.username = username;
    console.log(`${username} is online with socket ID: ${socket.id}`);
    io.emit("updateOnlineUsers", Array.from(usersOnline.keys()));
  });

  socket.on("privateMessage", ({ to, message }) => {
    const recipientSocketId = usersOnline.get(to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("privateMessage", {
        from: socket.username,
        message,
      });
    } else {
      socket.emit("error", "User is not online");
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      usersOnline.delete(socket.username);
      io.emit("updateOnlineUsers", Array.from(usersOnline.keys()));
    }
    console.log("A user disconnected:", socket.id);
  });
});

// Landing page
app.get('/', async (req, res) => {
  try {
    const users = await User.find();
    res.render('index', {
      title: 'My EJS Page',
      message: 'Welcome to the Express server with EJS, Mongoose, and a public path!',
      users: users
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database error');
  }
});

// Signup Route
app.get("/signup", (req, res) => {
  res.render("signup");
});

app.post("/api/signup", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "Username and password are required" });
    }
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "Username already taken" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();
    res.redirect("/login");
  } catch (error) {
    res.status(500).json({ message: "Error registering user", error });
  }
});

// Login Route
app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ userId: user._id, username: user.username }, SECRET_KEY, { expiresIn: "1h" });
    res.cookie("token", token, { httpOnly: true });
    console.log("Login successful for:", username);
    res.json({ message: "Login successful", token });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Error logging in", error });
  }
});

app.get("/api/search-users", async (req, res) => {
  const query = req.query.q;

  if (!query) {
    return res.status(400).json({ error: "Search query is required" });
  }

  try {
    // Search for users whose username matches the query (case-insensitive)
    const users = await User.find({
      username: { $regex: query, $options: "i" },
    }).select("username profilePicture status"); // Only return necessary fields

    res.json(users);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new chat thread
app.post("/api/create-thread", async (req, res) => {
  const { participantIds } = req.body; // Array of user IDs in the chat

  if (!participantIds || participantIds.length < 2) {
    return res.status(400).json({ error: "At least two participants are required" });
  }

  try {
    // Check if a thread already exists with these participants
    const existingThread = await Conversation.findOne({
      participants: { $all: participantIds, $size: participantIds.length },
    });

    if (existingThread) {
      return res.json({ threadId: existingThread._id });
    }

    // Create a new thread
    const newThread = new Conversation({
      participants: participantIds,
      messages: [],
    });

    await newThread.save();
    res.json({ threadId: newThread._id });
  } catch (error) {
    console.error("Error creating thread:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /chat/:threadId
// routes/viewRoutes.js
app.get("/chat/:threadId", authenticateToken, async (req, res) => {
  const threadId = req.params.threadId;
  const currentUser = req.user; // Get the logged-in user's data

  try {
    // Fetch the conversation details (optional)
    const conversation = await Conversation.findById(threadId).populate("participants", "username");

    // Render the chat page with the currentUser and conversation data
    res.render("chat", { username: currentUser.username, currentUser, conversation });
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).send("Internal server error");
  }
});

// Get all conversations for the current user
app.get("/api/conversations", authenticateToken, async (req, res) => {
  try {
    const currentUser = await User.findOne({ username: req.user.username });
    
    // Find all messages where current user is either sender or recipient
    const messages = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: currentUser._id },
            { recipient: currentUser._id }
          ]
        }
      },
      {
        // Sort by date descending to get the latest messages first
        $sort: { createdAt: -1 }
      },
      {
        // Group by conversation partner
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender", currentUser._id] },
              "$recipient",
              "$sender"
            ]
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [
                  { $eq: ["$recipient", currentUser._id] },
                  { $eq: ["$read", false] }
                ]},
                1,
                0
              ]
            }
          }
        }
      },
      {
        // Look up the other user's details
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userDetails"
        }
      },
      {
        $unwind: "$userDetails"
      },
      {
        // Project only the fields we need
        $project: {
          username: "$userDetails.username",
          lastMessage: "$lastMessage.content",
          timestamp: "$lastMessage.createdAt",
          unreadCount: 1
        }
      },
      {
        // Sort by the latest message
        $sort: { timestamp: -1 }
      }
    ]);
    
    res.json(messages);
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
    .lean(); // Using lean() for better performance
    
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
    }
    
    // Transform messages to include the sender username instead of just ID
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

// Get all users for the search function
app.get("/api/users", authenticateToken, async (req, res) => {
  try {
    // Find all users except the current user
    const users = await User.find(
      { username: { $ne: req.user.username } },
      { username: 1, _id: 0 } // Only return usernames
    );
    
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Error fetching users", error });
  }
});

// Dashboard Route
app.get("/dashboard", authenticateToken, (req, res) => {
  res.render("dashboard", { username: req.user.username });
});

// Chat Route
// routes/viewRoutes.js
app.get("/chat", authenticateToken, (req, res) => {
  // Assuming `req.user` contains the logged-in user's data
  const currentUser = req.user;

  // Pass `currentUser` to the EJS template
  res.render("chat", { username: currentUser.username, currentUser });
});

// Logout route
app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

// Start server with Socket.IO
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
