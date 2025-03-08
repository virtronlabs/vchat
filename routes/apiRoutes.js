const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authenticateToken = require("../middlewares/auth");
const cookieParser = require("cookie-parser"); // ✅ Import cookie-parser
require("dotenv").config();

const SECRET_KEY = process.env.JWT_SECRET; // ✅ Use from .env

if (!SECRET_KEY) {
  throw new Error("Missing SECRET_KEY in environment variables");
}

const router = express.Router();


router.use(cookieParser()); // ✅ Enable cookie parsing middleware

// Signup Route
router.post("/signup", async (req, res) => {
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

    res.redirect("/login"); // Redirect user to login page
  } catch (error) {
    res.status(500).json({ message: "Error registering user", error });
  }
});

router.post("/api/login", async (req, res) => {
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

// ✅ Dashboard API Route (Returns JSON User Data)
router.get("/api/dashboard", authenticateToken, (req, res) => {
  res.json({ username: req.user.username });
});

router.get("/api/search-users", async (req, res) => {
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

// ✅ Logout Route - Clears Cookie
router.get("/logout", (req, res) => {
  res.clearCookie("token"); // ✅ Clear JWT cookie
  res.redirect("/login");
});

module.exports = router;
