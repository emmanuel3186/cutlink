import URLModel from './models/URL.js';
import Click from './models/clicks.js';
import User from './models/user.js';
import QRCode from './models/qrCode.js';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import PDFDocumentWithTables from 'pdfkit-table';
import express from 'express';
import nodemailer from 'nodemailer';
import {customAlphabet} from 'nanoid';
import { OAuth2Client } from 'google-auth-library'; 
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
const app = express();
dotenv.config();
app.use(cors());
app.use(express.json());
const client = new OAuth2Client(process.env.CLIENT_ID);
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.error('MongoDB connection failed:', err));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.redirect('/home');
});
app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/login.html'));
});
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/signup.html'));
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/dashboard.html'));
});
app.get('/verify', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/verify.html'));
});
app.get('/terms-of-service', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/terms_of_service.html'));
});
app.get('/privacy-policy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/privacy_policy.html'));
});
app.get('/acceptable-use-policy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/acceptable_use_policy.html'));
});
app.get('/forgot_password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/forgot_password.html'))
})
app.get('/reset_password', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'reset_password.html')); 
});


const countryCache = new Map();
const COUNTRY_CACHE_TTL = 24 * 60 * 60 * 1000;

async function getCountryCode(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  const rawIp =
    (typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : '') ||
    req.socket.remoteAddress ||
    '';

  const ip = rawIp.replace(/^::ffff:/, '');

  if (!ip || ip === '127.0.0.1' || ip === '::1') {
    return 'Unknown';
  }

  const cached = countryCache.get(ip);

  if (cached && Date.now() - cached.time < COUNTRY_CACHE_TTL) {
    return cached.country;
  }

  const apiKey = process.env.IPAPI_KEY;

  if (!apiKey) {
    return 'Unknown';
  }

  try {
    const response = await fetch('https://api.ipapi.is/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: ip,
        key: apiKey
      }),
      signal: AbortSignal.timeout(3000)
    });

    if (!response.ok) {
      return 'Unknown';
    }

    const data = await response.json();

    const country =
      data.location?.country_code?.toUpperCase() || 'Unknown';

    if (country !== 'Unknown') {
      countryCache.set(ip, {
        country,
        time: Date.now()
      });
    }

    return country;
  } catch (err) {
    console.error('Country detection failed:', err.message);
    return 'Unknown';
  }
}


const requireAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({success: false, message: 'Access denied. Please log in first.' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    req.user = decoded; 
    next();
  } 
  catch (error) {
    return res.status(403).json({success: false, message: 'Session expired or invalid token.' });
  }
};

