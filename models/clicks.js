import mongoose from "mongoose";

const clickSchema = new mongoose.Schema({
  urlId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "URL", 
    default: null,
    index: true 
  },
  qrCodeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "qrCode",
    default: null,
    index: true
  },
  ipAddress: { 
    type: String, 
    required: true 
  },
  userAgent: { 
    type: String, 
    required: true 
  },
  referrer: { 
    type: String, 
    default: "Direct" 
  },
  device: { 
    type: String, 
    default: "Unknown" 
  },
  country: { 
    type: String, 
    default: "Unknown" 
  },
  utmSource: { 
    type: String, 
    default: null 
  },
  utmMedium: { 
    type: String, 
    default: null 
  },
  utmCampaign: { 
    type: String, 
    default: null 
  }
}, { 
  timestamps: true
});

const Click = mongoose.model("Click", clickSchema);
export default Click;
