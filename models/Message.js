const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  recipient: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  // Additional fields for group chats (optional)
  group: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Group", 
    default: null // Null for direct messages, group ID for group messages
  },
  // Optional: Add message type (text, image, file, etc.)
  messageType: { 
    type: String, 
    enum: ["text", "image", "file"], 
    default: "text" 
  },
  // Optional: Add metadata for files/images (e.g., URL, size)
  metadata: { 
    type: mongoose.Schema.Types.Mixed, 
    default: null 
  }
});

// Create indexes for faster queries
MessageSchema.index({ sender: 1, recipient: 1 }); // For direct messages
MessageSchema.index({ group: 1 }); // For group messages
MessageSchema.index({ createdAt: -1 }); // For sorting messages by date

module.exports = mongoose.model("Message", MessageSchema);