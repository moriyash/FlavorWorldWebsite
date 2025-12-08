import User from '../../src/models/User.js';
import PrivateChat from '../../src/models/PrivateChat.js';
import Message from '../../src/models/Message.js';
import Group from '../../src/models/Group.js';
import GroupPost from '../../src/models/GroupPost.js';
import mongoose from 'mongoose';


export const createTestUser = async (overrides = {}) => {
  const defaults = {
    fullName: 'Test User',
    email: `test${Date.now()}@example.com`,
    password: 'Test1234!',
    bio: 'Test bio',
    avatar: null,
    followers: [],
    following: []
  };

  return await User.create({ ...defaults, ...overrides });
};

 
export const createTestUsers = async (count = 3) => {
  const users = [];
  for (let i = 0; i < count; i++) {
    const user = await createTestUser({
      fullName: `Test User ${i + 1}`,
      email: `testuser${i + 1}-${Date.now()}@example.com`
    });
    users.push(user);
  }
  return users;
};

 
export const createPrivateChat = async (user1, user2, overrides = {}) => {
  const defaults = {
    participants: [
      {
        userId: user1._id.toString(),
        userName: user1.fullName,
        userAvatar: user1.avatar
      },
      {
        userId: user2._id.toString(),
        userName: user2.fullName,
        userAvatar: user2.avatar
      }
    ],
    unreadCount: new Map([
      [user1._id.toString(), 0],
      [user2._id.toString(), 0]
    ])
  };

  return await PrivateChat.create({ ...defaults, ...overrides });
};


export const createMessage = async (chatId, sender, content, overrides = {}) => {
  const defaults = {
    chatId: chatId.toString(),
    senderId: sender._id.toString(),
    senderName: sender.fullName,
    content,
    messageType: 'text',
    readBy: [{ userId: sender._id.toString() }]
  };

  return await Message.create({ ...defaults, ...overrides });
};


export const createMessages = async (chatId, sender, count = 10) => {
  const messages = [];
  for (let i = 0; i < count; i++) {
    const message = await createMessage(
      chatId,
      sender,
      `Test message ${i + 1}`
    );
    messages.push(message);
  }
  return messages;
};


export const createTestGroup = async (creator, overrides = {}) => {
  const defaults = {
    name: `Test Group ${Date.now()}`,
    description: 'Test group description',
    creatorId: creator._id.toString(),
    isPrivate: false,
    category: 'General',
    members: [{
      userId: creator._id.toString(),
      role: 'admin',
      joinedAt: new Date()
    }],
    settings: {
      allowMemberPosts: true,
      requireApproval: false,
      allowInvites: true
    }
  };

  return await Group.create({ ...defaults, ...overrides });
};


export const createGroupPost = async (group, user, overrides = {}) => {
  const defaults = {
    title: `Test Post ${Date.now()}`,
    description: 'Test post description',
    ingredients: 'Test ingredients',
    instructions: 'Test instructions',
    category: 'General',
    meatType: 'Mixed',
    prepTime: 30,
    servings: 4,
    userId: user._id.toString(),
    groupId: group._id.toString(),
    isApproved: true,
    likes: [],
    comments: []
  };

  return await GroupPost.create({ ...defaults, ...overrides });
};


export const generateObjectId = () => {
  return new mongoose.Types.ObjectId();
};


export const generateInvalidObjectId = () => {
  return 'invalid-object-id-123';
};


export const wait = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};


export const cleanDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};


export const createMockRequest = (overrides = {}) => {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides
  };
};


export const createMockResponse = () => {
  const res = {
    statusCode: 200,
    data: null,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(data) {
      this.data = data;
      return this;
    },
    send: function(data) {
      this.data = data;
      return this;
    }
  };
  return res;
};

export const assertSuccessResponse = (response, expectedStatus = 200) => {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toBeDefined();
};


export const assertErrorResponse = (response, expectedStatus, expectedMessage) => {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toHaveProperty('message');
  if (expectedMessage) {
    expect(response.body.message).toBe(expectedMessage);
  }
};


export const setupChatScenario = async () => {
  const [user1, user2, user3] = await createTestUsers(3);
  const chat = await createPrivateChat(user1, user2);
  const messages = await createMessages(chat._id, user1, 5);

  return { user1, user2, user3, chat, messages };
};


export const setupGroupScenario = async () => {
  const [creator, member1, member2] = await createTestUsers(3);
  const group = await createTestGroup(creator);
  
  group.members.push(
    { userId: member1._id.toString(), role: 'member', joinedAt: new Date() },
    { userId: member2._id.toString(), role: 'member', joinedAt: new Date() }
  );
  await group.save();

  const post = await createGroupPost(group, creator);

  return { creator, member1, member2, group, post };
};


export const assertPaginationResponse = (response, expectedLength, maxLength) => {
  expect(response.status).toBe(200);
  expect(Array.isArray(response.body)).toBe(true);
  expect(response.body.length).toBe(expectedLength);
  expect(response.body.length).toBeLessThanOrEqual(maxLength);
};


export const createBase64Image = () => {
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
};

export default {
  createTestUser,
  createTestUsers,
  createPrivateChat,
  createMessage,
  createMessages,
  createTestGroup,
  createGroupPost,
  generateObjectId,
  generateInvalidObjectId,
  wait,
  cleanDatabase,
  createMockRequest,
  createMockResponse,
  assertSuccessResponse,
  assertErrorResponse,
  setupChatScenario,
  setupGroupScenario,
  assertPaginationResponse,
  createBase64Image
};