app.get('/api/user/links', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const linksWithClickCounts = await URLModel.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(req.user.userId) } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "clicks",        
          localField: "_id",    
          foreignField: "urlId", 
          as: "clickRecords"
        }
      },
      {
        $project: {
          _id: 1,
          longUrl: 1,
          shortUrl: 1,
          campaign: 1,
          createdAt: 1,
          expiresAt: 1,
          clicks: { $size: "$clickRecords" },
          uniqueVisitors: {
            $size: {
              $reduce: {
                input: "$clickRecords",
                initialValue: [],
                in: {
                  $setUnion: [
                    "$$value",
                    [{ $concat: ["$$this.ipAddress", "-", "$$this.userAgent"] }]
                  ]
                }
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          longUrl: 1,
          shortUrl: 1,
          campaign: 1,
          createdAt: 1,
          expiresAt: 1,
          clicks: 1,
          uniqueVisitors: 1,
          ctr: {
            $cond: {
              if: { $eq: ["$clicks", 0] },
              then: 0,
              else: { 
                $round: [
                  { $multiply: [{ $divide: ["$uniqueVisitors", "$clicks"] }, 100] }, 
                  2 
                ]
              }
            }
          }
        }
      }
    ]);
    const now = new Date();
    const currentPeriodStart = new Date(now);
    currentPeriodStart.setDate(currentPeriodStart.getDate() - 7);
    const previousPeriodStart = new Date(now);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - 14);

    const linkIds = linksWithClickCounts.map(link => link._id);
    const periodClicks = await Click.aggregate([
      {
        $match: {
          urlId: { $in: linkIds },
          createdAt: { $gte: previousPeriodStart, $lt: now }
        }
      },
      {
        $group: {
          _id: {
            urlId: "$urlId",
            period: {
              $cond: [
                { $gte: ["$createdAt", currentPeriodStart] },
                "current",
                "previous"
              ]
            }
          },
          clicks: { $sum: 1 }
        }
      }
    ]);

    const growthByLink = new Map();
    for (const item of periodClicks) {
      const linkId = item._id.urlId.toString();

      if (!growthByLink.has(linkId)) {
        growthByLink.set(linkId, { current: 0, previous: 0 });
      }

      growthByLink.get(linkId)[item._id.period] = item.clicks;
    }
    for (const link of linksWithClickCounts) {
      const counts = growthByLink.get(link._id.toString()) || {
        current: 0,
        previous: 0
      };

      const difference = counts.current - counts.previous;

      let growth = null;

      if (counts.previous > 0) {
        growth = Number(((difference / counts.previous) * 100).toFixed(1));
      } else if (counts.current > 0) {
        growth = 100;
      }

      link.clickDifference = difference;
      link.percentageChange = growth;
      link.growth = growth;
    }
    const allClicks = await Click.find({
      urlId: { $in: linksWithClickCounts.map(link => link._id) }
    }).select('ipAddress userAgent');
    const totalUniqueVisitors = new Set(
      allClicks.map(click => `${click.ipAddress}-${click.userAgent}`)
    ).size;
    return res.json({ 
      success: true, 
      user: {
        email: user.email,
        isPremium: user.isPremium
      },
      uniqueVisitors: totalUniqueVisitors,
      links: linksWithClickCounts 
    });
  } 
  catch (error) {
    console.error('Error fetching dashboard links:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/export-pdf', async (req, res) => {
  try {
    const { links } = req.body;
    if (!links || !Array.isArray(links) || links.length === 0) {
      return res.status(400).json({ error: "No data provided for export" });
    }
    const doc = new PDFDocumentWithTables({ 
      size: 'LETTER', 
      layout: 'landscape',
      margin: 36 
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=analytics_report.pdf');
    doc.pipe(res);
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(22).text('Top Performing Links Report', 36, 40);
    doc.moveDown(1);
    const tableRows = links.map(link => {
      const totalClicks = link.clicks || 0;
      const uniqueVisitors = link.uniqueVisitors || 0;
      const ctr = totalClicks > 0 ? `${((uniqueVisitors / totalClicks) * 100).toFixed(2)}%` : '0.00%';
      const dateString = link.createdAt ? new Date(link.createdAt).toLocaleDateString() : 'N/A';
      return [
        String(link.shortUrl || ''),
        String(link.longUrl || ''),
        String(link.campaign || 'None'),
        String(dateString),
        String(totalClicks),
        String(uniqueVisitors),
        String(ctr)
      ];
    });
    const table = {
      headers: ["Short URL", "Original Destination URL", "Campaign", "Created", "Total Clicks", "Unique Visitors", "CTR"],
      rows: tableRows,
    };
    const tableOptions = {
      width: 720, 
      headerColor: '#4f46e5', 
      headerOpacity: 1,
      prepareHeader: () => {
        doc.fillColor("#334155");
        doc.font("Helvetica-Bold"); 
        doc.fontSize(10); 
      },
      prepareRow: (row, index, i, rect) => {
        doc.font("Helvetica").fontSize(9).fillColor("#334155");
      },
      options: {
        shading: (rowIndex) => rowIndex % 2 === 0 ? '#f8fafc' : null
      }
    };
    await doc.table(table, tableOptions);
    doc.end();

  } catch (error) {
    console.error("PDF generation engine hit a fatal wall:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to build PDF document structures" });
    }
  }
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

app.post('/api/auth/register', async (req, res) => {
  const {email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if(!emailRegex.test(email)){
    return res.status(400).json({success: false, message: "Enter a valid email address"});
  }
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expires = new Date(Date.now() + 10 * 60 * 1000); 
  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const newUser = new User({
      email: email.toLowerCase(),
      password: hashedPassword,
      verificationCode: code,
      verificationCodeExpires: expires
    });
    await newUser.save();
    const mailOptions = {
      from: `"cutlink" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email Address',
      text: `Your 6-digit confimation code is: ${code}. It expires in 10 minutes.`,
      html: `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2>Confirm Your Email Address</h2>
        <p>Use the following 6-digit access token to verify your account registration request:</p>
        <h1 style="background: #f1f5f9; padding: 15px; text-align: center; letter-spacing: 5px; font-size: 32px; color: #4f46e5; border-radius: 8px;">
          ${code}
        </h1>
        <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
          This token is highly time-sensitive and expires shortly. If you did not request this code, please disregard this transmission securely.
        </p>
      </div>
      `
    }
  await transporter.sendMail(mailOptions);
    return res.status(201).json({ success: true, message: 'Verify your email address' });
  }
  catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  const {email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ success: false, message: "Email and verification code are required." });
  }
  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }
    if (user.isVerified) {
      return res.status(400).json({ success: false, message: "This account is already verified. Please log in." });
    }
    if (user.verificationCode !== code) {
      return res.status(400).json({ success: false, message: "Invalid verification code." });
    }
    if (new Date() > user.verificationCodeExpires) {
      return res.status(400).json({ success: false, message: "Verification code has expired. Please request a new one." });
    }
    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;
    await user.save();
    return res.status(200).json({ 
      success: true, 
      message: "Account verified successfully!" 
    });
  } catch (error) {
    console.error("Verification endpoint error:", error);
    return res.status(500).json({ success: false, message: "An internal server error occurred." });
  }
});

app.post('/api/auth/resend', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, message: "Email is required." });
  }
  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ success: false, message: "User account not found." });
    }
    if (user.isVerified) {
      return res.status(400).json({ success: false, message: "This account is already verified. Please log in." });
   }
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    const newExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.verificationCode = newCode;
    user.verificationCodeExpires = newExpires;
    await user.save();
    const mailOptions = {
      from: `"cutlink" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email Address',
      text: `Your 6-digit confimation code is: ${newCode}. It expires in 10 minutes.`,
      html: `
      <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <h2>Confirm Your Email Address</h2>
        <p>Use the following 6-digit access token to verify your account registration request:</p>
        <h1 style="background: #f1f5f9; padding: 15px; text-align: center; letter-spacing: 5px; font-size: 32px; color: #4f46e5; border-radius: 8px;">
          ${newCode}
        </h1>
        <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
          This token is highly time-sensitive and expires shortly. If you did not request this code, please disregard this transmission securely.
        </p>
      </div>
      `
    }
    await transporter.sendMail(mailOptions);
    return res.status(200).json({ 
      success: true, 
      message: "A fresh verification code has been sent to your email inbox." 
    });
  } catch (error) {
    console.error("Resend endpoint error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password, rememberMe } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    try {
      const user = await User.findOne({ email: email.toLowerCase() });
      if (!user) {
        return res.status(400).json({ success: false, message: 'Invalid email or password credentials.' });
      }
      if (!user.isVerified) {
        return res.status(403).json({ 
          success: false, 
          message: "Your account is not verified yet. Please confirm your email code first." 
        });
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Invalid email or password credentials.' });
      }
      const expiresInDuration = rememberMe ? '30d' : '24h'; 
      const token = jwt.sign(
        { userId: user._id, isPremium: user.isPremium },
        process.env.JWT_SECRET,
        { expiresIn: expiresInDuration }
      );
      return res.json({
        success: true,
        message: 'Welcome back!',
        token,
        user: { name: user.name, email: user.email, isPremium: user.isPremium }
      });
    }
    catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

export async function sendResetPasswordEmail(recipientEmail, resetToken) {
  const resetLink = `${BASE_URL}/reset_password?token=${resetToken}`;
  const mailOptions = {
    from: `"cutlink Support" <${process.env.EMAIL_USER}>`,
    to: recipientEmail,
    subject: 'Reset Your cutlink Password',
    text: `You requested a password reset. Click this link to reset your password: ${resetLink}. It expires in 1 hour.`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; color: #333; border: 1px solid #f1f5f9; border-radius: 12px;">
        <h2 style="color: #4f46e5; text-align: center;">Password Reset Request</h2>
        <p>Hi there,</p>
        <p>We received a request to reset the password for your <strong>cutlink</strong> account. Click the button below to choose a new password:</p>
        <!-- Secure Action Button Link -->
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" 
            style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; display: inline-block; font-size: 16px;">
            Reset Password
          </a>
        </div>
        <p style="font-size: 13px; color: #64748b;">
          This link is highly time-sensitive and will automatically expire in <strong>1 hour</strong> for your security.
        </p>
        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
        <p style="font-size: 11px; color: #94a3b8; line-height: 1.4;">
          If you did not initiate this request, you can safely ignore this email. Your password will remain unchanged. If clicking the button doesn't work, copy and paste this link into your browser: <br/>
          <a href="${resetLink}" style="color: #4f46e5;">${resetLink}</a>
        </p>
      </div>
      `
    };
    await transporter.sendMail(mailOptions);
}

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(200).json({ success: true, message: "No account found with that email." });
    }
    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; 
    await user.save();
    await sendResetPasswordEmail(user.email, resetToken);
    return res.status(200).json({ success: true, message: "Password reset link sent to your email." });
  } catch (err) {
    console.error("CRITICAL PASSWORD RESET ERROR:", err); 
    return res.status(500).json({ 
      success: false, 
      message: `Server Error: ${err.message}` 
    });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ 
      success: false, 
      message: "Reset token verification and a new password input are required." 
    });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ 
      success: false, 
      message: "Password must be at least 6 characters long." 
    });
  }
  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() }
    });
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "This password reset link is invalid or has already expired. Please request a new link." 
      });
    }
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.isVerified = true; 
    await user.save();
    return res.status(200).json({ 
      success: true, 
      message: "Your password has been successfully updated! Redirecting to login..." 
    });
    } catch (error) {
      console.error("CRITICAL RESET PASS ENDPOINT FAILURE:", error);
      return res.status(500).json({ 
        success: false, 
        message: "An internal server error occurred while updating your password. Please try again." 
      });
    }
});

app.post('/api/auth/google', async (req, res) => {
  const { token } = req.body;
  if(!token) {
    return res.status(400).json({ success: false, message: 'Token is required' });
  }
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.CLIENT_ID
    });
    const payload = ticket.getPayload();
    const { sub, email} = payload;
    let user = await User.findOne({ googleId: sub });
    if (!user) {
      user = await User.findOne({ email: email.toLowerCase().trim() });
      if (user) {
        user.googleId = sub;
        user.isVerified = true; 
        await user.save();
      } 
      else {
        user = new User({
          googleId: sub,
          email: email,
          isVerified: true 
        });
        await user.save();
      }
    }
    const jwtToken = jwt.sign(
      { userId: user._id, isPremium: user.isPremium },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    return res.json({
      success: true,
      message: 'Authentication successful',
      token: jwtToken,
      user: { email: user.email, isPremium: user.isPremium }
    });
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during Google login' });
  }
});

app.get('/api/config/google-client-id', (req, res) => {
  res.json({ clientId: process.env.CLIENT_ID });
});

app.get('/api/user/profile', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ success: false, message: "No login token provided." });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found in database." });
    }
    return res.status(200).json({
      success: true,
      user: {
        email: user.email,
        isPremium: user.isPremium
      }
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return res.status(401).json({ success: false, message: "Session expired or invalid token." });
  }
});


const generateShortCode = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 6);

app.post('/api/shorten', async (req, res) => {
  let { longUrl, campaign } = req.body;

  campaign = typeof campaign === 'string' ? campaign.trim() : null;
  if (!campaign) campaign = null;

  if (!longUrl) {
    return res.status(400).json({ success: false, message: 'Please enter a link to shorten.' });
  }
  longUrl = longUrl.trim();
  if (!/^https?:\/\//i.test(longUrl)) {
    longUrl = `https://${longUrl}`;
  }
  let currentUserId = null;
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      currentUserId = decoded.userId;
    } catch (err) { 
      return res.status(500).json({ success: false, message: 'Token is invalid' });
    }
  }
  try {
    let urlRecord = await URLModel.findOne({
      longUrl: longUrl,
      userId: currentUserId,
      campaign: campaign
    });
    if (urlRecord) {
      const shortLink = `${BASE_URL}/${urlRecord.shortUrl}`;
      return res.status(200).json({ 
        success: true, 
        message: 'Link retrieved from your history logs!', 
        shortUrl: shortLink 
      });
    }
    const shortCode = generateShortCode();
    urlRecord = new URLModel({
      longUrl: longUrl,
      shortUrl: shortCode,
      userId: currentUserId,
      campaign: campaign
    });
    await urlRecord.save();
    const shortLink = `${BASE_URL}/${urlRecord.shortUrl}`;
    return res.status(201).json({ 
      success: true, 
      message: "Link shortened successfully!", 
      shortUrl: shortLink 
    });
  }
  catch (error) {
    console.error("SHORTENER ENGINE REDIRECT CRASH ERROR:", error); 
    return res.status(500).json({ success: false, message: `Server Error: ${error.message}` });
  }
});

app.get('/qr/:id', async (req, res) => {
  try {
    const qrCode = await QRCode.findById(req.params.id);

    if (!qrCode) {
      return res.status(404).send('QR code not found.');
    }

    if (qrCode.status === 'inactive') { 
      return res.status(410).send(
      `<div style="font-family: sans-serif; text-align: center; margin-top: 100px;"> 
        <h1>QR Code Inactive</h1> 
        <p>This promotion or offer is no longer available.</p> 
        <p>Please contact the business for more information.</p> 
      </div>`); 
    }

    // Check whether this QR code belongs to a shortened link.
    let urlRecord = null;

    if (qrCode.linkId) {
      urlRecord = await URLModel.findOne({
        _id: qrCode.linkId,
        userId: qrCode.userId
      });

      if (!urlRecord) {
        return res.status(404).send('The associated shortened link was not found.');
      }

      if (urlRecord.expiresAt && new Date() > urlRecord.expiresAt) {
        return res.status(410).send('This shortened link has expired.');
      }
    }

    // Identify the visitor's device.
    const userAgent = req.headers['user-agent'] || 'Unknown';

    let device = 'Desktop';

    if (/ipad|tablet/i.test(userAgent)) {
      device = 'Tablet';
    } else if (/mobile/i.test(userAgent)) {
      device = 'Mobile';
    }

    const ipAddress =
      req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress ||
      'Unknown';

    const referrer = req.headers['referer'] || 'Unknown';

    const country = await getCountryCode(req);

    // Save the scan, linked to this specific QR code.
    await Click.create({
      urlId: urlRecord ? urlRecord._id : null,
      qrCodeId: qrCode._id,
      ipAddress,
      userAgent,
      referrer,
      device,
      country
    });

    // Redirect the visitor to the destination.
    const destination = urlRecord
      ? urlRecord.longUrl
      : qrCode.longUrl;

    return res.redirect(302, destination);

  } catch (error) {
    console.error('QR tracking error:', error);
    return res.status(500).send('Internal server error.');
  }
});

app.get('/api/analytics', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const links = await URLModel.find({
      userId: userId
    }).select('_id shortUrl longUrl createdAt');

    const { range = '30d', linkId } = req.query;

    let selectedLinks = links;

    if (linkId) {
      selectedLinks = links.filter(
        (link) => link._id.toString() === linkId
      );

      if (selectedLinks.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Link not found',
        });
      }
    }

    const validRanges = ['7d', '30d', '90d', 'all'];

    if (!validRanges.includes(range)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid analytics range',
      });
    }

    const clickFilter = {
      urlId: { $in: selectedLinks.map((link) => link._id) },
    };

    if (range !== 'all') {
      const days = Number.parseInt(range, 10);
      const startDate = new Date();

      startDate.setUTCHours(0, 0, 0, 0);
      startDate.setUTCDate(startDate.getUTCDate() - days + 1);

      clickFilter.createdAt = { $gte: startDate };
    }
    const clicks = await Click.find(clickFilter).sort({ createdAt: 1 }).lean();

    let previousClicks = [];

    if (range !== 'all') {
      const days = Number.parseInt(range, 10);

      const previousEnd = new Date();
      previousEnd.setUTCHours(0, 0, 0, 0);
      previousEnd.setUTCDate(previousEnd.getUTCDate() - days + 1);

      const previousStart = new Date(previousEnd);
      previousStart.setUTCDate(previousStart.getUTCDate() - days);

      previousClicks = await Click.find({
        urlId: { $in: selectedLinks.map((link) => link._id) },
        createdAt: {
          $gte: previousStart,
          $lt: previousEnd,
        },
      }).lean();
    }
    const previousTimeline = {};

    previousClicks.forEach((click) => {
      const date = click.createdAt.toISOString().split('T')[0];

      previousTimeline[date] = (previousTimeline[date] || 0) + 1;
    });

    let previousSeries = null;

    if (range !== 'all') {
      const days = Number.parseInt(range, 10);

      const previousEnd = new Date();
      previousEnd.setUTCHours(0, 0, 0, 0);
      previousEnd.setUTCDate(previousEnd.getUTCDate() - days + 1);

      const previousStart = new Date(previousEnd);
      previousStart.setUTCDate(previousStart.getUTCDate() - days);

      previousSeries = [];

      for (
        let date = new Date(previousStart);
        date < previousEnd;
        date.setUTCDate(date.getUTCDate() + 1)
      ) {
        const dateString = date.toISOString().split('T')[0];

        previousSeries.push({
          date: dateString,
          clicks: previousTimeline[dateString] || 0,
        });
      }
    }

    const totalClicks = clicks.length;
    const timeline = {};

    clicks.forEach((click) => {
      const date = click.createdAt.toISOString().split('T')[0];

      timeline[date] = (timeline[date] || 0) + 1;
    });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const startDate = new Date(today);

    if (range !== 'all') {
      startDate.setUTCDate(
        today.getUTCDate() - Number.parseInt(range, 10) + 1
      );
    } else if (clicks.length > 0) {
      startDate.setTime(clicks[0].createdAt.getTime());
      startDate.setUTCHours(0, 0, 0, 0);
    }

    const series = [];

    for (
      let date = new Date(startDate);
      date <= today;
      date.setUTCDate(date.getUTCDate() + 1)
    ) {
      const dateString = date.toISOString().split('T')[0];

      series.push({
        date: dateString,
        clicks: timeline[dateString] || 0,
      });
    }
    const sources = {};
    clicks.forEach((click) => {
      let source;
      if (click.utmSource) {
        source = click.utmSource.trim().toLowerCase();
      } else {
        const referrer = click.referrer;

        if (!referrer || referrer === 'Unknown') {
          source = 'Unknown';
        } else if (referrer === 'Direct') {
          source = 'Direct';
        } else {
          try {
            source = new URL(referrer).hostname.replace(/^www\./, '');
          } catch {
            source = 'Unknown';
          }
        }
      }

      sources[source] = (sources[source] || 0) + 1;
    });

    const sourceList = Object.entries(sources).map(([label, clicks]) => ({
      label,
      clicks,
    }));

    const devices = {};

    clicks.forEach((click) => {
      const device = click.device || 'Unknown';

      devices[device] = (devices[device] || 0) + 1;
    });

    const deviceList = Object.entries(devices).map(([label, clicks]) => ({
      label,
      clicks,
    }));

    const browsers = {};

    clicks.forEach((click) => {
      const ua = click.userAgent || '';

      let browser = 'Other';

      if (/edg/i.test(ua)) {
        browser = 'Edge';
      } else if (/opr|opera/i.test(ua)) {
        browser = 'Opera';
      } else if (/firefox|fxios/i.test(ua)) {
        browser = 'Firefox';
      } else if (/samsungbrowser/i.test(ua)) {
        browser = 'Samsung Internet';
      } else if (/chrome|crios/i.test(ua)) {
        browser = 'Chrome';
      } else if (/safari/i.test(ua)) {
        browser = 'Safari';
      }

      browsers[browser] = (browsers[browser] || 0) + 1;
    });

    const browserList = Object.entries(browsers).map(([label, clicks]) => ({
      label,
      clicks,
    }));

    const locations = {};
    clicks.forEach((click) => {
      const country = click.country || 'Unknown';

      locations[country] = (locations[country] || 0) + 1;
    });

    const locationList = Object.entries(locations).map(([label, clicks]) => ({
      label,
      clicks,
    }));

    const topLinks = selectedLinks.map((link) => {
      const linkClicks = clicks.filter(
        (click) => String(click.urlId) === String(link._id)
      ).length;

      return {
        _id: link._id,
        shortUrl: link.shortUrl,
        longUrl: link.longUrl,
        clicks: linkClicks,
      };
    }).sort((a, b) => b.clicks - a.clicks).slice(0, 5);

    return res.json({
      success: true,
      totalClicks,
      series,
      previousSeries,
      sources: sourceList,
      devices: deviceList,
      browsers: browserList,
      locations: locationList,
      topLinks,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

app.get('/api/campaigns', requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const links = await URLModel.find({
      userId,
      campaign: { $exists: true, $nin: [null, ''] }
    })
      .select('_id shortUrl longUrl campaign createdAt expiresAt')
      .sort({ createdAt: -1 })
      .lean();

    const linkIds = links.map(link => link._id);

    const clickCounts = await Click.aggregate([
      {
        $match: {
          urlId: { $in: linkIds }
        }
      },
      {
        $group: {
          _id: '$urlId',
          clicks: { $sum: 1 }
        }
      }
    ]);
    
    const sourceBreakdown = await Click.aggregate([
      {
        $match: {
          urlId: { $in: linkIds }
        }
      },
      {
        $group: {
          _id: {
            urlId: '$urlId',
            source: '$utmSource'
          },
          clicks: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          urlId: '$_id.urlId',
          source: {
            $ifNull: ['$_id.source', 'Unknown']
          },
          clicks: 1
        }
      },
      {
        $sort: {
          clicks: -1
        }
      }
    ]);

    const clicksByLink = new Map(
      clickCounts.map(item => [
        String(item._id),
        item.clicks
      ])
    );

    const sourcesByLink = new Map();

    sourceBreakdown.forEach(item => {
      const key = String(item.urlId);

      if (!sourcesByLink.has(key)) {
        sourcesByLink.set(key, []);
      }

      sourcesByLink.get(key).push({
        source: item.source,
        clicks: item.clicks
      });
    });

    const campaigns = links.map(link => {
      let source = '';
      let medium = '';
      let utmCampaign = '';

      try {
        const destination = new URL(link.longUrl);

        source = destination.searchParams.get('utm_source') || '';
        medium = destination.searchParams.get('utm_medium') || '';
        utmCampaign =
          destination.searchParams.get('utm_campaign') || '';
      } catch {
        // Keep the UTM fields empty if the URL cannot be parsed.
      }

      const expired =
        link.expiresAt && new Date(link.expiresAt) <= new Date();

      return {
        id: String(link._id),
        name: link.campaign,
        shortUrl: `${BASE_URL}/${link.shortUrl}`,
        source,
        medium,
        utmCampaign,
        clicks: clicksByLink.get(String(link._id)) || 0,
        sources: sourcesByLink.get(String(link._id)) || [],
        createdAt: link.createdAt,
        status: expired ? 'expired' : 'active'
      };
    });

    return res.json({
      success: true,
      campaigns,
      totalCampaigns: campaigns.length,
      totalClicks: campaigns.reduce(
        (total, campaign) => total + campaign.clicks,
        0
      ),
      activeCampaigns: campaigns.filter(
        campaign => campaign.status === 'active'
      ).length
    });
  } catch (error) {
    console.error('Fetch campaigns error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve campaigns.'
    });
  }
});


