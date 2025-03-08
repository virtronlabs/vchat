// middlewares/auth.js
require("dotenv").config();

const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Import your User model

const SECRET_KEY = process.env.JWT_SECRET;

async function authenticateToken(req, res, next) {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/login");
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);

    // Fetch the user from the database, excluding the password field
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) {
      throw new Error("User not found");
    }

    // Attach the user object (without password) to the request
    req.user = user;
    next();
  } catch (error) {
    console.error("Token verification error:", error.message);
    res.clearCookie("token");
    return res.redirect("/login");
  }
}

module.exports = authenticateToken;