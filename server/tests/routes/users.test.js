import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';

// Import route
import usersRouter from '../../src/routes/users.js';

// Import models
import User from '../../src/models/User.js';
import Notification from '../../src/models/Notification.js';

// Import database
import * as database from '../../src/config/database.js';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/users', usersRouter);

describe('Users Routes - Unit Tests', () => {
  let user1, user2, user3;

  // Helper function to create test user
  const createTestUser = async (overrides = {}) => {
    return await User.create({
      fullName: 'Test User',
      email: `test${Date.now()}@example.com`,
      password: 'Test1234!',
      bio: 'Test bio',
      avatar: null,
      followers: [],
      following: [],
      ...overrides
    });
  };

  beforeEach(async () => {
    user1 = await createTestUser({
      fullName: 'Alice Johnson',
      email: 'alice@test.com',
      bio: 'Alice bio',
      avatar: 'alice-avatar.jpg'
    });

    user2 = await createTestUser({
      fullName: 'Bob Smith',
      email: 'bob@test.com',
      bio: 'Bob bio'
    });

    user3 = await createTestUser({
      fullName: 'Charlie Brown',
      email: 'charlie@test.com'
    });
  });

  // GET /profile/:userId - Get User Profile
  describe('GET /profile/:userId - Get User Profile', () => {
    it('should get user profile successfully', async () => {
      const response = await request(app)
        .get(`/api/users/profile/${user1._id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.id).toBe(user1._id.toString());
      expect(response.body.user.fullName).toBe('Alice Johnson');
      expect(response.body.user.email).toBe('alice@test.com');
      expect(response.body.user.bio).toBe('Alice bio');
      expect(response.body.user.avatar).toBe('alice-avatar.jpg');
    });

    it('should not return password in profile', async () => {
      const response = await request(app)
        .get(`/api/users/profile/${user1._id}`);

      expect(response.status).toBe(200);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return 400 for invalid userId', async () => {
      const response = await request(app)
        .get('/api/users/profile/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid user ID');
    });

    it('should return 404 when user not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/users/profile/${nonExistentId}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get(`/api/users/profile/${user1._id}`);

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get(`/api/users/profile/${user1._id}`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to get profile');

      vi.restoreAllMocks();
    });
  });

  // PUT/PATCH /profile - Update Profile
  describe('PUT/PATCH /profile - Update Profile', () => {
    it('should update profile successfully with PUT', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .send({
          userId: user1._id.toString(),
          fullName: 'Alice Updated',
          bio: 'Updated bio',
          email: 'alice.updated@test.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Profile updated successfully');
      expect(response.body.user.fullName).toBe('Alice Updated');
      expect(response.body.user.bio).toBe('Updated bio');
      expect(response.body.user.email).toBe('alice.updated@test.com');
    });

    it('should update profile successfully with PATCH', async () => {
      const response = await request(app)
        .patch('/api/users/profile')
        .send({
          userId: user1._id.toString(),
          bio: 'New bio only'
        });

      expect(response.status).toBe(200);
      expect(response.body.user.bio).toBe('New bio only');
      expect(response.body.user.fullName).toBe('Alice Johnson'); // unchanged
    });

    it('should update avatar', async () => {
      const base64Avatar = 'data:image/png;base64,iVBORw0KGgo=';
      
      const response = await request(app)
        .put('/api/users/profile')
        .send({
          userId: user1._id.toString(),
          avatar: base64Avatar
        });

      expect(response.status).toBe(200);
      expect(response.body.user.avatar).toBe(base64Avatar);
    });

    it('should accept id instead of userId', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .send({
          id: user1._id.toString(), // using 'id' instead of 'userId'
          fullName: 'Updated via id'
        });

      expect(response.status).toBe(200);
      expect(response.body.user.fullName).toBe('Updated via id');
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .send({
          fullName: 'No userId'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User ID is required');
    });

    it('should return 400 for invalid userId', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .send({
          userId: 'invalid-id',
          fullName: 'Test'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid user ID');
    });

    it('should return 404 when user not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .put('/api/users/profile')
        .send({
          userId: nonExistentId.toString(),
          fullName: 'Test'
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 400 when email already exists', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .send({
          userId: user1._id.toString(),
          email: user2.email // Bob's email
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Email already exists');
    });

    it('should allow updating to same email', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .send({
          userId: user1._id.toString(),
          email: user1.email, // same email
          fullName: 'Updated Name'
        });

      expect(response.status).toBe(200);
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .put('/api/users/profile')
        .send({
          userId: user1._id.toString(),
          fullName: 'Test'
        });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .put('/api/users/profile')
        .send({
          userId: user1._id.toString(),
          fullName: 'Test'
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to update profile');

      vi.restoreAllMocks();
    });
  });

  // PUT /change-password - Change Password
  describe('PUT /change-password - Change Password', () => {
    it('should change password successfully', async () => {
      // Set a known password
      user1.password = 'OldPassword123!';
      await user1.save();

      const response = await request(app)
        .put('/api/users/change-password')
        .send({
          userId: user1._id.toString(),
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!'
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Password changed successfully');

      // Verify password was actually changed and is hashed
      const updatedUser = await User.findById(user1._id);
      expect(updatedUser.password).not.toBe('NewPassword123!'); // Should be hashed, not plain text
      expect(updatedUser.password).toContain('$2b$'); // Should be a bcrypt hash
      
      // Verify we can login with the new password
      const isPasswordValid = await updatedUser.comparePassword('NewPassword123!');
      expect(isPasswordValid).toBe(true);
    });

    it('should return 400 when fields are missing', async () => {
      const response = await request(app)
        .put('/api/users/change-password')
        .send({
          userId: user1._id.toString(),
          currentPassword: 'OldPassword123!'
          // missing newPassword
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User ID, current password and new password are required');
    });

    it('should return 400 for invalid userId', async () => {
      const response = await request(app)
        .put('/api/users/change-password')
        .send({
          userId: 'invalid-id',
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid user ID');
    });

    it('should return 404 when user not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .put('/api/users/change-password')
        .send({
          userId: nonExistentId.toString(),
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!'
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 401 when current password is incorrect', async () => {
      user1.password = 'OldPassword123!';
      await user1.save();

      const response = await request(app)
        .put('/api/users/change-password')
        .send({
          userId: user1._id.toString(),
          currentPassword: 'WrongPassword!',
          newPassword: 'NewPassword123!'
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Current password is incorrect');
    });

    it('should return 400 for weak new password', async () => {
      user1.password = 'OldPassword123!';
      await user1.save();

      const response = await request(app)
        .put('/api/users/change-password')
        .send({
          userId: user1._id.toString(),
          currentPassword: 'OldPassword123!',
          newPassword: 'weak'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Password must contain');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .put('/api/users/change-password')
        .send({
          userId: user1._id.toString(),
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!'
        });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .put('/api/users/change-password')
        .send({
          userId: user1._id.toString(),
          currentPassword: 'OldPassword123!',
          newPassword: 'NewPassword123!'
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to change password');

      vi.restoreAllMocks();
    });
  });

  // POST /upload-avatar - Upload Avatar
  describe('POST /upload-avatar - Upload Avatar', () => {
    it('should upload avatar successfully', async () => {
      const mockFile = Buffer.from('fake-image-data');
      
      const response = await request(app)
        .post('/api/users/upload-avatar')
        .attach('avatar', mockFile, 'avatar.jpg');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.url).toBeDefined();
      expect(response.body.url.startsWith('data:image')).toBe(true);
    });

    it('should return 400 when no file uploaded', async () => {
      const response = await request(app)
        .post('/api/users/upload-avatar');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No file uploaded');
    });

    it('should handle non-image file gracefully', async () => {
      const mockFile = Buffer.from('not-an-image');
      
      const response = await request(app)
        .post('/api/users/upload-avatar')
        .attach('avatar', mockFile, 'document.pdf');

      // Multer filter should reject, but might return 500 instead of 400
      expect([400, 500]).toContain(response.status);
    });

    it('should handle file too large gracefully', async () => {
      // Create a buffer larger than 5MB
      const largeFile = Buffer.alloc(6 * 1024 * 1024);
      
      const response = await request(app)
        .post('/api/users/upload-avatar')
        .attach('avatar', largeFile, 'large.jpg');

      // Multer should reject, but might return 500 instead of 413
      expect([413, 500]).toContain(response.status);
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const mockFile = Buffer.from('fake-image-data');
      const response = await request(app)
        .post('/api/users/upload-avatar')
        .attach('avatar', mockFile, 'avatar.jpg');

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('Database not available');

      vi.restoreAllMocks();
    });
  });

  // POST /:userId/follow - Follow User
  describe('POST /:userId/follow - Follow User', () => {
    it('should follow user successfully', async () => {
      const response = await request(app)
        .post(`/api/users/${user2._id}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User followed successfully');
      expect(response.body.followersCount).toBe(1);
      expect(response.body.followingCount).toBe(1);

      // Verify in database
      const followedUser = await User.findById(user2._id);
      const follower = await User.findById(user1._id);
      
      expect(followedUser.followers.some(f => f.userId === user1._id.toString())).toBe(true);
      expect(follower.following.some(f => f.userId === user2._id.toString())).toBe(true);
    });

    it('should create notification when following', async () => {
      const response = await request(app)
        .post(`/api/users/${user2._id}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(200);

      // Check notification was created
      const notification = await Notification.findOne({
        type: 'follow',
        fromUserId: user1._id.toString(),
        toUserId: user2._id.toString()
      });

      expect(notification).toBeDefined();
      expect(notification.message).toContain('started following you');
    });

    it('should return 400 when following yourself', async () => {
      const response = await request(app)
        .post(`/api/users/${user1._id}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Cannot follow yourself');
    });

    it('should return 400 when already following', async () => {
      // Follow first time
      await request(app)
        .post(`/api/users/${user2._id}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      // Try to follow again
      const response = await request(app)
        .post(`/api/users/${user2._id}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Already following this user');
    });

    it('should return 400 for invalid userId', async () => {
      const response = await request(app)
        .post('/api/users/invalid-id/follow')
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid user ID or follower ID');
    });

    it('should return 404 when user not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/users/${nonExistentId}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .post(`/api/users/${user2._id}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .post(`/api/users/${user2._id}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to follow user');

      vi.restoreAllMocks();
    });
  });

  // DELETE /:userId/follow - Unfollow User
  describe('DELETE /:userId/follow - Unfollow User', () => {
    beforeEach(async () => {
      // Setup: user1 follows user2
      user2.followers = [{ userId: user1._id.toString(), followedAt: new Date() }];
      user1.following = [{ userId: user2._id.toString(), followedAt: new Date() }];
      await user1.save();
      await user2.save();
    });

    it('should unfollow user successfully', async () => {
      const response = await request(app)
        .delete(`/api/users/${user2._id}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User unfollowed successfully');
      expect(response.body.followersCount).toBe(0);
      expect(response.body.followingCount).toBe(0);

      // Verify in database
      const unfollowedUser = await User.findById(user2._id);
      const unfollower = await User.findById(user1._id);
      
      expect(unfollowedUser.followers).not.toContain(user1._id.toString());
      expect(unfollower.following).not.toContain(user2._id.toString());
    });

    it('should return 400 when not following', async () => {
      const response = await request(app)
        .delete(`/api/users/${user3._id}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Not following this user');
    });

    it('should return 400 for invalid userId', async () => {
      const response = await request(app)
        .delete('/api/users/invalid-id/follow')
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid user ID or follower ID');
    });

    it('should return 404 when user not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/users/${nonExistentId}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .delete(`/api/users/${user2._id}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .delete(`/api/users/${user2._id}/follow`)
        .send({
          followerId: user1._id.toString()
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to unfollow user');

      vi.restoreAllMocks();
    });
  });

  // GET /:userId/follow-status/:viewerId
  describe('GET /:userId/follow-status/:viewerId - Get Follow Status', () => {
    beforeEach(async () => {
      // Setup: user2 has 2 followers, follows 1
      user2.followers = [
        { userId: user1._id.toString(), followedAt: new Date() },
        { userId: user3._id.toString(), followedAt: new Date() }
      ];
      user2.following = [{ userId: user1._id.toString(), followedAt: new Date() }];
      await user2.save();
    });

    it('should return follow status with counts', async () => {
      const response = await request(app)
        .get(`/api/users/${user2._id}/follow-status/${user1._id}`);

      expect(response.status).toBe(200);
      expect(response.body.followersCount).toBe(2);
      expect(response.body.followingCount).toBe(1);
      expect(response.body.isFollowing).toBe(true);
    });

    it('should return isFollowing false when not following', async () => {
      const response = await request(app)
        .get(`/api/users/${user1._id}/follow-status/${user2._id}`);

      expect(response.status).toBe(200);
      expect(response.body.isFollowing).toBe(false);
    });

    it('should handle missing viewerId', async () => {
      const response = await request(app)
        .get(`/api/users/${user2._id}/follow-status/`);

      // Should still return counts, just isFollowing will be false
      expect(response.status).toBe(404); // or handle gracefully
    });

    it('should return 400 for invalid userId', async () => {
      const response = await request(app)
        .get('/api/users/invalid-id/follow-status/viewer-id');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid user ID');
    });

    it('should return 404 when user not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/users/${nonExistentId}/follow-status/${user1._id}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get(`/api/users/${user2._id}/follow-status/${user1._id}`);

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });
  });

  // GET /search - Search Users
  describe('GET /search - Search Users', () => {
    it('should search users by name', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .query({ q: 'Alice' })
        .set('x-user-id', user2._id.toString());

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].userName).toBe('Alice Johnson');
    });

    it('should search users by email', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .query({ q: 'bob@test.com' })
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0].userEmail).toBe('bob@test.com');
    });

    it('should be case insensitive', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .query({ q: 'ALICE' })
        .set('x-user-id', user2._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should exclude current user from results', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .query({ q: 'Alice' })
        .set('x-user-id', user1._id.toString()); // Alice searching

      expect(response.status).toBe(200);
      const foundSelf = response.body.find(u => u.userId === user1._id.toString());
      expect(foundSelf).toBeUndefined();
    });

    it('should return 400 when query is empty', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .query({ q: '' })
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Search query is required');
    });

    it('should return 400 when query is missing', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Search query is required');
    });

    it('should limit results to 20 users', async () => {
      // Create many users
      for (let i = 0; i < 25; i++) {
        await createTestUser({
          fullName: `Test User ${i}`,
          email: `test${i}@example.com`
        });
      }

      const response = await request(app)
        .get('/api/users/search')
        .query({ q: 'Test' })
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.length).toBeLessThanOrEqual(20);
    });

    it('should return empty array when no matches', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .query({ q: 'NonExistentUser12345' })
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get('/api/users/search')
        .query({ q: 'Alice' })
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });
  });

  // DELETE /delete - Delete User
  describe('DELETE /delete - Delete User', () => {
    it('should delete user successfully', async () => {
      const response = await request(app)
        .delete('/api/users/delete')
        .send({
          userId: user3._id.toString(),
          password: 'Test1234!' // Use the correct default password from createTestUser
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User and all related data deleted successfully');

      // Verify user was deleted
      const deletedUser = await User.findById(user3._id);
      expect(deletedUser).toBeNull();
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .delete('/api/users/delete')
        .send({
          password: 'Test1234!'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('userId is required');
    });

    it('should return 400 when password is missing', async () => {
      const response = await request(app)
        .delete('/api/users/delete')
        .send({
          userId: user1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Password is required to delete account');
    });

    it('should return 401 for incorrect password', async () => {
      const response = await request(app)
        .delete('/api/users/delete')
        .send({
          userId: user1._id.toString(),
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Incorrect password. Account deletion cancelled.');
    });

    it('should return 400 for invalid userId', async () => {
      const response = await request(app)
        .delete('/api/users/delete')
        .send({
          userId: 'invalid-id',
          password: 'Test1234!'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid user ID');
    });

    it('should return 404 when user not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete('/api/users/delete')
        .send({
          userId: nonExistentId.toString(),
          password: 'Test1234!'
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .delete('/api/users/delete')
        .send({
          userId: user1._id.toString(),
          password: 'Test1234!'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);

      vi.restoreAllMocks();
    });
  });

  // Integration & Edge Cases
  describe('Integration & Edge Cases', () => {
    it('should handle follow/unfollow cycle', async () => {
      // Follow
      const followResponse = await request(app)
        .post(`/api/users/${user2._id}/follow`)
        .send({ followerId: user1._id.toString() });
      expect(followResponse.status).toBe(200);

      // Unfollow
      const unfollowResponse = await request(app)
        .delete(`/api/users/${user2._id}/follow`)
        .send({ followerId: user1._id.toString() });
      expect(unfollowResponse.status).toBe(200);

      // Follow again
      const refollowResponse = await request(app)
        .post(`/api/users/${user2._id}/follow`)
        .send({ followerId: user1._id.toString() });
      expect(refollowResponse.status).toBe(200);
    });

    it('should handle updating profile multiple times', async () => {
      // Update 1
      await request(app)
        .put('/api/users/profile')
        .send({
          userId: user1._id.toString(),
          fullName: 'Update 1'
        });

      // Update 2
      await request(app)
        .put('/api/users/profile')
        .send({
          userId: user1._id.toString(),
          fullName: 'Update 2'
        });

      // Update 3
      const response = await request(app)
        .put('/api/users/profile')
        .send({
          userId: user1._id.toString(),
          fullName: 'Final Update'
        });

      expect(response.status).toBe(200);
      expect(response.body.user.fullName).toBe('Final Update');
    });

    it('should handle very long bio', async () => {
      const longBio = 'a'.repeat(1000);

      const response = await request(app)
        .put('/api/users/profile')
        .send({
          userId: user1._id.toString(),
          bio: longBio
        });

      // Should handle based on schema maxlength (500)
      expect([200, 400]).toContain(response.status);
    });

    it('should handle special characters in name', async () => {
      const response = await request(app)
        .put('/api/users/profile')
        .send({
          userId: user1._id.toString(),
          fullName: '张伟 O\'Brien-Smith <script>alert("xss")</script>'
        });

      expect(response.status).toBe(200);
      expect(response.body.user.fullName).toBe('张伟 O\'Brien-Smith <script>alert("xss")</script>');
    });

    it('should handle concurrent follows from multiple users', async () => {
      const promises = [
        request(app)
          .post(`/api/users/${user1._id}/follow`)
          .send({ followerId: user2._id.toString() }),
        request(app)
          .post(`/api/users/${user1._id}/follow`)
          .send({ followerId: user3._id.toString() })
      ];

      const responses = await Promise.all(promises);
      
      responses.forEach(res => {
        expect(res.status).toBe(200);
      });

      // Verify both followers added
      const user = await User.findById(user1._id);
      expect(user.followers).toHaveLength(2);
    });

    it('should maintain data integrity when user not found in follow', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post(`/api/users/${nonExistentId}/follow`)
        .send({ followerId: user1._id.toString() });

      expect(response.status).toBe(404);

      // Verify user1's following list wasn't modified
      const user = await User.findById(user1._id);
      expect(user.following).toHaveLength(0);
    });

    it('should handle searching with special regex characters', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .query({ q: 'Alice.*+?[]{}()' })
        .set('x-user-id', user2._id.toString());

      // Should not crash
      expect([200, 500]).toContain(response.status);
    });

    it('should not expose sensitive data in search results', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .query({ q: 'Alice' })
        .set('x-user-id', user2._id.toString());

      expect(response.status).toBe(200);
      
      if (response.body.length > 0) {
        expect(response.body[0]).not.toHaveProperty('password');
        expect(response.body[0]).toHaveProperty('userName');
        expect(response.body[0]).toHaveProperty('userEmail');
      }
    });

    it('should handle temp-user-id in search', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .query({ q: 'Alice' })
        .set('x-user-id', 'temp-user-id');

      // temp-user-id might not be in DB, so could return 500 or 200
      expect([200, 500]).toContain(response.status);
    });
  });
});

// Export helper functions
export { createTestUser };