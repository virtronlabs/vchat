const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const cookieParser = require("cookie-parser");
const { Server } = require("socket.io");
const User = require("./models/User");
const authenticateToken = require("./middlewares/auth");

require("dotenv").config();

const SECRET_KEY = process.env.JWT_SECRET;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 3700;

// Connect to MongoDB
mongoose
  .connect("mongodb://localhost:27017/vchat")
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const usersOnline = new Map();

// Socket.IO logic - CRITICAL FIX
io.on("connection", (socket) => {
  console.log("New socket connection:", socket.id);

  // Send socket ID to the client
  socket.emit("socketId", socket.id);

  // Handle user login and track online status
  socket.on("userOnline", (username) => {
    usersOnline.set(username, socket.id);
    socket.username = username; // Associate username with the socket
    console.log(`${username} is online with socket ID: ${socket.id}`);
    io.emit("updateOnlineUsers", Array.from(usersOnline.keys())); // Broadcast updated list
  });

  // Handle private messages
  socket.on("privateMessage", ({ to, message }) => {
    const recipientSocketId = usersOnline.get(to);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit("privateMessage", {
        from: socket.username, // Use the username associated with the socket
        message,
      });
    } else {
      socket.emit("error", "User is not online");
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    if (socket.username) {
      usersOnline.delete(socket.username);
      io.emit("updateOnlineUsers", Array.from(usersOnline.keys())); // Broadcast updated list
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

// Dashboard Route
app.get("/dashboard", authenticateToken, (req, res) => {
  res.render("dashboard", { username: req.user.username });
});

// Chat Route
app.get("/chat", authenticateToken, (req, res) => {
  res.render("chat", { username: req.user.username });
});

// Logout route
app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/login");
});

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});