import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';

import groupChatsRouter from '../../src/routes/groupChats.js';

import GroupChat from '../../src/models/GroupChat.js';
import GroupChatMessage from '../../src/models/GroupChatMessage.js';
import User from '../../src/models/User.js';

import * as database from '../../src/config/database.js';

const app = express();
app.use(express.json());
app.use('/api/groupChats', groupChatsRouter);

describe('Group Chats Routes - Unit Tests', () => {
  let user1, user2, user3, user4;
  let groupChat1;

  const createTestUser = async (overrides = {}) => {
    return await User.create({
      fullName: 'Test User',
      email: `test${Date.now()}@example.com`,
      password: 'Test1234!',
      avatar: null,
      ...overrides
    });
  };

  const createTestGroupChat = async (adminId, participants = [], overrides = {}) => {
    const admin = await User.findById(adminId);
    const chatParticipants = [{
      userId: adminId.toString(),
      userName: admin.fullName,
      userAvatar: admin.avatar,
      role: 'admin',
      joinedAt: new Date()
    }];

    for (const participantId of participants) {
      const user = await User.findById(participantId);
      if (user) {
        chatParticipants.push({
          userId: participantId.toString(),
          userName: user.fullName,
          userAvatar: user.avatar,
          role: 'member',
          joinedAt: new Date()
        });
      }
    }

    const unreadMap = new Map();
    chatParticipants.forEach(p => unreadMap.set(p.userId, 0));

    return await GroupChat.create({
      name: 'Test Group Chat',
      description: 'Test description',
      adminId: adminId.toString(),
      participants: chatParticipants,
      unreadCount: unreadMap,
      settings: {
        allowMemberInvites: false,
        allowNameChange: true,
        allowMemberLeave: true
      },
      ...overrides
    });
  };

  beforeEach(async () => {
    user1 = await createTestUser({
      fullName: 'Alice Johnson',
      email: 'alice@test.com'
    });

    user2 = await createTestUser({
      fullName: 'Bob Smith',
      email: 'bob@test.com'
    });

    user3 = await createTestUser({
      fullName: 'Charlie Brown',
      email: 'charlie@test.com'
    });

    user4 = await createTestUser({
      fullName: 'Diana Prince',
      email: 'diana@test.com'
    });

    groupChat1 = await createTestGroupChat(
      user1._id,
      [user2._id, user3._id]
    );
  });

  describe('POST / - Create Group Chat', () => {
    it('should create group chat successfully', async () => {
      const response = await request(app)
        .post('/api/groupChats')
        .send({
          name: 'New Group Chat',
          description: 'A new test group',
          participants: [user2._id.toString(), user3._id.toString()],
          creatorId: user1._id.toString()
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('New Group Chat');
      expect(response.body.adminId).toBe(user1._id.toString());
      expect(response.body.participants).toHaveLength(3); 
    });

    it('should add creator as admin', async () => {
      const response = await request(app)
        .post('/api/groupChats')
        .send({
          name: 'Admin Test Group',
          participants: [user2._id.toString()],
          creatorId: user1._id.toString()
        });

      expect(response.status).toBe(201);
      const adminParticipant = response.body.participants.find(
        p => p.userId === user1._id.toString()
      );
      expect(adminParticipant.role).toBe('admin');
    });

    it('should create system message', async () => {
      const response = await request(app)
        .post('/api/groupChats')
        .send({
          name: 'System Message Test',
          participants: [user2._id.toString()],
          creatorId: user1._id.toString()
        });

      expect(response.status).toBe(201);

      const messages = await GroupChatMessage.find({
        groupChatId: response.body._id,
        isSystemMessage: true
      });

      expect(messages.length).toBe(1);
      expect(messages[0].content).toContain('created the group');
    });

    it('should initialize unread count map', async () => {
      const response = await request(app)
        .post('/api/groupChats')
        .send({
          name: 'Unread Test',
          participants: [user2._id.toString(), user3._id.toString()],
          creatorId: user1._id.toString()
        });

      expect(response.status).toBe(201);
      expect(response.body.unreadCount).toBeDefined();
    });

    it('should return 400 when name is missing', async () => {
      const response = await request(app)
        .post('/api/groupChats')
        .send({
          participants: [user2._id.toString()],
          creatorId: user1._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Group chat name is required');
    });

    it('should return 400 when creator ID is missing', async () => {
      const response = await request(app)
        .post('/api/groupChats')
        .send({
          name: 'No Creator',
          participants: [user2._id.toString()]
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Creator ID is required');
    });

    it('should return 400 when no participants', async () => {
      const response = await request(app)
        .post('/api/groupChats')
        .send({
          name: 'No Participants',
          creatorId: user1._id.toString(),
          participants: []
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('At least one participant is required');
    });

    it('should return 404 when creator not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post('/api/groupChats')
        .send({
          name: 'Bad Creator',
          participants: [user2._id.toString()],
          creatorId: nonExistentId.toString()
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Creator not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .post('/api/groupChats')
        .send({
          name: 'DB Test',
          participants: [user2._id.toString()],
          creatorId: user1._id.toString()
        });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .post('/api/groupChats')
        .send({
          name: 'Error Test',
          participants: [user2._id.toString()],
          creatorId: user1._id.toString()
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to create group chat');

      vi.restoreAllMocks();
    });
  });

  describe('GET /my - Get My Group Chats', () => {
    let groupChat2;

    beforeEach(async () => {
      groupChat2 = await createTestGroupChat(
        user2._id,
        [user1._id]
      );
    });

    it('should return all group chats for user', async () => {
      const response = await request(app)
        .get('/api/groupChats/my')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });

    it('should sort by updatedAt descending', async () => {
      groupChat2.updatedAt = new Date(Date.now() + 10000);
      await groupChat2.save();

      const response = await request(app)
        .get('/api/groupChats/my')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body[0]._id.toString()).toBe(groupChat2._id.toString());
    });

    it('should enrich with user data and counts', async () => {
      const response = await request(app)
        .get('/api/groupChats/my')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body[0]).toHaveProperty('unreadCount');
      expect(response.body[0]).toHaveProperty('isAdmin');
      expect(response.body[0]).toHaveProperty('participantsCount');
      expect(response.body[0]).toHaveProperty('type', 'group');
    });

    it('should return empty array when user has no group chats', async () => {
      const newUser = await createTestUser({
        email: 'newuser@test.com'
      });

      const response = await request(app)
        .get('/api/groupChats/my')
        .set('x-user-id', newUser._id.toString());

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get('/api/groupChats/my')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });
  });

  describe('GET /:chatId - Get Single Group Chat', () => {
    it('should get group chat successfully', async () => {
      const response = await request(app)
        .get(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body._id.toString()).toBe(groupChat1._id.toString());
      expect(response.body.name).toBe('Test Group Chat');
    });

    it('should include admin status', async () => {
      const response = await request(app)
        .get(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.isAdmin).toBe(true);
    });

    it('should include unread count', async () => {
      groupChat1.unreadCount.set(user1._id.toString(), 5);
      await groupChat1.save();

      const response = await request(app)
        .get(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.unreadCount).toBe(5);
    });

    it('should return 400 for invalid chat ID', async () => {
      const response = await request(app)
        .get('/api/groupChats/invalid-id')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid chat ID');
    });

    it('should return 404 when chat not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/groupChats/${nonExistentId}`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Group chat not found');
    });

    it('should return 403 when user not participant', async () => {
      const response = await request(app)
        .get(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user4._id.toString());

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to access this chat');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(GroupChat, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to fetch group chat');

      vi.restoreAllMocks();
    });
  });

  describe('GET /:chatId/messages - Get Messages', () => {
    beforeEach(async () => {
      for (let i = 0; i < 10; i++) {
        await GroupChatMessage.create({
          groupChatId: groupChat1._id.toString(),
          senderId: i % 2 === 0 ? user1._id.toString() : user2._id.toString(),
          senderName: i % 2 === 0 ? user1.fullName : user2.fullName,
          content: `Test message ${i}`,
          messageType: 'text'
        });
      }
    });

    it('should return messages for group chat', async () => {
      const response = await request(app)
        .get(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(10);
    });

    it('should order messages correctly (oldest first)', async () => {
      const response = await request(app)
        .get(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      
      for (let i = 1; i < response.body.length; i++) {
        const prev = new Date(response.body[i - 1].createdAt);
        const curr = new Date(response.body[i].createdAt);
        expect(curr >= prev).toBe(true);
      }
    });

    it('should handle pagination', async () => {
      const response = await request(app)
        .get(`/api/groupChats/${groupChat1._id}/messages`)
        .query({ page: 1, limit: 5 })
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(5);
    });

    it('should return 400 for invalid chat ID', async () => {
      const response = await request(app)
        .get('/api/groupChats/invalid-id/messages')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid chat ID');
    });

    it('should return 404 when chat not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/groupChats/${nonExistentId}/messages`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Group chat not found');
    });

    it('should return 403 when user not participant', async () => {
      const response = await request(app)
        .get(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user4._id.toString());

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to access this chat');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(GroupChatMessage, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockRejectedValue(new Error('DB Error'))
            })
          })
        })
      });

      const response = await request(app)
        .get(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to fetch messages');

      vi.restoreAllMocks();
    });
  });

  describe('POST /:chatId/messages - Send Message', () => {
    it('should send message successfully', async () => {
      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Hello group!' });

      expect(response.status).toBe(201);
      expect(response.body.content).toBe('Hello group!');
      expect(response.body.senderId).toBe(user1._id.toString());
      expect(response.body.senderName).toBe(user1.fullName);
    });

    it('should update lastMessage', async () => {
      await request(app)
        .post(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Latest message' });

      const updatedChat = await GroupChat.findById(groupChat1._id);
      expect(updatedChat.lastMessage).toBeDefined();
      expect(updatedChat.lastMessage.content).toBe('Latest message');
    });

    it('should increment unread count for other participants', async () => {
      await request(app)
        .post(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Test message' });

      const updatedChat = await GroupChat.findById(groupChat1._id);
      expect(updatedChat.unreadCount.get(user2._id.toString())).toBe(1);
      expect(updatedChat.unreadCount.get(user3._id.toString())).toBe(1);
      expect(updatedChat.unreadCount.get(user1._id.toString())).toBe(0);
    });

    it('should support different message types', async () => {
      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ 
          content: 'image.jpg',
          messageType: 'image'
        });

      expect(response.status).toBe(201);
      expect(response.body.messageType).toBe('image');
    });

    it('should return 400 when content is empty', async () => {
      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Message content is required');
    });

    it('should return 400 for invalid chat ID', async () => {
      const response = await request(app)
        .post('/api/groupChats/invalid-id/messages')
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid chat ID');
    });

    it('should return 404 when chat not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/groupChats/${nonExistentId}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Test' });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Group chat not found');
    });

    it('should return 403 when user not participant', async () => {
      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user4._id.toString())
        .send({ content: 'Test' });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to send message to this chat');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Test' });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(GroupChat, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Test' });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to send message');

      vi.restoreAllMocks();
    });
  });

  describe('POST /:chatId/participants - Add Participants', () => {
    it('should add participants successfully', async () => {
      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/participants`)
        .set('x-user-id', user1._id.toString())
        .send({ userIds: [user4._id.toString()] });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Added 1 participant');
      expect(response.body.addedParticipants).toHaveLength(1);
    });

    it('should create system message', async () => {
      await request(app)
        .post(`/api/groupChats/${groupChat1._id}/participants`)
        .set('x-user-id', user1._id.toString())
        .send({ userIds: [user4._id.toString()] });

      const messages = await GroupChatMessage.find({
        groupChatId: groupChat1._id,
        isSystemMessage: true,
        systemMessageType: 'users_added'
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('should add multiple participants', async () => {
      const newUser1 = await createTestUser({ email: 'new1@test.com' });
      const newUser2 = await createTestUser({ email: 'new2@test.com' });

      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/participants`)
        .set('x-user-id', user1._id.toString())
        .send({ userIds: [newUser1._id.toString(), newUser2._id.toString()] });

      expect(response.status).toBe(200);
      expect(response.body.addedParticipants).toHaveLength(2);
    });

    it('should return 403 when not admin', async () => {
      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/participants`)
        .set('x-user-id', user2._id.toString())
        .send({ userIds: [user4._id.toString()] });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Only admin can add participants');
    });

    it('should return 400 when user already participant', async () => {
      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/participants`)
        .set('x-user-id', user1._id.toString())
        .send({ userIds: [user2._id.toString()] });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('No new participants to add');
    });

    it('should return 400 when userIds is missing', async () => {
      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/participants`)
        .set('x-user-id', user1._id.toString())
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User IDs array is required');
    });

    it('should return 404 when chat not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/groupChats/${nonExistentId}/participants`)
        .set('x-user-id', user1._id.toString())
        .send({ userIds: [user4._id.toString()] });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Group chat not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/participants`)
        .set('x-user-id', user1._id.toString())
        .send({ userIds: [user4._id.toString()] });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(GroupChat, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/participants`)
        .set('x-user-id', user1._id.toString())
        .send({ userIds: [user4._id.toString()] });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to add participants');

      vi.restoreAllMocks();
    });
  });

  describe('DELETE /:chatId/participants/:userId - Remove Participant', () => {
    it('should remove participant successfully', async () => {
      const response = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/participants/${user2._id}`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Participant removed successfully');
      expect(response.body.removedParticipant).toBe(user2.fullName);
    });

    it('should create system message', async () => {
      await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/participants/${user2._id}`)
        .set('x-user-id', user1._id.toString());

      const messages = await GroupChatMessage.find({
        groupChatId: groupChat1._id,
        isSystemMessage: true,
        systemMessageType: 'user_removed'
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('should remove from unreadCount map', async () => {
      await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/participants/${user2._id}`)
        .set('x-user-id', user1._id.toString());

      const updatedChat = await GroupChat.findById(groupChat1._id);
      expect(updatedChat.unreadCount.has(user2._id.toString())).toBe(false);
    });

    it('should return 403 when not admin', async () => {
      const response = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/participants/${user3._id}`)
        .set('x-user-id', user2._id.toString());

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Only admin can remove participants');
    });

    it('should return 400 when admin tries to remove themselves', async () => {
      const response = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/participants/${user1._id}`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Admin cannot remove themselves. Use leave group instead.');
    });

    it('should return 404 when participant not found', async () => {
      const response = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/participants/${user4._id}`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Participant not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/participants/${user2._id}`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(GroupChat, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/participants/${user2._id}`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to remove participant');

      vi.restoreAllMocks();
    });
  });

  describe('DELETE /:chatId/leave - Leave Group Chat', () => {
    it('should leave group chat successfully', async () => {
      const response = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/leave`)
        .set('x-user-id', user2._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Left group chat successfully');
    });

    it('should create system message', async () => {
      await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/leave`)
        .set('x-user-id', user2._id.toString());

      const messages = await GroupChatMessage.find({
        groupChatId: groupChat1._id,
        isSystemMessage: true,
        systemMessageType: 'user_left'
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('should transfer admin when admin leaves', async () => {
      const response = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/leave`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);

      const updatedChat = await GroupChat.findById(groupChat1._id);
      expect(updatedChat.adminId).not.toBe(user1._id.toString());
      expect([user2._id.toString(), user3._id.toString()]).toContain(updatedChat.adminId);
    });

    it('should create admin change message', async () => {
      await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/leave`)
        .set('x-user-id', user1._id.toString());

      const messages = await GroupChatMessage.find({
        groupChatId: groupChat1._id,
        isSystemMessage: true,
        systemMessageType: 'admin_changed'
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('should delete chat when last participant leaves', async () => {
      await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/participants/${user2._id}`)
        .set('x-user-id', user1._id.toString());

      await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/participants/${user3._id}`)
        .set('x-user-id', user1._id.toString());

      const response = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/leave`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Group was deleted');

      const deletedChat = await GroupChat.findById(groupChat1._id);
      expect(deletedChat).toBeNull();
    });

    it('should return 404 when user not participant', async () => {
      const response = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/leave`)
        .set('x-user-id', user4._id.toString());

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Not a participant in this chat');
    });

    it('should return 404 when chat not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/groupChats/${nonExistentId}/leave`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Group chat not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/leave`)
        .set('x-user-id', user2._id.toString());

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(GroupChat, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/leave`)
        .set('x-user-id', user2._id.toString());

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to leave group chat');

      vi.restoreAllMocks();
    });
  });

  describe('PUT /:chatId - Update Group Chat', () => {
    it('should update name successfully', async () => {
      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString())
        .send({ name: 'Updated Group Name' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Group chat updated successfully');
      expect(response.body.groupChat.name).toBe('Updated Group Name');
    });

    it('should update description', async () => {
      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString())
        .send({ description: 'New description' });

      expect(response.status).toBe(200);
      expect(response.body.groupChat.description).toBe('New description');
    });

    it('should update image', async () => {
      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString())
        .send({ image: 'data:image/png;base64,test' });

      expect(response.status).toBe(200);
      expect(response.body.groupChat.image).toBe('data:image/png;base64,test');
    });

    it('should update settings (admin only)', async () => {
      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString())
        .send({ 
          allowNameChange: false,
          allowMemberInvites: true
        });

      expect(response.status).toBe(200);
      expect(response.body.groupChat.settings.allowNameChange).toBe(false);
      expect(response.body.groupChat.settings.allowMemberInvites).toBe(true);
    });

    it('should create system message', async () => {
      await request(app)
        .put(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString())
        .send({ name: 'New Name' });

      const messages = await GroupChatMessage.find({
        groupChatId: groupChat1._id,
        isSystemMessage: true,
        systemMessageType: 'group_updated'
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('should return 400 when member tries to change settings only', async () => {
      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user2._id.toString())
        .send({ allowNameChange: false });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('No changes provided');
      
      const chat = await GroupChat.findById(groupChat1._id);
      expect(chat.settings.allowNameChange).toBe(true);
    });

    it('should return 400 when no changes provided', async () => {
      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString())
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('No changes provided');
    });

    it('should return 404 when chat not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .put(`/api/groupChats/${nonExistentId}`)
        .set('x-user-id', user1._id.toString())
        .send({ name: 'New Name' });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Group chat not found');
    });

    it('should return 403 when user not participant', async () => {
      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user4._id.toString())
        .send({ name: 'New Name' });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to modify this chat');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString())
        .send({ name: 'New Name' });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(GroupChat, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString())
        .send({ name: 'New Name' });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to update group chat');

      vi.restoreAllMocks();
    });
  });

  describe('PUT /:chatId/read - Mark as Read', () => {
    beforeEach(async () => {
      await GroupChatMessage.create({
        groupChatId: groupChat1._id.toString(),
        senderId: user2._id.toString(),
        senderName: user2.fullName,
        content: 'Unread message 1'
      });

      await GroupChatMessage.create({
        groupChatId: groupChat1._id.toString(),
        senderId: user3._id.toString(),
        senderName: user3.fullName,
        content: 'Unread message 2'
      });

      groupChat1.unreadCount.set(user1._id.toString(), 2);
      await groupChat1.save();
    });

    it('should mark messages as read', async () => {
      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}/read`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Messages marked as read');

      const messages = await GroupChatMessage.find({
        groupChatId: groupChat1._id,
        'readBy.userId': user1._id.toString()
      });
      expect(messages.length).toBe(2);
    });

    it('should reset unread count', async () => {
      await request(app)
        .put(`/api/groupChats/${groupChat1._id}/read`)
        .set('x-user-id', user1._id.toString());

      const updatedChat = await GroupChat.findById(groupChat1._id);
      expect(updatedChat.unreadCount.get(user1._id.toString())).toBe(0);
    });

    it('should return 400 for invalid chat ID', async () => {
      const response = await request(app)
        .put('/api/groupChats/invalid-id/read')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid chat ID');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}/read`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(GroupChat, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}/read`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to mark as read');

      vi.restoreAllMocks();
    });
  });

  describe('Integration & Edge Cases', () => {
    it('should handle complete flow: create, send, read', async () => {
      const createResponse = await request(app)
        .post('/api/groupChats')
        .send({
          name: 'Flow Test',
          participants: [user2._id.toString()],
          creatorId: user1._id.toString()
        });

      expect(createResponse.status).toBe(201);
      const chatId = createResponse.body._id;

      const sendResponse = await request(app)
        .post(`/api/groupChats/${chatId}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Hello!' });

      expect(sendResponse.status).toBe(201);

      let chat = await GroupChat.findById(chatId);
      expect(chat.unreadCount.get(user2._id.toString())).toBe(1);

      await request(app)
        .put(`/api/groupChats/${chatId}/read`)
        .set('x-user-id', user2._id.toString());

      chat = await GroupChat.findById(chatId);
      expect(chat.unreadCount.get(user2._id.toString())).toBe(0);
    });

    it('should handle adding and removing participants', async () => {
      const addResponse = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/participants`)
        .set('x-user-id', user1._id.toString())
        .send({ userIds: [user4._id.toString()] });

      expect(addResponse.status).toBe(200);

      let chat = await GroupChat.findById(groupChat1._id);
      expect(chat.participants).toHaveLength(4);

      const removeResponse = await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/participants/${user4._id}`)
        .set('x-user-id', user1._id.toString());

      expect(removeResponse.status).toBe(200);

      chat = await GroupChat.findById(groupChat1._id);
      expect(chat.participants).toHaveLength(3);
    });

    it('should handle concurrent message sending', async () => {
      const promises = [1, 2, 3].map(i =>
        request(app)
          .post(`/api/groupChats/${groupChat1._id}/messages`)
          .set('x-user-id', user1._id.toString())
          .send({ content: `Concurrent message ${i}` })
      );

      const responses = await Promise.all(promises);
      responses.forEach(res => {
        expect(res.status).toBe(201);
      });

      const messages = await GroupChatMessage.find({ 
        groupChatId: groupChat1._id 
      });
      expect(messages.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle admin transfer on leave', async () => {
      const oldAdminId = groupChat1.adminId;

      await request(app)
        .delete(`/api/groupChats/${groupChat1._id}/leave`)
        .set('x-user-id', oldAdminId);

      const updatedChat = await GroupChat.findById(groupChat1._id);
      expect(updatedChat.adminId).not.toBe(oldAdminId);
    });

    it('should handle large group chat', async () => {
      const participants = [];
      for (let i = 0; i < 20; i++) {
        const user = await createTestUser({
          email: `user${i}@test.com`
        });
        participants.push(user._id.toString());
      }

      const response = await request(app)
        .post('/api/groupChats')
        .send({
          name: 'Large Group',
          participants,
          creatorId: user1._id.toString()
        });

      expect(response.status).toBe(201);
      expect(response.body.participants.length).toBeGreaterThanOrEqual(20);
    });

    it('should handle special characters in name', async () => {
      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString())
        .send({ name: ' Test Group  <script>alert("xss")</script>' });

      expect(response.status).toBe(200);
      expect(response.body.groupChat.name).toBe(' Test Group  <script>alert("xss")</script>');
    });

    it('should handle very long messages', async () => {
      const longMessage = 'a'.repeat(5000);

      const response = await request(app)
        .post(`/api/groupChats/${groupChat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: longMessage });

      expect(response.status).toBe(201);
      expect(response.body.content).toBe(longMessage);
    });

    it('should maintain unread counts per user', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post(`/api/groupChats/${groupChat1._id}/messages`)
          .set('x-user-id', user1._id.toString())
          .send({ content: `Message ${i}` });
      }

      const chat = await GroupChat.findById(groupChat1._id);
      expect(chat.unreadCount.get(user2._id.toString())).toBe(3);
      expect(chat.unreadCount.get(user3._id.toString())).toBe(3);
      expect(chat.unreadCount.get(user1._id.toString())).toBe(0);
    });

    it('should handle update with multiple fields', async () => {
      const response = await request(app)
        .put(`/api/groupChats/${groupChat1._id}`)
        .set('x-user-id', user1._id.toString())
        .send({
          name: 'Multi Update',
          description: 'New desc',
          allowNameChange: false
        });

      expect(response.status).toBe(200);
      expect(response.body.groupChat.name).toBe('Multi Update');
      expect(response.body.groupChat.description).toBe('New desc');
    });

    it('should handle pagination across multiple pages', async () => {
      for (let i = 0; i < 25; i++) {
        await GroupChatMessage.create({
          groupChatId: groupChat1._id.toString(),
          senderId: user1._id.toString(),
          senderName: user1.fullName,
          content: `Message ${i}`
        });
      }

      const page1 = await request(app)
        .get(`/api/groupChats/${groupChat1._id}/messages`)
        .query({ page: 1, limit: 10 })
        .set('x-user-id', user1._id.toString());

      expect(page1.body).toHaveLength(10);

      const page2 = await request(app)
        .get(`/api/groupChats/${groupChat1._id}/messages`)
        .query({ page: 2, limit: 10 })
        .set('x-user-id', user1._id.toString());

      expect(page2.body).toHaveLength(10);
    });
  });
});

export { createTestUser, createTestGroupChat };