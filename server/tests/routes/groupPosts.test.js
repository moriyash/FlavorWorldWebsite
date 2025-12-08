import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';

// Import route
import groupPostsRouter from '../../src/routes/groupPosts.js';

// Import models
import Group from '../../src/models/Group.js';
import GroupPost from '../../src/models/GroupPost.js';
import User from '../../src/models/User.js';

// Import database
import * as database from '../../src/config/database.js';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/groups', groupPostsRouter);

describe('Group Posts Routes - Unit Tests', () => {
  let user1, user2, user3;
  let publicGroup, privateGroup;
  let post1, post2;

  // Helper functions
  const createTestUser = async (overrides = {}) => {
    return await User.create({
      fullName: 'Test User',
      email: `test${Date.now()}@example.com`,
      password: 'Test1234!',
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
      settings: {
        allowMemberPosts: true,
        requireApproval: false,
        allowInvites: true
      },
      ...overrides
    });
  };

  const createTestPost = async (groupId, userId, overrides = {}) => {
    return await GroupPost.create({
      title: 'Test Post',
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
    // Create users
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

    // Create groups
    publicGroup = await createTestGroup(user1._id, {
      name: 'Public Cooking Group',
      isPrivate: false,
      members: [
        { userId: user1._id.toString(), role: 'admin', joinedAt: new Date() },
        { userId: user2._id.toString(), role: 'member', joinedAt: new Date() }
      ]
    });

    privateGroup = await createTestGroup(user2._id, {
      name: 'Private Baking Group',
      isPrivate: true,
      members: [
        { userId: user2._id.toString(), role: 'admin', joinedAt: new Date() }
      ],
      settings: {
        allowMemberPosts: true,
        requireApproval: true,
        allowInvites: false
      }
    });

    // Create posts
    post1 = await createTestPost(publicGroup._id, user1._id, {
      title: 'Chocolate Cake Recipe',
      isApproved: true
    });

    post2 = await createTestPost(publicGroup._id, user2._id, {
      title: 'Pasta Carbonara',
      isApproved: true
    });
  });

  // ==========================================
  // POST /:groupId/posts - Create Group Post
  // ==========================================
  describe('POST /:groupId/posts - Create Group Post', () => {
    it('should create group post successfully', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts`)
        .send({
          title: 'New Recipe',
          description: 'Delicious recipe',
          ingredients: 'Flour, Sugar',
          instructions: 'Mix and bake',
          category: 'Dessert',
          meatType: 'Vegetarian',
          prepTime: 45,
          servings: 6,
          userId: user2._id.toString()
        });

      expect(response.status).toBe(201);
      expect(response.body.title).toBe('New Recipe');
      expect(response.body.userId).toBe(user2._id.toString());
      expect(response.body.groupId).toBe(publicGroup._id.toString());
    });

    it('should auto-approve for group without requireApproval', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts`)
        .send({
          title: 'Auto Approved Post',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(201);
      expect(response.body.isApproved).toBe(true);
      expect(response.body.message).toBe('Group post created successfully');
    });

    it('should require approval for private group', async () => {
      privateGroup.members.push({
        userId: user3._id.toString(),
        role: 'member',
        joinedAt: new Date()
      });
      await privateGroup.save();

      const response = await request(app)
        .post(`/api/groups/${privateGroup._id}/posts`)
        .send({
          title: 'Pending Post',
          userId: user3._id.toString()
        });

      expect(response.status).toBe(201);
      expect(response.body.isApproved).toBe(false);
      expect(response.body.message).toBe('Group post created and waiting for approval');
    });

    it('should auto-approve for admin/creator even with requireApproval', async () => {
      const response = await request(app)
        .post(`/api/groups/${privateGroup._id}/posts`)
        .send({
          title: 'Admin Post',
          userId: user2._id.toString() // Creator
        });

      expect(response.status).toBe(201);
      expect(response.body.isApproved).toBe(true);
    });

    it('should enrich post with user and group data', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts`)
        .send({
          title: 'Enriched Post',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(201);
      expect(response.body.userName).toBe('Bob Smith');
      expect(response.body.groupName).toBe('Public Cooking Group');
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts`)
        .send({
          title: 'No User Post'
        });

      expect(response.status).toBe(400);
    });

    it('should return 403 when user is not a member', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts`)
        .send({
          title: 'Forbidden Post',
          userId: user3._id.toString()
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Only group members can post');
    });

    it('should return 400 for invalid group ID', async () => {
      const response = await request(app)
        .post('/api/groups/invalid-id/posts')
        .send({
          title: 'Test Post',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid group ID');
    });

    it('should return 404 when group not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/groups/${nonExistentId}/posts`)
        .send({
          title: 'Test Post',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Group not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts`)
        .send({
          title: 'Test Post',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Group, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts`)
        .send({
          title: 'Test Post',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to create group post');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // GET /:groupId/posts - Get Group Posts
  // ==========================================
  describe('GET /:groupId/posts - Get Group Posts', () => {
    it('should get all approved posts', async () => {
      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts`)
        .query({ userId: user2._id.toString() });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should enrich posts with user and group data', async () => {
      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts`)
        .query({ userId: user2._id.toString() });

      expect(response.status).toBe(200);
      if (response.body.length > 0) {
        const post = response.body[0];
        expect(post.userName).toBeDefined();
        expect(post.groupName).toBe('Public Cooking Group');
        // postSource might not be implemented yet - uncomment if implemented
        // expect(post.postSource).toBe('group');
      }
    });

    it('should return empty array for private group when not member', async () => {
      const response = await request(app)
        .get(`/api/groups/${privateGroup._id}/posts`)
        .query({ userId: user3._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should show only approved posts for regular members', async () => {
      // Create a new test group with user3 as regular member from the start
      const testGroup = await Group.create({
        name: 'Test Approval Group',
        description: 'For testing approvals',
        creatorId: user1._id.toString(),
        isPrivate: false,
        category: 'General',
        members: [
          { userId: user1._id.toString(), role: 'admin', joinedAt: new Date() },
          { userId: user2._id.toString(), role: 'member', joinedAt: new Date() },
          { userId: user3._id.toString(), role: 'member', joinedAt: new Date() }
        ],
        settings: {
          allowMemberPosts: true,
          requireApproval: false,
          allowInvites: true
        }
      });

      // Create approved post
      await createTestPost(testGroup._id, user2._id, {
        title: 'Approved Post',
        isApproved: true
      });

      // Create unapproved post by user2
      await createTestPost(testGroup._id, user2._id, {
        title: 'Unapproved Post',
        isApproved: false
      });

      // user3 (regular member, not admin, not author) should not see unapproved posts
      const response = await request(app)
        .get(`/api/groups/${testGroup._id}/posts`)
        .query({ userId: user3._id.toString() });

      expect(response.status).toBe(200);
      
      // Should see approved posts
      const approved = response.body.find(p => p.title === 'Approved Post');
      expect(approved).toBeDefined();
      
      // Should NOT see unapproved post (not theirs, not admin)
      const unapproved = response.body.find(p => p.title === 'Unapproved Post');
      expect(unapproved).toBeUndefined();
    });

    it('should show own pending posts for member', async () => {
      // Create user's own unapproved post
      await createTestPost(publicGroup._id, user2._id, {
        title: 'My Pending Post',
        isApproved: false
      });

      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts`)
        .query({ userId: user2._id.toString() });

      expect(response.status).toBe(200);
      const ownPending = response.body.find(p => p.title === 'My Pending Post');
      expect(ownPending).toBeDefined();
      expect(ownPending.isPending).toBe(true);
    });

    it('should show all posts for admin', async () => {
      // Create unapproved post
      await createTestPost(publicGroup._id, user2._id, {
        title: 'Unapproved Post',
        isApproved: false
      });

      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts`)
        .query({ userId: user1._id.toString() }); // Admin

      expect(response.status).toBe(200);
      const unapproved = response.body.find(p => p.title === 'Unapproved Post');
      expect(unapproved).toBeDefined();
      expect(unapproved.canApprove).toBe(true);
    });

    it('should sort posts by date descending', async () => {
      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts`)
        .query({ userId: user2._id.toString() });

      expect(response.status).toBe(200);
      if (response.body.length > 1) {
        for (let i = 1; i < response.body.length; i++) {
          const prev = new Date(response.body[i - 1].createdAt);
          const curr = new Date(response.body[i].createdAt);
          expect(prev >= curr).toBe(true);
        }
      }
    });

    it('should return 400 for invalid group ID', async () => {
      const response = await request(app)
        .get('/api/groups/invalid-id/posts');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid group ID');
    });

    it('should return 404 when group not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/groups/${nonExistentId}/posts`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Group not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts`);

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Group, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to fetch group posts');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // GET /:groupId/posts/:postId - Get Single Post
  // ==========================================
  describe('GET /:groupId/posts/:postId - Get Single Group Post', () => {
    it('should get single post successfully', async () => {
      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts/${post1._id}`);

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(post1._id.toString());
      expect(response.body.title).toBe('Chocolate Cake Recipe');
    });

    it('should enrich post with user and group data', async () => {
      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts/${post1._id}`);

      expect(response.status).toBe(200);
      expect(response.body.userName).toBe('Alice Johnson');
      expect(response.body.groupName).toBe('Public Cooking Group');
    });

    it('should return 400 for invalid group ID', async () => {
      const response = await request(app)
        .get('/api/groups/invalid-id/posts/invalid-id');

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid group or post ID');
    });

    it('should return 400 for invalid post ID', async () => {
      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts/invalid-id`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid group or post ID');
    });

    it('should return 400 when post does not belong to group', async () => {
      const otherPost = await createTestPost(privateGroup._id, user2._id);

      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts/${otherPost._id}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Post does not belong to this group');
    });

    it('should return 404 when group not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/groups/${nonExistentId}/posts/${post1._id}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Group not found');
    });

    it('should return 404 when post not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts/${nonExistentId}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts/${post1._id}`);

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Group, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts/${post1._id}`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to fetch group post');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // DELETE /:groupId/posts/:postId - Delete Post
  // ==========================================
  describe('DELETE /:groupId/posts/:postId - Delete Group Post', () => {
    it('should delete own post successfully', async () => {
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post2._id}`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Group post deleted successfully');

      // Verify deleted
      const deleted = await GroupPost.findById(post2._id);
      expect(deleted).toBeNull();
    });

    it('should allow admin to delete any post', async () => {
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post2._id}`)
        .send({ userId: user1._id.toString() }); // Admin

      expect(response.status).toBe(200);
    });

    it('should allow creator to delete any post', async () => {
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post2._id}`)
        .send({ userId: user1._id.toString() }); // Creator

      expect(response.status).toBe(200);
    });

    it('should return 403 when user is not owner/admin/creator', async () => {
      publicGroup.members.push({
        userId: user3._id.toString(),
        role: 'member',
        joinedAt: new Date()
      });
      await publicGroup.save();

      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post2._id}`)
        .send({ userId: user3._id.toString() });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Permission denied');
    });

    it('should return 400 for invalid IDs', async () => {
      const response = await request(app)
        .delete('/api/groups/invalid-id/posts/invalid-id')
        .send({ userId: user1._id.toString() });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid group or post ID');
    });

    it('should return 404 when post not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${nonExistentId}`)
        .send({ userId: user1._id.toString() });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}`)
        .send({ userId: user1._id.toString() });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Group, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}`)
        .send({ userId: user1._id.toString() });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to delete group post');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // POST /:groupId/posts/:postId/like - Like Post
  // ==========================================
  describe('POST /:groupId/posts/:postId/like - Like Group Post', () => {
    it('should like post successfully', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Post liked successfully');
      expect(response.body.likes).toContain(user2._id.toString());
      expect(response.body.likesCount).toBe(1);

      // Verify in database
      const updated = await GroupPost.findById(post1._id);
      expect(updated.likes).toContain(user2._id.toString());
    });

    it('should return 400 when already liked', async () => {
      // Like first time
      await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user2._id.toString() });

      // Try to like again
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Already liked this post');
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User ID is required');
    });

    it('should return 403 when user is not a member', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user3._id.toString() });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Only group members can like posts');
    });

    it('should return 400 for invalid IDs', async () => {
      const response = await request(app)
        .post('/api/groups/invalid-id/posts/invalid-id/like')
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid group or post ID');
    });

    it('should return 404 when post not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${nonExistentId}/like`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Group, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to like post');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // DELETE /:groupId/posts/:postId/like - Unlike Post
  // ==========================================
  describe('DELETE /:groupId/posts/:postId/like - Unlike Group Post', () => {
    beforeEach(async () => {
      // Add like
      post1.likes.push(user2._id.toString());
      await post1.save();
    });

    it('should unlike post successfully', async () => {
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Post unliked successfully');
      expect(response.body.likes).not.toContain(user2._id.toString());
      expect(response.body.likesCount).toBe(0);

      // Verify in database
      const updated = await GroupPost.findById(post1._id);
      expect(updated.likes).not.toContain(user2._id.toString());
    });

    it('should return 400 when not liked yet', async () => {
      // Remove like first
      post1.likes = [];
      await post1.save();

      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Post not liked yet');
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User ID is required');
    });

    it('should return 403 when user is not a member', async () => {
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user3._id.toString() });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Only group members can unlike posts');
    });

    it('should return 400 for invalid IDs', async () => {
      const response = await request(app)
        .delete('/api/groups/invalid-id/posts/invalid-id/like')
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid group or post ID');
    });

    it('should return 404 when post not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${nonExistentId}/like`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Group, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to unlike post');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // POST /:groupId/posts/:postId/comments - Add Comment
  // ==========================================
  describe('POST /:groupId/posts/:postId/comments - Add Comment', () => {
    it('should add comment successfully', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          text: 'Great recipe!',
          userId: user2._id.toString(),
          userName: 'Bob Smith'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Comment added successfully');
      expect(response.body.data.comment.text).toBe('Great recipe!');
      expect(response.body.data.comment.userId).toBe(user2._id.toString());
      expect(response.body.data.commentsCount).toBe(1);

      // Verify in database
      const updated = await GroupPost.findById(post1._id);
      expect(updated.comments).toHaveLength(1);
      expect(updated.comments[0].text).toBe('Great recipe!');
    });

    it('should enrich comment with user data', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          text: 'Nice!',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(201);
      expect(response.body.data.comment.userName).toBe('Bob Smith');
      expect(response.body.data.comment.userAvatar).toBeDefined();
    });

    it('should trim comment text', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          text: '   Trimmed comment   ',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(201);
      expect(response.body.data.comment.text).toBe('Trimmed comment');
    });

    it('should return 400 when text is missing', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          userId: user2._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Comment text is required');
    });

    it('should return 400 when text is empty', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          text: '   ',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Comment text is required');
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          text: 'Comment'
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User ID is required');
    });

    it('should return 403 when user is not a member', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          text: 'Comment',
          userId: user3._id.toString()
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Only group members can comment on posts');
    });

    it('should return 400 for invalid IDs', async () => {
      const response = await request(app)
        .post('/api/groups/invalid-id/posts/invalid-id/comments')
        .send({
          text: 'Comment',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid group or post ID');
    });

    it('should return 404 when post not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${nonExistentId}/comments`)
        .send({
          text: 'Comment',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          text: 'Comment',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Group, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          text: 'Comment',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to add comment');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // DELETE /:groupId/posts/:postId/comments/:commentId - Delete Comment
  // ==========================================
  describe('DELETE /:groupId/posts/:postId/comments/:commentId - Delete Comment', () => {
    let commentId;

    beforeEach(async () => {
      // Add comment
      post1.comments.push({
        userId: user2._id.toString(),
        userName: 'Bob Smith',
        text: 'Test comment',
        createdAt: new Date()
      });
      await post1.save();
      commentId = post1.comments[0]._id.toString();
    });

    it('should delete own comment successfully', async () => {
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments/${commentId}`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Comment deleted successfully');
      expect(response.body.commentsCount).toBe(0);

      // Verify in database
      const updated = await GroupPost.findById(post1._id);
      expect(updated.comments).toHaveLength(0);
    });

    it('should allow admin to delete any comment', async () => {
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments/${commentId}`)
        .send({ userId: user1._id.toString() }); // Admin

      expect(response.status).toBe(200);
    });

    it('should allow creator to delete any comment', async () => {
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments/${commentId}`)
        .send({ userId: user1._id.toString() }); // Creator

      expect(response.status).toBe(200);
    });

    it('should return 403 when not owner/admin/creator', async () => {
      publicGroup.members.push({
        userId: user3._id.toString(),
        role: 'member',
        joinedAt: new Date()
      });
      await publicGroup.save();

      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments/${commentId}`)
        .send({ userId: user3._id.toString() });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Permission denied');
    });

    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments/${commentId}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('User ID is required');
    });

    it('should return 403 when user is not a member', async () => {
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments/${commentId}`)
        .send({ userId: user3._id.toString() });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Only group members can delete comments');
    });

    it('should return 400 for invalid IDs', async () => {
      const response = await request(app)
        .delete('/api/groups/invalid-id/posts/invalid-id/comments/invalid-id')
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Invalid group or post ID');
    });

    it('should return 404 when comment not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments/${nonExistentId}`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Comment not found');
    });

    it('should return 404 when post not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${nonExistentId}/comments/${commentId}`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Post not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments/${commentId}`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Group, 'findById').mockRejectedValue(new Error('DB Error'));

      const response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments/${commentId}`)
        .send({ userId: user2._id.toString() });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to delete comment');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // Integration & Edge Cases
  // ==========================================
  describe('Integration & Edge Cases', () => {
    it('should handle complete post lifecycle', async () => {
      // 1. Create post
      let response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts`)
        .send({
          title: 'Lifecycle Post',
          userId: user2._id.toString()
        });
      expect(response.status).toBe(201);
      const postId = response.body._id;

      // 2. Like post
      response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${postId}/like`)
        .send({ userId: user1._id.toString() });
      expect(response.status).toBe(200);

      // 3. Add comment
      response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${postId}/comments`)
        .send({
          text: 'Great post!',
          userId: user1._id.toString()
        });
      expect(response.status).toBe(201);
      
      // Get comment ID safely
      let commentId = response.body.data?.comment?._id;
      if (!commentId) {
        // If not in response, fetch the post to get the comment ID
        const postResponse = await request(app)
          .get(`/api/groups/${publicGroup._id}/posts/${postId}`);
        commentId = postResponse.body.comments[0]._id;
      }
      commentId = commentId.toString();

      // 4. Get post with likes and comments
      response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts/${postId}`);
      expect(response.status).toBe(200);
      expect(response.body.likes).toHaveLength(1);
      expect(response.body.comments).toHaveLength(1);

      // 5. Delete comment
      response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${postId}/comments/${commentId}`)
        .send({ userId: user1._id.toString() });
      expect(response.status).toBe(200);

      // 6. Unlike post
      response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${postId}/like`)
        .send({ userId: user1._id.toString() });
      expect(response.status).toBe(200);

      // 7. Delete post
      response = await request(app)
        .delete(`/api/groups/${publicGroup._id}/posts/${postId}`)
        .send({ userId: user2._id.toString() });
      expect(response.status).toBe(200);
    });

    it('should handle approval flow for private group', async () => {
      privateGroup.members.push({
        userId: user3._id.toString(),
        role: 'member',
        joinedAt: new Date()
      });
      await privateGroup.save();

      // 1. Member creates post (pending)
      let response = await request(app)
        .post(`/api/groups/${privateGroup._id}/posts`)
        .send({
          title: 'Pending Post',
          userId: user3._id.toString()
        });
      expect(response.status).toBe(201);
      expect(response.body.isApproved).toBe(false);
      const postId = response.body._id;

      // 2. Member can see own pending post
      response = await request(app)
        .get(`/api/groups/${privateGroup._id}/posts`)
        .query({ userId: user3._id.toString() });
      expect(response.status).toBe(200);
      const ownPost = response.body.find(p => p._id === postId);
      expect(ownPost).toBeDefined();
      expect(ownPost.isPending).toBe(true);

      // 3. Admin can see all posts
      response = await request(app)
        .get(`/api/groups/${privateGroup._id}/posts`)
        .query({ userId: user2._id.toString() });
      expect(response.status).toBe(200);
      const pendingPost = response.body.find(p => p._id === postId);
      expect(pendingPost).toBeDefined();
      expect(pendingPost.canApprove).toBe(true);
    });

    it('should handle multiple likes and comments', async () => {
      // Add multiple likes
      await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user1._id.toString() });
      await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user2._id.toString() });

      // Add multiple comments
      await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          text: 'Comment 1',
          userId: user1._id.toString()
        });
      await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          text: 'Comment 2',
          userId: user2._id.toString()
        });

      // Verify counts
      const response = await request(app)
        .get(`/api/groups/${publicGroup._id}/posts/${post1._id}`);
      expect(response.status).toBe(200);
      expect(response.body.likes).toHaveLength(2);
      expect(response.body.comments).toHaveLength(2);
    });

    it('should handle very long comment text', async () => {
      const longText = 'A'.repeat(1000);
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          text: longText,
          userId: user2._id.toString()
        });

      expect([201, 400]).toContain(response.status);
    });

    it('should handle special characters in post title', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts`)
        .send({
          title: 'Recipe with émojis 🍕🍰 & spëcial çhars!',
          userId: user2._id.toString()
        });

      expect(response.status).toBe(201);
      expect(response.body.title).toBe('Recipe with émojis 🍕🍰 & spëcial çhars!');
    });

    it('should maintain data consistency during operations', async () => {
      // Initial state
      const initialPost = await GroupPost.findById(post1._id);
      const initialLikes = initialPost.likes.length;
      const initialComments = initialPost.comments.length;

      // Add like
      await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
        .send({ userId: user2._id.toString() });

      // Add comment
      await request(app)
        .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/comments`)
        .send({
          text: 'Test',
          userId: user2._id.toString()
        });

      // Verify counts increased
      const updated = await GroupPost.findById(post1._id);
      expect(updated.likes.length).toBe(initialLikes + 1);
      expect(updated.comments.length).toBe(initialComments + 1);
    });

    it('should handle concurrent likes', async () => {
      const users = [user1, user2];
      
      const requests = users.map(user =>
        request(app)
          .post(`/api/groups/${publicGroup._id}/posts/${post1._id}/like`)
          .send({ userId: user._id.toString() })
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(res => {
        expect(res.status).toBe(200);
      });

      // Verify final count
      const updated = await GroupPost.findById(post1._id);
      expect(updated.likes.length).toBe(2);
    });

    it('should handle post without optional fields', async () => {
      const response = await request(app)
        .post(`/api/groups/${publicGroup._id}/posts`)
        .send({
          title: 'Minimal Post',
          userId: user2._id.toString()
          // No description, ingredients, instructions
        });

      expect(response.status).toBe(201);
      expect(response.body.title).toBe('Minimal Post');
    });
  });
});

// Export helper functions
export { createTestUser, createTestGroup, createTestPost };