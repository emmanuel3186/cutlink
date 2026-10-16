import mongoose from "mongoose";

const qrCodeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },

  name: {
    type: String,
    required: true,
    trim: true
  },

  longUrl: {
    type: String,
    required: true
  },

  shortUrl: {
    type: String,
    default: null
  },

  linkId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "URL",
    default: null
  },
  
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },

  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model("QRCode", qrCodeSchema);