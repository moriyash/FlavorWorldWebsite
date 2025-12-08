import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';

import feedRouter from '../../src/routes/feed.js';

import User from '../../src/models/User.js';
import Recipe from '../../src/models/Recipe.js';
import Group from '../../src/models/Group.js';
import GroupPost from '../../src/models/GroupPost.js';

import * as database from '../../src/config/database.js';

const app = express();
app.use(express.json());
app.use('/api/feed', feedRouter);

describe('Feed Routes - Unit Tests', () => {
  let user1, user2, user3;
  let group1, group2;
  let recipe1, recipe2, recipe3;
  let groupPost1, groupPost2;

  const createTestUser = async (overrides = {}) => {
    return await User.create({
      fullName: 'Test User',
      email: `test${Date.now()}@example.com`,
      password: 'Test1234!',
      followers: [],
      following: [],
      ...overrides
    });
  };

  const createTestRecipe = async (userId, overrides = {}) => {
    const user = await User.findById(userId);
    return await Recipe.create({
      title: 'Test Recipe',
      description: 'Test description',
      ingredients: 'Test ingredients',
      instructions: 'Test instructions',
      category: 'Italian',
      meatType: 'Chicken',
      prepTime: 30,
      servings: 4,
      userId: userId.toString(),
      userName: user.fullName,
      likes: [],
      comments: [],
      ...overrides
    });
  };

  const createTestGroup = async (creatorId, overrides = {}) => {
    return await Group.create({
      name: 'Test Group',
      description: 'Test description',
      creatorId: creatorId.toString(),
      isPrivate: false,
      category: 'General',
      members: [{
        userId: creatorId.toString(),
        role: 'admin',
        joinedAt: new Date()
      }],
      ...overrides
    });
  };

  const createTestGroupPost = async (groupId, userId, overrides = {}) => {
    const user = await User.findById(userId);
    return await GroupPost.create({
      title: 'Test Group Post',
      description: 'Test description',
      ingredients: 'Test ingredients',
      instructions: 'Test instructions',
      category: 'General',
      meatType: 'Mixed',
      prepTime: 30,
      servings: 4,
      userId: userId.toString(),
      groupId: groupId.toString(),
      isApproved: true,
      likes: [],
      comments: [],
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

    user1.following = [{ userId: user2._id.toString(), followedAt: new Date() }];
    user2.followers = [{ userId: user1._id.toString(), followedAt: new Date() }];
    await user1.save();
    await user2.save();

    group1 = await createTestGroup(user2._id, {
      name: 'Cooking Group',
      members: [
        { userId: user2._id.toString(), role: 'admin' },
        { userId: user1._id.toString(), role: 'member' }
      ]
    });

    group2 = await createTestGroup(user3._id, {
      name: 'Baking Group',
      members: [
        { userId: user3._id.toString(), role: 'admin' }
      ]
    });

    recipe1 = await createTestRecipe(user1._id, {
      title: 'Alice Recipe 1'
    });

    recipe2 = await createTestRecipe(user2._id, {
      title: 'Bob Recipe 1'
    });

    recipe3 = await createTestRecipe(user3._id, {
      title: 'Charlie Recipe 1'
    });

    groupPost1 = await createTestGroupPost(group1._id, user2._id, {
      title: 'Group Post 1',
      isApproved: true
    });

    groupPost2 = await createTestGroupPost(group1._id, user1._id, {
      title: 'Group Post 2',
      isApproved: true
    });
  });

  describe('GET / - Personalized Feed', () => {
    it('should return personalized feed with following and group posts', async () => {
      const response = await request(app)
        .get('/api/feed')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const bobPost = response.body.find(p => p.title === 'Bob Recipe 1');
      expect(bobPost).toBeDefined();

      const groupPost = response.body.find(p => p.title === 'Group Post 1');
      expect(groupPost).toBeDefined();
    });

    it('should return only following posts when type=following', async () => {
      const response = await request(app)
        .get('/api/feed')
        .query({ 
          userId: user1._id.toString(),
          type: 'following'
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      response.body.forEach(post => {
        expect(post).not.toHaveProperty('groupId');
      });
    });

    it('should return only group posts when type=groups', async () => {
      const response = await request(app)
        .get('/api/feed')
        .query({ 
          userId: user1._id.toString(),
          type: 'groups'
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      response.body.forEach(post => {
        expect(post.groupId).toBeDefined();
        expect(post.postSource).toBe('group');
      });
    });

    it('should include user own posts in feed', async () => {
      const response = await request(app)
        .get('/api/feed')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      
      const ownPost = response.body.find(p => p.title === 'Alice Recipe 1');
      expect(ownPost).toBeDefined();
    });

    it('should enrich posts with user data', async () => {
      const response = await request(app)
        .get('/api/feed')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      
      if (response.body.length > 0) {
        const post = response.body[0];
        expect(post.userName).toBeDefined();
      }
    });

    it('should enrich group posts with group name', async () => {
      const response = await request(app)
        .get('/api/feed')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      
      const groupPost = response.body.find(p => p.groupId);
      if (groupPost) {
        expect(groupPost.groupName).toBeDefined();
        expect(groupPost.postSource).toBe('group');
      }
    });

    it('should sort posts by date descending', async () => {
      const response = await request(app)
        .get('/api/feed')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      
      if (response.body.length > 1) {
        for (let i = 1; i < response.body.length; i++) {
          const prev = new Date(response.body[i - 1].createdAt);
          const curr = new Date(response.body[i].createdAt);
          expect(prev >= curr).toBe(true);
        }
      }
    });

    it('should handle pagination with page parameter', async () => {
      const response = await request(app)
        .get('/api/feed')
        .query({ 
          userId: user1._id.toString(),
          page: 1,
          limit: 2
        });

      expect(response.status).toBe(200);
      expect(response.body.length).toBeLessThanOrEqual(2);
    });

    it('should use default limit of 50', async () => {
      for (let i = 0; i < 60; i++) {
        await createTestRecipe(user2._id, {
          title: `Recipe ${i}`
        });
      }

      const response = await request(app)
        .get('/api/feed')
        .query({ 
          userId: user1._id.toString(),
          type: 'following'
        });

      expect(response.status).toBe(200);
      expect(response.body.length).toBeLessThanOrEqual(50);
    });

    it('should return empty array when user not following anyone and not in groups', async () => {
      const newUser = await createTestUser({
        email: 'newuser@test.com'
      });

      const response = await request(app)
        .get('/api/feed')
        .query({ userId: newUser._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should only show approved group posts', async () => {
      await createTestGroupPost(group1._id, user2._id, {
        title: 'Unapproved Post',
        isApproved: false
      });

      const response = await request(app)
        .get('/api/feed')
        .query({ 
          userId: user1._id.toString(),
          type: 'groups'
        });

      expect(response.status).toBe(200);
      
      const unapprovedPost = response.body.find(p => p.title === 'Unapproved Post');
      expect(unapprovedPost).toBeUndefined();
    });

    it('should not show posts from private groups user is not member of', async () => {
      const privateGroup = await createTestGroup(user3._id, {
        name: 'Private Group',
        isPrivate: true,
        members: [
          { userId: user3._id.toString(), role: 'admin' }
        ]
      });

      await createTestGroupPost(privateGroup._id, user3._id, {
        title: 'Private Group Post'
      });

      const response = await request(app)
        .get('/api/feed')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      
      const privatePost = response.body.find(p => p.title === 'Private Group Post');
      expect(privatePost).toBeUndefined();
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .get('/api/feed');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User ID is required');
    });

    it('should return 400 for invalid userId', async () => {
      const response = await request(app)
        .get('/api/feed')
        .query({ userId: 'invalid-id' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid user ID');
    });

    it('should return 404 when user not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get('/api/feed')
        .query({ userId: nonExistentId.toString() });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get('/api/feed')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get('/api/feed')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to fetch personalized feed');

      vi.restoreAllMocks();
    });
  });

  describe('GET /stats - Feed Statistics', () => {
    it('should return feed stats successfully', async () => {
      const response = await request(app)
        .get('/api/feed/stats')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('followingCount');
      expect(response.body).toHaveProperty('groupsCount');
      expect(response.body).toHaveProperty('followingPostsCount');
      expect(response.body).toHaveProperty('groupPostsCount');
      expect(response.body).toHaveProperty('ownPostsCount');
      expect(response.body).toHaveProperty('totalFeedPosts');
    });

    it('should calculate following count correctly', async () => {
      const response = await request(app)
        .get('/api/feed/stats')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.followingCount).toBe(1); 
    });

    it('should calculate groups count correctly', async () => {
      const response = await request(app)
        .get('/api/feed/stats')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.groupsCount).toBe(1); 
    });

    it('should calculate own posts count correctly', async () => {
      const response = await request(app)
        .get('/api/feed/stats')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.ownPostsCount).toBe(1); 
    });

    it('should calculate total feed posts correctly', async () => {
      const response = await request(app)
        .get('/api/feed/stats')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      
      const total = response.body.followingPostsCount + 
                    response.body.groupPostsCount + 
                    response.body.ownPostsCount;
      expect(response.body.totalFeedPosts).toBe(total);
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .get('/api/feed/stats');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Valid user ID is required');
    });

    it('should return 400 for invalid userId', async () => {
      const response = await request(app)
        .get('/api/feed/stats')
        .query({ userId: 'invalid-id' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Valid user ID is required');
    });

    it('should return 404 when user not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get('/api/feed/stats')
        .query({ userId: nonExistentId.toString() });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get('/api/feed/stats')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get('/api/feed/stats')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to get feed stats');

      vi.restoreAllMocks();
    });
  });

  describe('GET /my-posts - User Group Posts', () => {
    it('should return user group posts successfully', async () => {
      const response = await request(app)
        .get('/api/feed/my-posts')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      const ownGroupPost = response.body.find(p => p.title === 'Group Post 2');
      expect(ownGroupPost).toBeDefined();
    });

    it('should only return approved group posts', async () => {
      await createTestGroupPost(group1._id, user1._id, {
        title: 'Unapproved Group Post',
        isApproved: false
      });

      const response = await request(app)
        .get('/api/feed/my-posts')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      
      const unapproved = response.body.find(p => p.title === 'Unapproved Group Post');
      expect(unapproved).toBeUndefined();
    });

    it('should enrich posts with user and group data', async () => {
      const response = await request(app)
        .get('/api/feed/my-posts')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      
      if (response.body.length > 0) {
        const post = response.body[0];
        expect(post.userName).toBeDefined();
        expect(post.groupName).toBeDefined();
        expect(post.postSource).toBe('group');
      }
    });

    it('should return empty array when user not in any groups', async () => {
      const newUser = await createTestUser({
        email: 'nogroups@test.com'
      });

      const response = await request(app)
        .get('/api/feed/my-posts')
        .query({ userId: newUser._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should sort posts by date descending', async () => {
      await createTestGroupPost(group1._id, user1._id, {
        title: 'Newer Group Post'
      });

      const response = await request(app)
        .get('/api/feed/my-posts')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      
      if (response.body.length > 1) {
        for (let i = 1; i < response.body.length; i++) {
          const prev = new Date(response.body[i - 1].createdAt);
          const curr = new Date(response.body[i].createdAt);
          expect(prev >= curr).toBe(true);
        }
      }
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .get('/api/feed/my-posts');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User ID is required');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get('/api/feed/my-posts')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });
  });

  describe('GET /posts - Following Posts', () => {
    it('should return following posts successfully', async () => {
      const response = await request(app)
        .get('/api/feed/posts')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      
      const bobPost = response.body.find(p => p.title === 'Bob Recipe 1');
      expect(bobPost).toBeDefined();
      
      const ownPost = response.body.find(p => p.title === 'Alice Recipe 1');
      expect(ownPost).toBeDefined();
    });

    it('should enrich posts with user data', async () => {
      const response = await request(app)
        .get('/api/feed/posts')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      
      if (response.body.length > 0) {
        const post = response.body[0];
        expect(post.userName).toBeDefined();
        expect(post.postSource).toBe('personal');
      }
    });

    it('should return empty array when not following anyone', async () => {
      const lonelyUser = await createTestUser({
        email: 'lonely@test.com',
        following: []
      });

      const response = await request(app)
        .get('/api/feed/posts')
        .query({ userId: lonelyUser._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should sort posts by date descending', async () => {
      await createTestRecipe(user2._id, { title: 'Bob Recipe 2' });
      await createTestRecipe(user1._id, { title: 'Alice Recipe 2' });

      const response = await request(app)
        .get('/api/feed/posts')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(200);
      
      if (response.body.length > 1) {
        for (let i = 1; i < response.body.length; i++) {
          const prev = new Date(response.body[i - 1].createdAt);
          const curr = new Date(response.body[i].createdAt);
          expect(prev >= curr).toBe(true);
        }
      }
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .get('/api/feed/posts');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User ID is required');
    });

    it('should return 400 for invalid userId', async () => {
      const response = await request(app)
        .get('/api/feed/posts')
        .query({ userId: 'invalid-id' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid user ID');
    });

    it('should return 404 when user not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get('/api/feed/posts')
        .query({ userId: nonExistentId.toString() });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get('/api/feed/posts')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(User, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get('/api/feed/posts')
        .query({ userId: user1._id.toString() });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to fetch following posts');

      vi.restoreAllMocks();
    });
  });
});

export { createTestUser, createTestRecipe, createTestGroup, createTestGroupPost };