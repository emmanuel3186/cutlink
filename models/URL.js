import mongoose from "mongoose";

const urlSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null,
    index: true 
  },
  customDomainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "CustomDomain",
    default: null,
    index: true
  },
  longUrl: {
    type: String,
    required: true
  },
  shortUrl: {
    type: String,
    required: true,
    unique: true,
    index: true
  },campaign: {
    type: String,
    trim: true,
    default: null
  },
  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tag"
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date, default: null 
  }
});
const URLModel = mongoose.model("URL", urlSchema);
export default URLModel;