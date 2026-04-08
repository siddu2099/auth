const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const EmailOTP = require('../models/EmailOTP');
const transporter = require('../config/mailer');
const { generateOTP } = require('../utils/otp');
const { checkCooldown } = require('../utils/cooldown');
const auth = require('../middleware/auth');

/* =====================================================
   SEND OTP (REGISTER / RESET)
===================================================== */
router.post('/send-otp', async (req, res) => {
  try {
    const { email, purpose } = req.body;

    if (!email || !purpose) {
      return res.status(400).send('Email and purpose required');
    }

    console.log('OTP request for:', email);

    const lastOtp = await EmailOTP.findOne({ email, purpose })
      .sort({ createdAt: -1 });

    if (lastOtp && checkCooldown(lastOtp.createdAt)) {
      return res.status(429).send('Please wait before requesting another OTP');
    }

    const otp = generateOTP();

    await EmailOTP.create({
      email,
      purpose,
      otpHash: await bcrypt.hash(otp, 10),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    });

    await transporter.sendMail({
      from: '"OTP Auth" <siddughanta10@gmail.com>', // MUST be verified in Brevo
      to: email,
      subject: 'Your verification code for OTP Auth',
      text: `
Hello,

Your One-Time Password (OTP) is:

${otp}

This code is valid for 5 minutes.
If you did not request this, please ignore this email.

Thanks,
OTP Auth Team
`
    });

    console.log('OTP email sent to:', email);
    res.send('OTP sent successfully');
  } catch (err) {
    console.error('SEND OTP ERROR:', err);
    res.status(500).send('Failed to send OTP');
  }
});

/* =====================================================
   REGISTER USER
===================================================== */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, otp } = req.body;

    if (!username || !email || !password || !otp) {
      return res.status(400).send('All fields are required');
    }

    const otpRecord = await EmailOTP.findOne({
      email,
      purpose: 'register'
    }).sort({ createdAt: -1 });

    if (!otpRecord) return res.status(400).send('OTP not found');
    if (otpRecord.expiresAt < new Date())
      return res.status(400).send('OTP expired');

    const isOtpValid = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isOtpValid) return res.status(400).send('Invalid OTP');

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).send('User already exists');

    await User.create({
      username,
      email,
      passwordHash: await bcrypt.hash(password, 10)
    });

    await EmailOTP.deleteMany({ email, purpose: 'register' });

    res.send('User registered successfully');
  } catch (err) {
    console.error('REGISTER ERROR:', err);
    res.status(500).send('Registration failed');
  }
});

/* =====================================================
   LOGIN + JWT
===================================================== */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).send('User not found');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).send('Wrong password');

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES }
    );

    res.json({
      message: 'Login successful',
      token
    });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).send('Login failed');
  }
});

/* =====================================================
   RESET PASSWORD
===================================================== */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const otpRecord = await EmailOTP.findOne({
      email,
      purpose: 'reset'
    }).sort({ createdAt: -1 });

    if (!otpRecord) return res.status(400).send('OTP not found');
    if (otpRecord.expiresAt < new Date())
      return res.status(400).send('OTP expired');

    const validOtp = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!validOtp) return res.status(400).send('Invalid OTP');

    await User.updateOne(
      { email },
      { passwordHash: await bcrypt.hash(newPassword, 10) }
    );

    await EmailOTP.deleteMany({ email, purpose: 'reset' });

    res.send('Password reset successful');
  } catch (err) {
    console.error('RESET ERROR:', err);
    res.status(500).send('Password reset failed');
  }
});

/* =====================================================
   PROTECTED PROFILE ROUTE
===================================================== */
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash');
    if (!user) return res.status(404).send('User not found');
    res.json(user);
  } catch (err) {
    console.error('PROFILE FETCH ERROR:', err);
    res.status(500).send('Error fetching profile');
  }
});

module.exports = router;
