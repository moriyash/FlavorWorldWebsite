import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import express from 'express';
import { app } from '../../src/app.js';
import PrivateChat from '../../src/models/PrivateChat.js';
import Message from '../../src/models/Message.js';
import User from '../../src/models/User.js';
import * as database from '../../src/config/database.js';
import chatsRouter from '../../src/routes/chats.js';

const testApp = express();
testApp.use(express.json());
testApp.use('/api/chats', chatsRouter);

describe('Chats Routes - Unit Tests', () => {
  let user1, user2, user3;
  let chat1;

  const createTestUser = async (name, email) => {
    return await User.create({
      fullName: name,
      email: email,
      password: 'Test1234!',
      bio: `Bio for ${name}`,
      avatar: `avatar-${email}.jpg`
    });
  };

  const createTestChat = async (userId1, userId2, user1Data, user2Data) => {
    return await PrivateChat.create({
      participants: [
        {
          userId: userId1,
          userName: user1Data.fullName,
          userAvatar: user1Data.avatar
        },
        {
          userId: userId2,
          userName: user2Data.fullName,
          userAvatar: user2Data.avatar
        }
      ],
      unreadCount: new Map([
        [userId1, 0],
        [userId2, 0]
      ])
    });
  };

  beforeEach(async () => {
    user1 = await createTestUser('Alice Johnson', 'alice@test.com');
    user2 = await createTestUser('Bob Smith', 'bob@test.com');
    user3 = await createTestUser('Charlie Brown', 'charlie@test.com');

    chat1 = await createTestChat(
      user1._id.toString(),
      user2._id.toString(),
      user1,
      user2
    );
  });

  describe('POST /private - Create/Get Private Chat', () => {
    it('should create a new private chat between two users', async () => {
      const response = await request(app)
        .post('/api/chats/private')
        .set('x-user-id', user1._id.toString())
        .send({ otherUserId: user3._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('_id');
      expect(response.body.participants).toHaveLength(2);
      expect(response.body.participants[0].userId).toBe(user1._id.toString());
      expect(response.body.participants[1].userId).toBe(user3._id.toString());
      
      expect(response.body.unreadCount).toBeDefined();
    });

    it('should return existing chat if already exists', async () => {
      const response = await request(app)
        .post('/api/chats/private')
        .set('x-user-id', user1._id.toString())
        .send({ otherUserId: user2._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body._id.toString()).toBe(chat1._id.toString());
      
      const chatsCount = await PrivateChat.countDocuments({
        'participants.userId': { $all: [user1._id.toString(), user2._id.toString()] }
      });
      expect(chatsCount).toBe(1);
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .post('/api/chats/private')
        .set('x-user-id', user1._id.toString())
        .send({ otherUserId: user2._id.toString() });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 400 when otherUserId is missing', async () => {
      const response = await request(app)
        .post('/api/chats/private')
        .set('x-user-id', user1._id.toString())
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Other user ID is required');
    });

    it('should return 400 when trying to chat with yourself', async () => {
      const response = await request(app)
        .post('/api/chats/private')
        .set('x-user-id', user1._id.toString())
        .send({ otherUserId: user1._id.toString() });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Cannot chat with yourself');
    });

    it('should return 404 when other user not found', async () => {
      const nonExistentUserId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .post('/api/chats/private')
        .set('x-user-id', user1._id.toString())
        .send({ otherUserId: nonExistentUserId });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Other user not found');
    });

    it('should require user authentication', async () => {
        const response = await request(app)
            .post('/api/chats/private')
            .send({ otherUserId: user2._id.toString() });

        expect(response.status).toBe(500);
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(PrivateChat, 'findOne').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .post('/api/chats/private')
        .set('x-user-id', user1._id.toString())
        .send({ otherUserId: user2._id.toString() });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to create/get private chat');

      vi.restoreAllMocks();
    });
  });

  describe('GET /my - Get My Chats', () => {
    let chat2;

    beforeEach(async () => {
      chat2 = await createTestChat(
        user1._id.toString(),
        user3._id.toString(),
        user1,
        user3
      );

      chat1.unreadCount.set(user1._id.toString(), 3);
      chat2.unreadCount.set(user1._id.toString(), 5);
      await chat1.save();
      await chat2.save();
    });

    it('should return all chats for current user', async () => {
      const response = await request(app)
        .get('/api/chats/my')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('otherUser');
    });

    it('should calculate unread count correctly', async () => {
      const response = await request(app)
        .get('/api/chats/my')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      
      const chat1Response = response.body.find(
        c => c._id.toString() === chat1._id.toString()
      );
      expect(chat1Response.unreadCount).toBe(3);
    });

    it('should enrich chats with otherUser data', async () => {
      const response = await request(app)
        .get('/api/chats/my')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body[0].otherUser).toBeDefined();
      expect(response.body[0].otherUser.userId).not.toBe(user1._id.toString());
    });

    it('should sort chats by updatedAt descending', async () => {
      chat2.updatedAt = new Date(Date.now() + 10000);
      await chat2.save();

      const response = await request(app)
        .get('/api/chats/my')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body[0]._id.toString()).toBe(chat2._id.toString());
    });

    it('should return empty array when user has no chats', async () => {
      const newUser = await createTestUser('New User', 'newuser@test.com');

      const response = await request(app)
        .get('/api/chats/my')
        .set('x-user-id', newUser._id.toString());

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get('/api/chats/my')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });
  });

  describe('GET /:chatId/messages - Get Chat Messages', () => {
    let messages;

    beforeEach(async () => {
      messages = [];
      for (let i = 0; i < 10; i++) {
        const message = await Message.create({
          chatId: chat1._id.toString(),
          senderId: i % 2 === 0 ? user1._id.toString() : user2._id.toString(),
          senderName: i % 2 === 0 ? user1.fullName : user2.fullName,
          content: `Test message ${i}`,
          readBy: [{ userId: i % 2 === 0 ? user1._id.toString() : user2._id.toString() }]
        });
        messages.push(message);
      }
    });

    it('should return messages for a chat', async () => {
      const response = await request(app)
        .get(`/api/chats/${chat1._id}/messages`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(10);
    });

    it('should return messages in correct order (oldest first)', async () => {
      const response = await request(app)
        .get(`/api/chats/${chat1._id}/messages`);

      expect(response.status).toBe(200);
      
      for (let i = 1; i < response.body.length; i++) {
        const prev = new Date(response.body[i - 1].createdAt);
        const curr = new Date(response.body[i].createdAt);
        expect(curr >= prev).toBe(true);
      }
    });

    it('should paginate messages correctly', async () => {
      const response = await request(app)
        .get(`/api/chats/${chat1._id}/messages`)
        .query({ page: 1, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(5);
    });

    it('should handle page 2 pagination', async () => {
      const response = await request(app)
        .get(`/api/chats/${chat1._id}/messages`)
        .query({ page: 2, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(5);
    });

    it('should use default pagination values', async () => {
      const response = await request(app)
        .get(`/api/chats/${chat1._id}/messages`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(10);
    });

    it('should return 400 for invalid chatId', async () => {
      const response = await request(app)
        .get('/api/chats/invalid-id/messages');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid chat ID');
    });

    it('should return empty array when no messages exist', async () => {
      const newChat = await createTestChat(
        user2._id.toString(),
        user3._id.toString(),
        user2,
        user3
      );

      const response = await request(app)
        .get(`/api/chats/${newChat._id}/messages`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(0);
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get(`/api/chats/${chat1._id}/messages`);

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Message, 'find').mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockRejectedValue(new Error('DB Error'))
            })
          })
        })
      });

      const response = await request(app)
        .get(`/api/chats/${chat1._id}/messages`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to fetch messages');

      vi.restoreAllMocks();
    });
  });

  describe('POST /:chatId/messages - Send Message', () => {
    it('should send a message successfully', async () => {
      const response = await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Hello Bob!' });

      expect(response.status).toBe(201);
      expect(response.body.content).toBe('Hello Bob!');
      expect(response.body.senderId).toBe(user1._id.toString());
      expect(response.body.senderName).toBe(user1.fullName);
      expect(response.body.readBy).toHaveLength(1);
      expect(response.body.readBy[0].userId).toBe(user1._id.toString());
    });

    it('should update chat lastMessage', async () => {
      await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Latest message' });

      const updatedChat = await PrivateChat.findById(chat1._id);
      expect(updatedChat.lastMessage).toBeDefined();
      expect(updatedChat.lastMessage.content).toBe('Latest message');
      expect(updatedChat.lastMessage.senderId).toBe(user1._id.toString());
    });

    it('should increment unread count for other participant', async () => {
      await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Test message' });

      const updatedChat = await PrivateChat.findById(chat1._id);
      const user2UnreadCount = updatedChat.unreadCount.get(user2._id.toString());
      expect(user2UnreadCount).toBe(1);
    });

    it('should not increment unread count for sender', async () => {
      const initialUnreadCount = chat1.unreadCount.get(user1._id.toString()) || 0;

      await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Test message' });

      const updatedChat = await PrivateChat.findById(chat1._id);
      const user1UnreadCount = updatedChat.unreadCount.get(user1._id.toString());
      expect(user1UnreadCount).toBe(initialUnreadCount);
    });

    it('should trim message content', async () => {
      const response = await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: '  Hello with spaces  ' });

      expect(response.status).toBe(201);
      expect(response.body.content).toBe('Hello with spaces');
    });

    it('should support different message types', async () => {
      const response = await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'image.jpg', messageType: 'image' });

      expect(response.status).toBe(201);
      expect(response.body.messageType).toBe('image');
    });

    it('should return 400 when content is missing', async () => {
      const response = await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Message content is required');
    });

    it('should return 400 when content is empty string', async () => {
      const response = await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Message content is required');
    });

    it('should return 400 for invalid chatId', async () => {
      const response = await request(app)
        .post('/api/chats/invalid-id/messages')
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Test message' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid chat ID');
    });

    it('should return 404 when chat not found', async () => {
      const nonExistentChatId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .post(`/api/chats/${nonExistentChatId}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Test message' });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Chat not found');
    });

    it('should return 403 when user is not a participant', async () => {
      const response = await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user3._id.toString())
        .send({ content: 'Test message' });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to send message to this chat');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Test message' });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(PrivateChat, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Test message' });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to send message');

      vi.restoreAllMocks();
    });
  });

  describe('PUT /:chatId/read - Mark as Read', () => {
    beforeEach(async () => {
      await Message.create({
        chatId: chat1._id.toString(),
        senderId: user2._id.toString(),
        senderName: user2.fullName,
        content: 'Unread message 1',
        readBy: [{ userId: user2._id.toString() }]
      });

      await Message.create({
        chatId: chat1._id.toString(),
        senderId: user2._id.toString(),
        senderName: user2.fullName,
        content: 'Unread message 2',
        readBy: [{ userId: user2._id.toString() }]
      });

      chat1.unreadCount.set(user1._id.toString(), 2);
      await chat1.save();
    });

    it('should mark messages as read', async () => {
      const response = await request(app)
        .put(`/api/chats/${chat1._id}/read`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Messages marked as read');

      const messages = await Message.find({
        chatId: chat1._id.toString(),
        'readBy.userId': user1._id.toString()
      });
      expect(messages.length).toBe(2);
    });

    it('should reset unread count to zero', async () => {
      await request(app)
        .put(`/api/chats/${chat1._id}/read`)
        .set('x-user-id', user1._id.toString());

      const updatedChat = await PrivateChat.findById(chat1._id);
      const unreadCount = updatedChat.unreadCount.get(user1._id.toString());
      expect(unreadCount).toBe(0);
    });

    it('should not mark sender messages as read', async () => {
      await Message.create({
        chatId: chat1._id.toString(),
        senderId: user1._id.toString(),
        senderName: user1.fullName,
        content: 'My own message',
        readBy: [{ userId: user1._id.toString() }]
      });

      const response = await request(app)
        .put(`/api/chats/${chat1._id}/read`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);

      const updatedMessages = await Message.find({
        chatId: chat1._id.toString(),
        senderId: user1._id.toString()
      });
      
      expect(updatedMessages[0].readBy).toHaveLength(1);
    });

    it('should not add duplicate readBy entries', async () => {
      await request(app)
        .put(`/api/chats/${chat1._id}/read`)
        .set('x-user-id', user1._id.toString());

      await request(app)
        .put(`/api/chats/${chat1._id}/read`)
        .set('x-user-id', user1._id.toString());

      const messages = await Message.find({
        chatId: chat1._id.toString(),
        senderId: user2._id.toString()
      });

      messages.forEach(msg => {
        const user1ReadEntries = msg.readBy.filter(
          r => r.userId === user1._id.toString()
        );
        expect(user1ReadEntries.length).toBeLessThanOrEqual(1);
      });
    });

    it('should return 400 for invalid chatId', async () => {
      const response = await request(app)
        .put('/api/chats/invalid-id/read')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid chat ID');
    });

    it('should handle non-existent chat gracefully', async () => {
      const nonExistentChatId = new mongoose.Types.ObjectId().toString();

      const response = await request(app)
        .put(`/api/chats/${nonExistentChatId}/read`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Messages marked as read');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .put(`/api/chats/${chat1._id}/read`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(PrivateChat, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .put(`/api/chats/${chat1._id}/read`)
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to mark as read');

      vi.restoreAllMocks();
    });
  });

  describe('GET /unread-count - Get Unread Count', () => {
    let chat2;

    beforeEach(async () => {
      chat2 = await createTestChat(
        user1._id.toString(),
        user3._id.toString(),
        user1,
        user3
      );

      chat1.unreadCount.set(user1._id.toString(), 5);
      chat2.unreadCount.set(user1._id.toString(), 3);
      await chat1.save();
      await chat2.save();
    });

    it('should return total unread count across all chats', async () => {
      const response = await request(app)
        .get('/api/chats/unread-count')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(8); 
    });

    it('should return 0 when user has no unread messages', async () => {
      const newUser = await createTestUser('New User', 'newuser@test.com');

      const response = await request(app)
        .get('/api/chats/unread-count')
        .set('x-user-id', newUser._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(0);
    });

    it('should handle chats with undefined unread count', async () => {
      const chat3 = await PrivateChat.create({
        participants: [
          { userId: user1._id.toString(), userName: user1.fullName },
          { userId: user2._id.toString(), userName: user2.fullName }
        ]
      });

      const response = await request(app)
        .get('/api/chats/unread-count')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.count).toBeGreaterThanOrEqual(8);
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get('/api/chats/unread-count')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 0 on database error', async () => {
      vi.spyOn(PrivateChat, 'find').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get('/api/chats/unread-count')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(500);
      expect(response.body.count).toBe(0);

      vi.restoreAllMocks();
    });

    it('should work with temp-user-id header', async () => {
      const response = await request(app)
        .get('/api/chats/unread-count');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('count');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete chat flow: create, send, read', async () => {
      const createResponse = await request(app)
        .post('/api/chats/private')
        .set('x-user-id', user1._id.toString())
        .send({ otherUserId: user3._id.toString() });

      expect(createResponse.status).toBe(200);
      const chatId = createResponse.body._id;

      const sendResponse = await request(app)
        .post(`/api/chats/${chatId}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: 'Hello!' });

      expect(sendResponse.status).toBe(201);

      let chat = await PrivateChat.findById(chatId);
      expect(chat.unreadCount.get(user3._id.toString())).toBe(1);

      const readResponse = await request(app)
        .put(`/api/chats/${chatId}/read`)
        .set('x-user-id', user3._id.toString());

      expect(readResponse.status).toBe(200);

      chat = await PrivateChat.findById(chatId);
      expect(chat.unreadCount.get(user3._id.toString())).toBe(0);
    });

    it('should handle multiple messages between users', async () => {
      for (let i = 0; i < 5; i++) {
        const sender = i % 2 === 0 ? user1 : user2;
        await request(app)
          .post(`/api/chats/${chat1._id}/messages`)
          .set('x-user-id', sender._id.toString())
          .send({ content: `Message ${i}` });
      }

      const response = await request(app)
        .get(`/api/chats/${chat1._id}/messages`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(5);
    });

    it('should maintain separate unread counts per user', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post(`/api/chats/${chat1._id}/messages`)
          .set('x-user-id', user1._id.toString())
          .send({ content: `Message ${i}` });
      }

      const chat = await PrivateChat.findById(chat1._id);
      expect(chat.unreadCount.get(user2._id.toString())).toBe(3);
      expect(chat.unreadCount.get(user1._id.toString())).toBe(0);
    });

    it('should update lastMessage with each new message', async () => {
      const messages = ['First', 'Second', 'Third'];

      for (const content of messages) {
        await request(app)
          .post(`/api/chats/${chat1._id}/messages`)
          .set('x-user-id', user1._id.toString())
          .send({ content });

        const chat = await PrivateChat.findById(chat1._id);
        expect(chat.lastMessage.content).toBe(content);
      }
    });

    it('should handle concurrent message sending', async () => {
      const promises = [1, 2, 3].map(i =>
        request(app)
          .post(`/api/chats/${chat1._id}/messages`)
          .set('x-user-id', user1._id.toString())
          .send({ content: `Concurrent message ${i}` })
      );

      const responses = await Promise.all(promises);
      responses.forEach(res => {
        expect(res.status).toBe(201);
      });

      const messages = await Message.find({ chatId: chat1._id.toString() });
      expect(messages.length).toBeGreaterThanOrEqual(3);
    });

    it('should handle pagination across multiple pages', async () => {
      for (let i = 0; i < 25; i++) {
        await Message.create({
          chatId: chat1._id.toString(),
          senderId: user1._id.toString(),
          senderName: user1.fullName,
          content: `Message ${i}`
        });
      }

      const page1 = await request(app)
        .get(`/api/chats/${chat1._id}/messages`)
        .query({ page: 1, limit: 10 });

      expect(page1.body).toHaveLength(10);

      const page2 = await request(app)
        .get(`/api/chats/${chat1._id}/messages`)
        .query({ page: 2, limit: 10 });

      expect(page2.body).toHaveLength(10);

      const page3 = await request(app)
        .get(`/api/chats/${chat1._id}/messages`)
        .query({ page: 3, limit: 10 });

      expect(page3.body).toHaveLength(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long message content', async () => {
      const longContent = 'a'.repeat(10000);

      const response = await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: longContent });

      expect(response.status).toBe(201);
      expect(response.body.content).toBe(longContent);
    });

    it('should handle special characters in message content', async () => {
      const specialContent = ' Hello! @user #test $100 50% <script>alert("xss")</script>';

      const response = await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: specialContent });

      expect(response.status).toBe(201);
      expect(response.body.content).toBe(specialContent);
    });

    it('should handle null/undefined values gracefully', async () => {
      const response = await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: null });

      expect(response.status).toBe(400);
    });

    it('should fail when x-user-id header is missing', async () => {
        const response = await request(app)
            .post('/api/chats/private')
            .send({ otherUserId: user2._id.toString() });

        expect(response.status).toBe(500);
    });

    it('should handle chat with deleted user', async () => {
      await User.findByIdAndDelete(user2._id);

      const response = await request(app)
        .get('/api/chats/my')
        .set('x-user-id', user1._id.toString());

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should handle simultaneous read operations', async () => {
      chat1.unreadCount.set(user1._id.toString(), 5);
      await chat1.save();

      const promises = [1, 2].map(() =>
        request(app)
          .put(`/api/chats/${chat1._id}/read`)
          .set('x-user-id', user1._id.toString())
      );

      const responses = await Promise.all(promises);
      responses.forEach(res => {
        expect(res.status).toBe(200);
      });

      const chat = await PrivateChat.findById(chat1._id);
      expect(chat.unreadCount.get(user1._id.toString())).toBe(0);
    });

    it('should handle empty message after trim', async () => {
      const response = await request(app)
        .post(`/api/chats/${chat1._id}/messages`)
        .set('x-user-id', user1._id.toString())
        .send({ content: '     \n\t\r     ' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Message content is required');
    });

    it('should handle malformed ObjectId gracefully', async () => {
      const response = await request(app)
        .get('/api/chats/not-a-valid-objectid/messages');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid chat ID');
    });

    it('should handle zero page number', async () => {
      const response = await request(app)
        .get(`/api/chats/${chat1._id}/messages`)
        .query({ page: 0, limit: 10 });

      expect(response.status).toBe(200);
    });

    it('should handle negative limit', async () => {
      const response = await request(app)
        .get(`/api/chats/${chat1._id}/messages`)
        .query({ page: 1, limit: -10 });

      expect(response.status).toBe(200);
    });
  });

  describe('Performance Considerations', () => {
    it('should handle chat with many messages efficiently', async () => {
      const messagePromises = [];
      for (let i = 0; i < 100; i++) {
        messagePromises.push(
          Message.create({
            chatId: chat1._id.toString(),
            senderId: i % 2 === 0 ? user1._id.toString() : user2._id.toString(),
            senderName: i % 2 === 0 ? user1.fullName : user2.fullName,
            content: `Message ${i}`
          })
        );
      }
      await Promise.all(messagePromises);

      const startTime = Date.now();
      const response = await request(app)
        .get(`/api/chats/${chat1._id}/messages`)
        .query({ page: 1, limit: 50 });
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(50);
      expect(endTime - startTime).toBeLessThan(1000); 
    });

    it('should handle user with many chats', async () => {
      const chatPromises = [];
      for (let i = 0; i < 20; i++) {
        const tempUser = await User.create({
          fullName: `User ${i}`,
          email: `user${i}@test.com`,
          password: 'Test1234!'
        });

        chatPromises.push(
          createTestChat(
            user1._id.toString(),
            tempUser._id.toString(),
            user1,
            tempUser
          )
        );
      }
      await Promise.all(chatPromises);

      const startTime = Date.now();
      const response = await request(app)
        .get('/api/chats/my')
        .set('x-user-id', user1._id.toString());
      const endTime = Date.now();

      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThanOrEqual(20);
      expect(endTime - startTime).toBeLessThan(2000); 
    });
  });
});

export { createTestUser, createTestChat };