app.get('/:code', async (req, res) => {
  const { code } = req.params; 
  if (code === 'favicon.ico' || code === 'output.css') return;
  try {
    const urlRecord = await URLModel.findOne({ shortUrl: code });
    if (!urlRecord) {
      return res.status(404).send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 100px;">
          <h1>404 - Link Not Found</h1>
          <p>The short link you followed does not exist or has been removed.</p>
        </div>
      `);
    }
    if (urlRecord.expiresAt && new Date() > urlRecord.expiresAt) {
      return res.status(410).send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 100px;">
            <h1>Link Expired ⏰</h1>
            <p>This campaign or temporary link has ended.</p>
        </div>
      `);
    }
    const userAgent = req.headers['user-agent'] || '';
    let device = 'Desktop';
    if (/ipad|tablet/i.test(userAgent)) {
      device = 'Tablet';
    } else if (/mobile/i.test(userAgent)) {
      device = 'Mobile';
    } 
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const referrer = req.headers['referer'] || 'Unknown';
    const destinationUrl = new URL(urlRecord.longUrl);
    const utmSource = req.query.utm_source ||destinationUrl.searchParams.get('utm_source') ||null;
    const utmMedium = req.query.utm_medium ||destinationUrl.searchParams.get('utm_medium') ||null;const utmCampaign = req.query.utm_campaign ||destinationUrl.searchParams.get('utm_campaign') ||
    null;
    const country = await getCountryCode(req);
    const clickLog = new Click({
      urlId: urlRecord._id,
      ipAddress,
      userAgent,
      referrer,
      device,
      country,
      utmSource,
      utmMedium,
      utmCampaign
    });
    await clickLog.save();
    return res.redirect(302, urlRecord.longUrl);
  } 
  catch (error) {
    console.error('Redirect handler error:', error);
    return res.status(500).send('Internal server error');
  }
});

