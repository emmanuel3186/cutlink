import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
    email: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true,
      lowercase: true,
      trim: true
    },
    password: { 
      type: String, 
      required: function() { return !this.googleId; }
    },
    googleId: { 
      type: String, 
      unique: true, 
      sparse: true
    },
    isPremium: {
      type: Boolean, 
      default: false 
    },
    isVerified: { 
      type: Boolean, 
      default: false 
    },
    resetPasswordToken: { 
      type: String 
    },
    resetPasswordExpires: { 
      type: Date 
    },
    verificationCode: { 
      type: String 
    },
    verificationCodeExpires: { 
      type: Date 
    }
}, { 
  timestamps: true
});

export default mongoose.model('User', UserSchema);
