const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  email: String,
  otpHash: String,
  purpose: { type: String, enum: ['register', 'reset'] },
  expiresAt: Date,
  createdAt: { type: Date, default: Date.now }
});

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('EmailOTP', schema);