app.get('/api/analytics/:code', requireAuth, async (req, res) => {
  const { code } = req.params;
  const rangeDays = parseInt(req.query.range) || 30;

  try {
    const urlRecord = await URLModel.findOne({ shortUrl: code });
    if (!urlRecord) return res.status(404).json({ success: false, message: 'Short code not found' });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let currentPeriodStart;
    let previousPeriodStart;
    let previousPeriodEnd;

    if (rangeDays === 1) {
      currentPeriodStart = todayStart; 
      
      previousPeriodStart = new Date(todayStart.getTime() - (24 * 60 * 60 * 1000)); 
      previousPeriodEnd = todayStart; 
    } else {
      currentPeriodStart = new Date(todayStart.getTime() - (rangeDays * 24 * 60 * 60 * 1000));
      previousPeriodStart = new Date(todayStart.getTime() - (rangeDays * 2 * 24 * 60 * 60 * 1000));
      previousPeriodEnd = currentPeriodStart;
    }

    const allClicks = await Click.find({
      urlId: urlRecord._id,
      createdAt: { $gte: previousPeriodStart }
    }).sort({ createdAt: 1 });

    const currentPeriodClicksArray = allClicks.filter(click => click.createdAt >= currentPeriodStart);
    const previousPeriodClicksArray = allClicks.filter(click => click.createdAt >= previousPeriodStart && click.createdAt < previousPeriodEnd);

    const currentPeriodClicks = currentPeriodClicksArray.length;
    const previousPeriodClicks = previousPeriodClicksArray.length;

    const clickDifference = currentPeriodClicks - previousPeriodClicks;
    let percentageChange = 0;
    if (previousPeriodClicks > 0) {
      percentageChange = Math.round((clickDifference / previousPeriodClicks) * 100);
    } else if (previousPeriodClicks === 0 && currentPeriodClicks > 0) {
      percentageChange = 100;
    }

    const devices = { Desktop: 0, Mobile: 0, Tablet: 0 };
    const referrers = {};
    const timeline = {};

    currentPeriodClicksArray.forEach(click => {
      if (devices[click.device] !== undefined) devices[click.device]++;
      const ref = click.referrer || 'Direct';
      referrers[ref] = (referrers[ref] || 0) + 1;
      const dateString = click.createdAt.toISOString().split('T')[0];
      timeline[dateString] = (timeline[dateString] || 0) + 1;
    });

    return res.json({
      success: true,
      totalClicks: currentPeriodClicks,
      previousPeriodClicks,
      clickDifference,
      percentageChange,
      deviceBreakdown: devices,
      topReferrers: referrers,
      timeline,
      rangeDays
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.delete('/api/delete/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid link ID.'
      });
    }
    const deletedLink = await URLModel.findOneAndDelete({
      _id: id,
      userId: req.user.userId
    });

    if (!deletedLink) {
      return res.status(404).json({
        success: false,
        message: 'Link not found.'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Link deleted successfully.',
      id: deletedLink._id.toString()
    });

  } catch (error) {
    console.error('Delete link error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to delete link.'
    });
  }
})

