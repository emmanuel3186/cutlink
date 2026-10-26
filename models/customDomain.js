import mongoose from "mongoose";

const customDomainSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    domain: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    status: {
      type: String,
      enum: ["pending", "verified", "failed"],
      default: "pending",
    },

    verificationToken: {
      type: String,
      required: true,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    ready: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// A user cannot add the same domain twice.
customDomainSchema.index(
  { userId: 1, domain: 1 },
  { unique: true }
);

const CustomDomain = mongoose.model(
  "CustomDomain",
  customDomainSchema
);

export default CustomDomain;
