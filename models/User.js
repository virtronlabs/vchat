const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    email: { type: String, unique: true }, 
    profilePicture: { type: String, default: 'default.jpg' },
    status: { type: String, enum: ['Online', 'Offline'], default: 'Offline' }
});

module.exports = mongoose.model("User", UserSchema);
