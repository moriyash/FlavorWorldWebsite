import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';

// Import route
import notificationsRouter from '../../src/routes/notifications.js';

// Import models
import Notification from '../../src/models/Notification.js';
import User from '../../src/models/User.js';

// Import database
import * as database from '../../src/config/database.js';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/notifications', notificationsRouter);

describe('Notifications Routes - Unit Tests', () => {
  let user1, user2;
  let notification1, notification2, notification3;

  // Helper functions
  const createTestUser = async (overrides = {}) => {
    return await User.create({
      fullName: 'Test User',
      email: `test${Date.now()}@example.com`,
      password: 'Test1234!',
      ...overrides
    });
  };

  const createTestNotification = async (toUserId, overrides = {}) => {
    return await Notification.create({
      type: 'like',
      fromUserId: user2._id.toString(),
      toUserId: toUserId.toString(),
      message: 'Test notification',
      read: false,
      fromUser: {
        name: user2.fullName,
        avatar: user2.avatar
      },
      ...overrides
    });
  };

  beforeEach(async () => {
    // Create users
    user1 = await createTestUser({
      fullName: 'Alice Johnson',
      email: 'alice@test.com'
    });

    user2 = await createTestUser({
      fullName: 'Bob Smith',
      email: 'bob@test.com'
    });

    // Create notifications for user1
    notification1 = await createTestNotification(user1._id, {
      type: 'like',
      message: 'Bob liked your recipe',
      read: false
    });

    notification2 = await createTestNotification(user1._id, {
      type: 'comment',
      message: 'Bob commented on your recipe',
      read: false
    });

    notification3 = await createTestNotification(user1._id, {
      type: 'follow',
      message: 'Bob started following you',
      read: true // Already read
    });
  });

  // ==========================================
  // GET / - Get All Notifications
  // ==========================================
  describe('GET / - Get All Notifications', () => {
    it('should return all notifications for user', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(3);
    });

    it('should sort notifications by date descending', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      
      const notifications = response.body.data;
      if (notifications.length > 1) {
        for (let i = 1; i < notifications.length; i++) {
          const prev = new Date(notifications[i - 1].createdAt);
          const curr = new Date(notifications[i].createdAt);
          expect(prev >= curr).toBe(true);
        }
      }
    });

    it('should limit notifications to 50', async () => {
      // Create many notifications
      for (let i = 0; i < 60; i++) {
        await createTestNotification(user1._id, {
          message: `Notification ${i}`
        });
      }

      const response = await request(app)
        .get('/api/notifications')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(50);
    });

    it('should return empty array when user has no notifications', async () => {
      const newUser = await createTestUser({
        email: 'newuser@test.com'
      });

      const response = await request(app)
        .get('/api/notifications')
        .query({ userId: newUser._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .get('/api/notifications');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User ID is required');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get('/api/notifications')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Notification, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockRejectedValue(new Error('DB Error'))
        })
      });

      const response = await request(app)
        .get('/api/notifications')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to fetch notifications');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // PUT /:notificationId/read - Mark as Read
  // ==========================================
  describe('PUT /:notificationId/read - Mark Notification as Read', () => {
    it('should mark notification as read', async () => {
      const response = await request(app)
        .put(`/api/notifications/${notification1._id}/read`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.read).toBe(true);

      // Verify in database
      const updated = await Notification.findById(notification1._id);
      expect(updated.read).toBe(true);
    });

    it('should handle already read notification', async () => {
      // Mark as read first time
      await request(app)
        .put(`/api/notifications/${notification1._id}/read`);

      // Mark as read again
      const response = await request(app)
        .put(`/api/notifications/${notification1._id}/read`);

      expect(response.status).toBe(200);
      expect(response.body.data.read).toBe(true);
    });

    it('should return 404 when notification not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .put(`/api/notifications/${nonExistentId}/read`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Notification not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .put(`/api/notifications/${notification1._id}/read`);

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Notification, 'findByIdAndUpdate').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .put(`/api/notifications/${notification1._id}/read`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to mark as read');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // PUT /mark-all-read - Mark All as Read
  // ==========================================
  describe('PUT /mark-all-read - Mark All Notifications as Read', () => {
    it('should mark all notifications as read', async () => {
      const response = await request(app)
        .put('/api/notifications/mark-all-read')
        .send({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('All notifications marked as read');

      // Verify in database
      const unreadNotifications = await Notification.find({
        toUserId: user1._id.toString(),
        read: false
      });
      expect(unreadNotifications.length).toBe(0);
    });

    it('should handle user with no unread notifications', async () => {
      // Mark all as read first
      await Notification.updateMany(
        { toUserId: user1._id.toString() },
        { read: true }
      );

      const response = await request(app)
        .put('/api/notifications/mark-all-read')
        .send({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should handle user with no notifications', async () => {
      const newUser = await createTestUser({
        email: 'newuser@test.com'
      });

      const response = await request(app)
        .put('/api/notifications/mark-all-read')
        .send({ userId: newUser._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .put('/api/notifications/mark-all-read')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User ID is required');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .put('/api/notifications/mark-all-read')
        .send({ userId: user1._id.toString() });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Notification, 'updateMany').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .put('/api/notifications/mark-all-read')
        .send({ userId: user1._id.toString() });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to mark all as read');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // GET /unread-count - Get Unread Count
  // ==========================================
  describe('GET /unread-count - Get Unread Count', () => {
    it('should return unread notification count', async () => {
      const response = await request(app)
        .get('/api/notifications/unread-count')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2); // notification1 and notification2 are unread
    });

    it('should return 0 when no unread notifications', async () => {
      // Mark all as read
      await Notification.updateMany(
        { toUserId: user1._id.toString() },
        { read: true }
      );

      const response = await request(app)
        .get('/api/notifications/unread-count')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(0);
    });

    it('should return 0 when user has no notifications', async () => {
      const newUser = await createTestUser({
        email: 'newuser@test.com'
      });

      const response = await request(app)
        .get('/api/notifications/unread-count')
        .query({ userId: newUser._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(0);
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .get('/api/notifications/unread-count');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User ID is required');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get('/api/notifications/unread-count')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return count 0 on database error', async () => {
      vi.spyOn(Notification, 'countDocuments').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get('/api/notifications/unread-count')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.count).toBe(0);

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // Integration Tests
  // ==========================================
  describe('Integration Tests', () => {
    it('should handle complete notification flow', async () => {
      // 1. Get notifications
      let response = await request(app)
        .get('/api/notifications')
        .query({ userId: user1._id.toString() });
      expect(response.body.data.length).toBe(3);

      // 2. Check unread count
      response = await request(app)
        .get('/api/notifications/unread-count')
        .query({ userId: user1._id.toString() });
      expect(response.body.count).toBe(2);

      // 3. Mark one as read
      await request(app)
        .put(`/api/notifications/${notification1._id}/read`);

      // 4. Check unread count again
      response = await request(app)
        .get('/api/notifications/unread-count')
        .query({ userId: user1._id.toString() });
      expect(response.body.count).toBe(1);

      // 5. Mark all as read
      await request(app)
        .put('/api/notifications/mark-all-read')
        .send({ userId: user1._id.toString() });

      // 6. Check unread count is 0
      response = await request(app)
        .get('/api/notifications/unread-count')
        .query({ userId: user1._id.toString() });
      expect(response.body.count).toBe(0);
    });

    it('should handle multiple notification types', async () => {
      // Create different notification types
      await createTestNotification(user1._id, { type: 'like' });
      await createTestNotification(user1._id, { type: 'comment' });
      await createTestNotification(user1._id, { type: 'follow' });
      await createTestNotification(user1._id, { type: 'group_post' });

      const response = await request(app)
        .get('/api/notifications')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(3);

      // Check all types are present
      const types = response.body.data.map(n => n.type);
      expect(types).toContain('like');
      expect(types).toContain('comment');
      expect(types).toContain('follow');
    });
  });
});

// Export helper functions
export { createTestUser, createTestNotification };