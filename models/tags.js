import mongoose from "mongoose";

const tagSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 30
  },
  color: {
    type: String,
    default: "indigo"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Tag = mongoose.model("Tag", tagSchema);

export default Tag;