app.post("/api/qr-codes", requireAuth, async (req, res) => {
  try {
    const {
      name,
      destinationUrl,
      linkId,
      shortUrl
    } = req.body;
    // 1. Validate the QR code name
    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "QR code name is required."
      });
    }
    // 2. Validate the destination URL
    if (
      !destinationUrl ||
      typeof destinationUrl !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Destination URL is required."
      });
    }
    let parsedUrl;

    try {
      parsedUrl = new globalThis.URL(destinationUrl);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Enter a valid destination URL."
      });
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return res.status(400).json({
        success: false,
        message: "Only HTTP and HTTPS URLs are allowed."
      });
    }
    let verifiedLinkId = null;
    let verifiedShortUrl = null;
    let verifiedDestinationUrl = destinationUrl;

    if (linkId) {
      const existingLink = await URLModel.findOne({
        _id: linkId,
        userId: req.user.userId
      });

      if (!existingLink) {
        return res.status(404).json({
          success: false,
          message: "Shortened link not found."
        });
      }

      verifiedLinkId = existingLink._id;
      verifiedShortUrl = existingLink.shortUrl;
      verifiedDestinationUrl = existingLink.longUrl;
    }
    // 4. Save the QR code
    const qrCodes = await QRCode.create({
      userId: req.user.userId,
      name: name.trim(),
      longUrl: verifiedDestinationUrl,
      shortUrl: verifiedShortUrl,
      linkId: verifiedLinkId
    });
    
    // 5. Return the created record
    return res.status(201).json({
      success: true,
      message: "QR code created successfully.",
      qrCodes
    });

  } catch (error) {
    console.error("Create QR code error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create QR code."
    });
  }
});

