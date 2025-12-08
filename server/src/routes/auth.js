import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import crypto from 'crypto';
import { sendResetEmail } from '../utils/emailService.js';

const router = express.Router();
const resetCodes = new Map();

router.post('/register', async (req, res) => {
  try {
    let { fullName, email, password, confirmPassword } = req.body;

    if (!fullName || !email || !password || !confirmPassword) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    email = email.toLowerCase().trim();
    password = password.trim();
    confirmPassword = confirmPassword.trim();

    if (password !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = new User({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword
    });

    await user.save();

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

router.post('/login', async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    email = email.toLowerCase().trim();
    password = password.trim(); 

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    let isPasswordValid = false;

    const looksHashed = typeof user.password === 'string' && user.password.startsWith('$2b$');

    if (looksHashed) {
      isPasswordValid = await bcrypt.compare(password, user.password);
    } else {
      if (password === user.password) {
        isPasswordValid = true;

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        user.password = hashedPassword;
        await user.save();
        console.log(`Password for user ${user.email} has been securely hashed.`);
      }
    }

    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        bio: user.bio,
        avatar: user.avatar
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

router.post('/forgotpassword', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: 'No user found with this email address' });
    }

    res.json({
      message: 'Password reset instructions sent to your email'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        exists: false, 
        message: 'Email is required' 
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    return res.json({ 
      exists: !!user,
      message: user ? 'Email exists' : 'Email available'
    });
    
  } catch (error) {
    console.error('Check email error:', error);
    return res.status(500).json({ 
      exists: false, 
      message: 'Server error' 
    });
  }
});

router.post('/send-reset-code', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: 'No user found with this email address' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    resetCodes.set(email.toLowerCase(), {
      code,
      resetToken,
      expiresAt: Date.now() + 15 * 60 * 1000, 
      attempts: 0
    });

    console.log(`Reset code for ${email}: ${code}`);

    try {
      const emailResult = await sendResetEmail(email, code);
      
      if (!emailResult.success) {
        console.error('Failed to send email:', emailResult.error);
        return res.status(500).json({ message: 'Failed to send email' });
      } else {
        console.log('Reset email sent successfully to:', email);
      }
    } catch (emailError) {
      console.error('Email sending error:', emailError);
    }

    res.json({
      message: 'Reset code sent successfully',
      resetToken
    });

  } catch (error) {
    console.error('Send reset code error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify Reset Code
router.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: 'Email and code are required' });
    }

    const resetData = resetCodes.get(email.toLowerCase());

    if (!resetData) {
      return res.status(400).json({ message: 'No reset code found. Please request a new one.' });
    }

    // Check expiration
    if (Date.now() > resetData.expiresAt) {
      resetCodes.delete(email.toLowerCase());
      return res.status(400).json({ message: 'Reset code has expired. Please request a new one.' });
    }

    // Check attempts (max 5)
    if (resetData.attempts >= 5) {
      resetCodes.delete(email.toLowerCase());
      return res.status(400).json({ message: 'Too many failed attempts. Please request a new code.' });
    }

    // Verify code
    if (resetData.code !== code.toString()) {
      resetData.attempts++;
      return res.status(400).json({ 
        message: `Incorrect code. ${5 - resetData.attempts} attempts remaining.` 
      });
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    resetData.verificationToken = verificationToken;
    resetData.verified = true;

    res.json({
      message: 'Code verified successfully',
      verificationToken
    });

  } catch (error) {
    console.error('Verify reset code error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword, verificationToken } = req.body;

    if (!email || !code || !newPassword || !verificationToken) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const resetData = resetCodes.get(email.toLowerCase());

    if (!resetData) {
      return res.status(400).json({ message: 'Invalid or expired reset session' });
    }

    if (!resetData.verified || resetData.verificationToken !== verificationToken) {
      return res.status(400).json({ message: 'Invalid verification. Please verify your code again.' });
    }

    if (resetData.code !== code.toString()) {
      return res.status(400).json({ message: 'Invalid code' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    user.password = hashedPassword;
    await user.save();

    resetCodes.delete(email.toLowerCase());

    console.log(`Password reset successful for: ${email}`);

    res.json({
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/change-password', async (req, res) => {
  try {
    console.log('=== Change Password via Auth Route ===');
    console.log('Request body:', req.body);
    
    const { userId, currentPassword, newPassword } = req.body;
    
    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'User ID, current password and new password are required' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    console.log('User found:', user.email);

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      console.log('Current password is incorrect');
      return res.status(401).json({ 
        success: false,
        message: 'Current password is incorrect' 
      });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must contain at least 8 characters, including uppercase and lowercase letters, a number and a special character' 
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'New password must be different from current password' 
      });
    }

    console.log('Setting new password...');
    user.password = newPassword;
    await user.save();

    console.log('Password changed successfully for:', user.email);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to change password' 
    });
  }
});

router.patch('/change-password', async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;
    
    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'User ID, current password and new password are required' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const isCurrentPasswordValid = await user.comparePassword(currentPassword);

    if (!isCurrentPasswordValid) {
      return res.status(401).json({ 
        success: false,
        message: 'Current password is incorrect' 
      });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must contain at least 8 characters, including uppercase and lowercase letters, a number and a special character' 
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'New password must be different from current password' 
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to change password' 
    });
  }
});

export default router;
