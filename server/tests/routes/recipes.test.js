import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

// Import route
import recipesRouter from '../../src/routes/recipes.js';

// Import models
import Recipe from '../../src/models/Recipe.js';
import User from '../../src/models/User.js';

// Import database
import * as database from '../../src/config/database.js';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/recipes', recipesRouter);

describe('Recipes Routes - Unit Tests', () => {
  let user1, user2, user3;
  let recipe1, recipe2;
  let authToken1, authToken2, authToken3;

  // Helper functions
  const createTestUser = async (overrides = {}) => {
    return await User.create({
      fullName: 'Test User',
      email: `test${Date.now()}${Math.random()}@example.com`,
      password: 'Test1234!',
      ...overrides
    });
  };

  const createTestRecipe = async (userId, overrides = {}) => {
    return await Recipe.create({
      title: 'Test Recipe',
      description: 'Test description',
      ingredients: 'Test ingredients',
      instructions: 'Test instructions',
      category: 'Asian',
      meatType: 'Mixed',
      prepTime: 30,
      servings: 4,
      userId: userId.toString(),
      userName: 'Test User',
      userAvatar: null,
      likes: [],
      comments: [],
      ...overrides
    });
  };

  const generateToken = (userId) => {
    return jwt.sign({ userId: userId.toString() }, process.env.JWT_SECRET || 'your-secret-key');
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

    // Generate tokens
    authToken1 = generateToken(user1._id);
    authToken2 = generateToken(user2._id);
    authToken3 = generateToken(user3._id);

    // Create recipes
    recipe1 = await createTestRecipe(user1._id, {
      title: 'Chocolate Cake',
      description: 'Delicious chocolate cake',
      category: 'Dessert'
    });

    recipe2 = await createTestRecipe(user2._id, {
      title: 'Pasta Carbonara',
      description: 'Classic Italian pasta',
      category: 'Italian'
    });
  });

  // ==========================================
  // POST / - Create Recipe
  // ==========================================
  describe('POST / - Create Recipe', () => {
    it('should create recipe successfully', async () => {
      const response = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          title: 'New Recipe',
          description: 'Delicious recipe',
          ingredients: 'Flour, Sugar',
          instructions: 'Mix and bake',
          category: 'Dessert',
          meatType: 'Vegetarian',
          prepTime: 45,
          servings: 6
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Recipe created successfully');
      expect(response.body.recipe.title).toBe('New Recipe');
      expect(response.body.recipe.userId).toBe(user1._id.toString());
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          title: 'Incomplete Recipe'
          // Missing other required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('All fields are required');
    });

    it('should return 401 when no auth token', async () => {
      const response = await request(app)
        .post('/api/recipes')
        .send({
          title: 'Test Recipe',
          description: 'Test',
          ingredients: 'Test',
          instructions: 'Test',
          category: 'Asian',
          meatType: 'Mixed',
          prepTime: 30,
          servings: 4
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Access token required');
    });

    it('should return 403 with invalid token', async () => {
      const response = await request(app)
        .post('/api/recipes')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          title: 'Test Recipe',
          description: 'Test',
          ingredients: 'Test',
          instructions: 'Test',
          category: 'Asian',
          meatType: 'Mixed',
          prepTime: 30,
          servings: 4
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Invalid token');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          title: 'Test Recipe',
          description: 'Test',
          ingredients: 'Test',
          instructions: 'Test',
          category: 'Asian',
          meatType: 'Mixed',
          prepTime: 30,
          servings: 4
        });

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // GET / - Get All Recipes
  // ==========================================
  describe('GET / - Get All Recipes', () => {
    it('should get all recipes', async () => {
      const response = await request(app)
        .get('/api/recipes');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should return recipes sorted by date descending', async () => {
      const response = await request(app)
        .get('/api/recipes');

      expect(response.status).toBe(200);
      if (response.body.length > 1) {
        for (let i = 1; i < response.body.length; i++) {
          const prev = new Date(response.body[i - 1].createdAt);
          const curr = new Date(response.body[i].createdAt);
          expect(prev >= curr).toBe(true);
        }
      }
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get('/api/recipes');

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });

    it('should return 500 on database error', async () => {
      vi.spyOn(Recipe, 'find').mockImplementation(() => {
        throw new Error('DB Error');
      });

      const response = await request(app)
        .get('/api/recipes');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // GET /:id - Get Single Recipe
  // ==========================================
  describe('GET /:id - Get Single Recipe', () => {
    it('should get single recipe successfully', async () => {
      const response = await request(app)
        .get(`/api/recipes/${recipe1._id}`);

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(recipe1._id.toString());
      expect(response.body.title).toBe('Chocolate Cake');
    });

    it('should return 404 when recipe not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/recipes/${nonExistentId}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Recipe not found');
    });

    it('should return 503 when database is not available', async () => {
      vi.spyOn(database, 'isMongoConnected').mockReturnValue(false);

      const response = await request(app)
        .get(`/api/recipes/${recipe1._id}`);

      expect(response.status).toBe(503);
      expect(response.body.message).toBe('Database not available');

      vi.restoreAllMocks();
    });
  });

  // ==========================================
  // PUT /:id - Update Recipe
  // ==========================================
  describe('PUT /:id - Update Recipe', () => {
    it('should update own recipe successfully', async () => {
      const response = await request(app)
        .put(`/api/recipes/${recipe1._id}`)
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          title: 'Updated Chocolate Cake',
          description: 'Even more delicious',
          ingredients: 'Updated ingredients',
          instructions: 'Updated instructions',
          category: 'Dessert',
          meatType: 'Vegetarian',
          prepTime: 60,
          servings: 8
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Recipe updated successfully');
      expect(response.body.recipe.title).toBe('Updated Chocolate Cake');
    });

    it('should return 403 when trying to update someone else recipe', async () => {
      const response = await request(app)
        .put(`/api/recipes/${recipe1._id}`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send({
          title: 'Trying to update'
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to update this recipe');
    });

    it('should return 404 when recipe not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .put(`/api/recipes/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          title: 'Updated'
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Recipe not found');
    });

    it('should return 401 when no auth token', async () => {
      const response = await request(app)
        .put(`/api/recipes/${recipe1._id}`)
        .send({
          title: 'Updated'
        });

      expect(response.status).toBe(401);
    });
  });

  // ==========================================
  // DELETE /:id - Delete Recipe
  // ==========================================
  describe('DELETE /:id - Delete Recipe', () => {
    it('should delete own recipe successfully', async () => {
      const response = await request(app)
        .delete(`/api/recipes/${recipe1._id}`)
        .set('Authorization', `Bearer ${authToken1}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Recipe deleted successfully');

      // Verify deleted
      const deleted = await Recipe.findById(recipe1._id);
      expect(deleted).toBeNull();
    });

    it('should return 403 when trying to delete someone else recipe', async () => {
      const response = await request(app)
        .delete(`/api/recipes/${recipe1._id}`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to delete this recipe');
    });

    it('should return 404 when recipe not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/recipes/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken1}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Recipe not found');
    });
  });

  // ==========================================
  // POST /:id/like - Like Recipe
  // ==========================================
  describe('POST /:id/like - Like Recipe', () => {
    it('should like recipe successfully', async () => {
      const response = await request(app)
        .post(`/api/recipes/${recipe1._id}/like`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Recipe liked successfully');
      expect(response.body.likes).toContain(user2._id.toString());
      expect(response.body.likesCount).toBe(1);
    });

    it('should return 400 when already liked', async () => {
      // Like first time
      await request(app)
        .post(`/api/recipes/${recipe1._id}/like`)
        .set('Authorization', `Bearer ${authToken2}`);

      // Try to like again
      const response = await request(app)
        .post(`/api/recipes/${recipe1._id}/like`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Recipe already liked');
    });

    it('should return 404 when recipe not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/recipes/${nonExistentId}/like`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Recipe not found');
    });

    it('should return 401 when no auth token', async () => {
      const response = await request(app)
        .post(`/api/recipes/${recipe1._id}/like`);

      expect(response.status).toBe(401);
    });
  });

  // ==========================================
  // DELETE /:id/like - Unlike Recipe
  // ==========================================
  describe('DELETE /:id/like - Unlike Recipe', () => {
    beforeEach(async () => {
      // Add like
      recipe1.likes.push(user2._id.toString());
      await recipe1.save();
    });

    it('should unlike recipe successfully', async () => {
      const response = await request(app)
        .delete(`/api/recipes/${recipe1._id}/like`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Like removed successfully');
      expect(response.body.likes).not.toContain(user2._id.toString());
      expect(response.body.likesCount).toBe(0);
    });

    it('should return 400 when not liked yet', async () => {
      // Remove like first
      recipe1.likes = [];
      await recipe1.save();

      const response = await request(app)
        .delete(`/api/recipes/${recipe1._id}/like`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Recipe not liked yet');
    });

    it('should return 404 when recipe not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/recipes/${nonExistentId}/like`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Recipe not found');
    });
  });

  // ==========================================
  // POST /:id/comments - Add Comment
  // ==========================================
  describe('POST /:id/comments - Add Comment', () => {
    it('should add comment successfully', async () => {
      const response = await request(app)
        .post(`/api/recipes/${recipe1._id}/comments`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send({
          text: 'Great recipe!'
        });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Comment added successfully');
      expect(response.body.data.comment.text).toBe('Great recipe!');
      expect(response.body.data.comment.userId).toBe(user2._id.toString());
      expect(response.body.data.commentsCount).toBe(1);
    });

    it('should return 400 when text is missing', async () => {
      const response = await request(app)
        .post(`/api/recipes/${recipe1._id}/comments`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Comment text is required');
    });

    it('should return 400 when text is empty', async () => {
      const response = await request(app)
        .post(`/api/recipes/${recipe1._id}/comments`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send({
          text: '   '
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Comment text is required');
    });

    it('should return 404 when recipe not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post(`/api/recipes/${nonExistentId}/comments`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send({
          text: 'Comment'
        });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Recipe not found');
    });
  });

  // ==========================================
  // DELETE /:id/comments/:commentId - Delete Comment
  // ==========================================
  describe('DELETE /:id/comments/:commentId - Delete Comment', () => {
    let commentId;

    beforeEach(async () => {
      // Add comment
      recipe1.comments.push({
        userId: user2._id.toString(),
        userName: 'Bob Smith',
        text: 'Test comment',
        createdAt: new Date()
      });
      await recipe1.save();
      commentId = recipe1.comments[0]._id.toString();
    });

    it('should delete own comment successfully', async () => {
      const response = await request(app)
        .delete(`/api/recipes/${recipe1._id}/comments/${commentId}`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Comment deleted successfully');
    });

    it('should return 403 when trying to delete someone else comment', async () => {
      const response = await request(app)
        .delete(`/api/recipes/${recipe1._id}/comments/${commentId}`)
        .set('Authorization', `Bearer ${authToken3}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Not authorized to delete this comment');
    });

    it('should return 404 when comment not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/recipes/${recipe1._id}/comments/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Comment not found');
    });

    it('should return 404 when recipe not found', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .delete(`/api/recipes/${nonExistentId}/comments/${commentId}`)
        .set('Authorization', `Bearer ${authToken2}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Recipe not found');
    });
  });

  // ==========================================
  // Integration & Edge Cases
  // ==========================================
  describe('Integration & Edge Cases', () => {
    it('should handle complete recipe lifecycle', async () => {
      // 1. Create recipe
      let response = await request(app)
        .post('/api/recipes')
        .set('Authorization', `Bearer ${authToken1}`)
        .send({
          title: 'Lifecycle Recipe',
          description: 'Test',
          ingredients: 'Test',
          instructions: 'Test',
          category: 'Asian',
          meatType: 'Mixed',
          prepTime: 30,
          servings: 4
        });
      expect(response.status).toBe(201);
      const recipeId = response.body.recipe._id;

      // 2. Like recipe
      response = await request(app)
        .post(`/api/recipes/${recipeId}/like`)
        .set('Authorization', `Bearer ${authToken2}`);
      expect(response.status).toBe(200);

      // 3. Add comment
      response = await request(app)
        .post(`/api/recipes/${recipeId}/comments`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send({ text: 'Great!' });
      expect(response.status).toBe(201);

      // 4. Update recipe
      response = await request(app)
        .put(`/api/recipes/${recipeId}`)
        .set('Authorization', `Bearer ${authToken1}`)
        .send({ title: 'Updated Lifecycle Recipe' });
      expect(response.status).toBe(200);

      // 5. Delete recipe
      response = await request(app)
        .delete(`/api/recipes/${recipeId}`)
        .set('Authorization', `Bearer ${authToken1}`);
      expect(response.status).toBe(200);
    });

    it('should handle multiple likes and comments', async () => {
      // Add likes
      await request(app)
        .post(`/api/recipes/${recipe1._id}/like`)
        .set('Authorization', `Bearer ${authToken2}`);
      await request(app)
        .post(`/api/recipes/${recipe1._id}/like`)
        .set('Authorization', `Bearer ${authToken3}`);

      // Add comments
      await request(app)
        .post(`/api/recipes/${recipe1._id}/comments`)
        .set('Authorization', `Bearer ${authToken2}`)
        .send({ text: 'Comment 1' });
      await request(app)
        .post(`/api/recipes/${recipe1._id}/comments`)
        .set('Authorization', `Bearer ${authToken3}`)
        .send({ text: 'Comment 2' });

      // Verify counts
      const response = await request(app)
        .get(`/api/recipes/${recipe1._id}`);
      expect(response.status).toBe(200);
      expect(response.body.likes).toHaveLength(2);
      expect(response.body.comments).toHaveLength(2);
    });
  });
});

export { createTestUser, createTestRecipe };