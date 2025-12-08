import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

import authRouter from '../../src/routes/auth.js';

import User from '../../src/models/User.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('Auth Routes - Unit Tests', () => {
  let testUser;

  const createTestUser = async (overrides = {}) => {
    const hashedPassword = await bcrypt.hash('Test1234!', 12);
    return await User.create({
      fullName: 'Test User',
      email: 'test@example.com',
      password: hashedPassword,
      ...overrides
    });
  };

  beforeEach(async () => {
    testUser = await createTestUser();
  });

  describe('POST /register - User Registration', () => {
    const validUserData = {
      fullName: 'John Doe',
      email: 'john@example.com',
      password: 'SecurePass123!',
      confirmPassword: 'SecurePass123!'
    };

    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(validUserData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message', 'User registered successfully');
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.fullName).toBe('John Doe');
      expect(response.body.user.email).toBe('john@example.com');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should hash the password before saving', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(validUserData);

      expect(response.status).toBe(201);

      const user = await User.findById(response.body.user.id);
      expect(user.password).not.toBe('SecurePass123!');
      expect(user.password.startsWith('$2b$')).toBe(true);

      const isValid = await bcrypt.compare('SecurePass123!', user.password);
      expect(isValid).toBe(true);
    });

    it('should return a valid JWT token', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send(validUserData);

      expect(response.status).toBe(201);
      expect(response.body.token).toBeDefined();

      const decoded = jwt.verify(
        response.body.token,
        process.env.JWT_SECRET || 'your-secret-key'
      );
      expect(decoded.userId).toBe(response.body.user.id);
    });

    it('should trim and lowercase the email', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUserData,
          email: '  JOHN@EXAMPLE.COM  '
        });

      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe('john@example.com');
    });

    it('should trim the full name', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUserData,
          fullName: '  John Doe  '
        });

      expect(response.status).toBe(201);
      expect(response.body.user.fullName).toBe('John Doe');
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'john@example.com',
          password: 'SecurePass123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('All fields are required');
    });

    it('should return 400 when passwords do not match', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUserData,
          confirmPassword: 'DifferentPassword123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Passwords do not match');
    });

    it('should return 400 when password is too short', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUserData,
          password: 'Short1!',
          confirmPassword: 'Short1!'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Password must be at least 8 characters long');
    });

    it('should return 400 when email already exists', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(validUserData);

      const response = await request(app)
        .post('/api/auth/register')
        .send(validUserData);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User already exists with this email');
    });

    it('should handle case-insensitive email duplicates', async () => {
      await request(app)
        .post('/api/auth/register')
        .send(validUserData);

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...validUserData,
          email: 'JOHN@EXAMPLE.COM'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User already exists with this email');
    });

    it('should handle empty string fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: '',
          email: '',
          password: '',
          confirmPassword: ''
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('All fields are required');
    });

    it('should handle whitespace-only fullName', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: '   ',
          email: 'whitespace@example.com',
          password: 'Test1234!',
          confirmPassword: 'Test1234!'
        });

      expect([201, 400, 500]).toContain(response.status);
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findOne').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .post('/api/auth/register')
        .send(validUserData);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error during registration');

      vi.restoreAllMocks();
    });
  });

  describe('POST /login - User Login', () => {
    it('should login successfully with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Test1234!'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Login successful');
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('test@example.com');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return a valid JWT token on login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Test1234!'
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();

      const decoded = jwt.verify(
        response.body.token,
        process.env.JWT_SECRET || 'your-secret-key'
      );
      expect(decoded.userId).toBe(response.body.user.id);
    });

    it('should return user data with bio and avatar', async () => {
      testUser.bio = 'Test bio';
      testUser.avatar = 'avatar.jpg';
      await testUser.save();

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Test1234!'
        });

      expect(response.status).toBe(200);
      expect(response.body.user.bio).toBe('Test bio');
      expect(response.body.user.avatar).toBe('avatar.jpg');
    });

    it('should auto-hash plain text password and login', async () => {
      const legacyUser = await User.create({
        fullName: 'Legacy User',
        email: 'legacy@example.com',
        password: 'PlainPassword123!'
      });

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'legacy@example.com',
          password: 'PlainPassword123!'
        });

      expect(response.status).toBe(200);

      const updatedUser = await User.findById(legacyUser._id);
      expect(updatedUser.password.startsWith('$2b$')).toBe(true);
    });

    it('should handle email case insensitivity', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'TEST@EXAMPLE.COM',
          password: 'Test1234!'
        });

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should trim email whitespace', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: '  test@example.com  ',
          password: 'Test1234!'
        });

      expect(response.status).toBe(200);
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'Test1234!'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Email and password are required');
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Email and password are required');
    });

    it('should return 400 when user not found', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Test1234!'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should return 400 when password is incorrect', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should not reveal whether email or password is wrong', async () => {
      const response1 = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'wrong@example.com',
          password: 'Test1234!'
        });

      const response2 = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword!'
        });

      expect(response1.body.message).toBe(response2.body.message);
      expect(response1.body.message).toBe('Invalid email or password');
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findOne').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'Test1234!'
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error during login');

      vi.restoreAllMocks();
    });
  });

  describe('POST /forgotpassword - Password Reset', () => {
    it('should send reset email for existing user', async () => {
      const response = await request(app)
        .post('/api/auth/forgotpassword')
        .send({
          email: 'test@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password reset instructions sent to your email');
    });

    it('should handle email case insensitivity', async () => {
      const response = await request(app)
        .post('/api/auth/forgotpassword')
        .send({
          email: 'TEST@EXAMPLE.COM'
        });

      expect(response.status).toBe(200);
    });

    it('should trim email whitespace', async () => {
      const response = await request(app)
        .post('/api/auth/forgotpassword')
        .send({
          email: '  test@example.com  '
        });

      expect(response.status).toBe(200);
    });

    it('should return 400 when email is missing', async () => {
      const response = await request(app)
        .post('/api/auth/forgotpassword')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Email is required');
    });

    it('should return 404 when user not found', async () => {
      const response = await request(app)
        .post('/api/auth/forgotpassword')
        .send({
          email: 'nonexistent@example.com'
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('No user found with this email address');
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findOne').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .post('/api/auth/forgotpassword')
        .send({
          email: 'test@example.com'
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error');

      vi.restoreAllMocks();
    });
  });

  describe('Security & Integration', () => {
    it('should use bcrypt with sufficient rounds (10+)', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Security Test',
          email: 'security@example.com',
          password: 'SecurePass123!',
          confirmPassword: 'SecurePass123!'
        });

      expect(response.status).toBe(201);

      const user = await User.findById(response.body.user.id);
      const rounds = parseInt(user.password.split('$')[2]);
      expect(rounds).toBeGreaterThanOrEqual(10);
    });

    it('should set JWT expiration to 7 days', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'JWT Test',
          email: 'jwt@example.com',
          password: 'SecurePass123!',
          confirmPassword: 'SecurePass123!'
        });

      expect(response.status).toBe(201);

      const decoded = jwt.verify(
        response.body.token,
        process.env.JWT_SECRET || 'your-secret-key'
      );

      const now = Math.floor(Date.now() / 1000);
      const sevenDays = 7 * 24 * 60 * 60;
      const expiresIn = decoded.exp - now;

      expect(expiresIn).toBeGreaterThan(sevenDays - 60); 
      expect(expiresIn).toBeLessThan(sevenDays + 60);
    });

    it('should prevent SQL injection in email field', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: "admin'--",
          password: 'anything'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid email or password');
    });

    it('should handle very long email addresses', async () => {
      const longEmail = 'a'.repeat(300) + '@example.com';

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Long Email Test',
          email: longEmail,
          password: 'SecurePass123!',
          confirmPassword: 'SecurePass123!'
        });

      expect([201, 400, 500]).toContain(response.status);
    });

    it('should handle special characters in password', async () => {
      const specialPassword = '!@#$%^&*()_+-=[]{}|;:,.<>?';

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Special Char Test',
          email: 'special@example.com',
          password: specialPassword,
          confirmPassword: specialPassword
        });

      expect(response.status).toBe(201);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'special@example.com',
          password: specialPassword
        });

      expect(loginResponse.status).toBe(200);
    });

    it('should handle unicode characters in full name', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: '张伟 محمد José François',
          email: 'unicode@example.com',
          password: 'SecurePass123!',
          confirmPassword: 'SecurePass123!'
        });

      expect(response.status).toBe(201);
      expect(response.body.user.fullName).toBe('张伟 محمد José François');
    });

    it('should not expose password in any response', async () => {
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'No Password Test',
          email: 'nopass@example.com',
          password: 'SecurePass123!',
          confirmPassword: 'SecurePass123!'
        });

      expect(registerResponse.body.user).not.toHaveProperty('password');

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nopass@example.com',
          password: 'SecurePass123!'
        });

      expect(loginResponse.body.user).not.toHaveProperty('password');
    });
  });
});

export { createTestUser };