app.get("/api/qr-codes", requireAuth, async (req, res) => {
  try {
    const qrCodes = await QRCode.find({
      userId: req.user.userId
    }).sort({ createdAt: -1 });
    // Get the IDs of this user's QR codes.
    const qrCodeIds = qrCodes.map(qr => qr._id);
    // Count scans for each QR code from the Click collection.
    const scanCounts = await Click.aggregate([
      {
        $match: {
          qrCodeId: { $in: qrCodeIds }
        }
      },
      {
        $group: {
          _id: "$qrCodeId",
          scans: { $sum: 1 }
        }
      }
    ]);

    // Convert the results into a lookup map.
    const scansByQr = new Map(
      scanCounts.map(item => [
        item._id.toString(),
        item.scans
      ])
    );
    // Attach the scan count to each QR code.
    const qrCodesWithScans = qrCodes.map(qr => ({
      ...qr.toObject(),
      scans: scansByQr.get(qr._id.toString()) || 0
    }));

    return res.status(200).json({
      success: true,
      qrCodes: qrCodesWithScans
    });

  } catch (error) {
    console.error("Get QR codes error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve QR codes."
    });
  }
});

app.patch("/api/qr-codes/:id/status", requireAuth, async (req, res) => {
  try {
    const { status } = req.body;

    // Validate the requested status.
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be active or inactive."
      });
    }

    // Only update a QR code belonging to the logged-in user.
    const qrCode = await QRCode.findOneAndUpdate(
      { 
        _id: req.params.id, 
        userId: req.user.userId 
      },
      { status },
      { returnDocument: 'after', 
        runValidators: true 
      }
    );

    if (!qrCode) {
      return res.status(404).json({
        success: false,
        message: "QR code not found."
      });
    }

    return res.status(200).json({
      success: true,
      message: `QR code ${status === "active" ? "activated" : "deactivated"} successfully.`,
      qrCode
    });

  } catch (error) {
    console.error("Update QR code status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update QR code status."
    });
  }
});

app.get("/api/qr-codes/summary", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId;

    const total = await QRCode.countDocuments({ userId });

    const userQrCodeIds = await QRCode.distinct("_id", { userId });

    const scans = await Click.countDocuments({
      qrCodeId: { $in: userQrCodeIds }
    });

    const active = total;

    return res.status(200).json({
      success: true,
      total,
      scans,
      active
    });

  } catch (error) {
    console.error("QR summary error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve QR summary."
    });
  }
});

app.delete("/api/qr-codes/:id", requireAuth, async (req, res) => {
  try {
    const qrCode = await QRCode.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId
    });

    if (!qrCode) {
      return res.status(404).json({
        success: false,
        message: "QR code not found."
      });
    }

    return res.status(200).json({
      success: true,
      message: "QR code deleted successfully."
    });
  } catch (error) {
    console.error("Delete QR code error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete QR code."
    });
  }
});

export default app;

if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3000;

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}