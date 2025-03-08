const express = require("express");
const router = express.Router();
const authenticateToken = require("../middlewares/auth");
const User = require("../models/User");



// Serve Signup Page
router.get("/signup", (req, res) => {
    res.render("signup");
});

// Serve Login Page
router.get("/login", (req, res) => {
    res.render("login");
});

// Serve Dashboard
router.get("/dashboard", authenticateToken, (req, res) => {
  res.render("dashboard", { username: req.user.username });
});


// Default Home Route
router.get('/', async (req, res) => {
  try {
    // Retrieve all users from the database (if any)
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

router.get("/chat", authenticateToken, (req, res) => {
  res.render("chat", { currentUser: req.user });
});

router.get("/c", authenticateToken, (req, res) => {
  res.render("c", { username: req.user.username });
});

router.get("/m2", authenticateToken, (req, res) => {
  res.render("m2", { username: req.user.username, currentUser: req.user  });
});

router.get("/m", authenticateToken, (req, res) => {
  res.render("m", { username: req.user.username });
});

module.exports = router;
