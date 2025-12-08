import { test, expect } from '@playwright/test';
import { 
  setupE2ETest, 
  cleanupE2ETest, 
  registerUser, 
  generateTestUser,
  generateTestRecipe 
} from '../../helpers/setup.js';

test.describe('Profile Tests', () => {
  let testUser1, testUser2;
  let user1Token, user2Token;

  test.beforeAll(async () => {
    await setupE2ETest();
  });

  test.afterAll(async () => {
    await cleanupE2ETest();
  });

  test.beforeEach(async ({ request }) => {
    testUser1 = generateTestUser('profile1');
    testUser2 = generateTestUser('profile2');
    
    const result1 = await registerUser(testUser1);
    const result2 = await registerUser(testUser2);
    
    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);
    
    user1Token = result1.token;
    user2Token = result2.token;
  });

  test('should view own profile', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.fill('input[type="email"]', testUser1.email);
    await page.fill('input[type="password"]', testUser1.password);
    await page.click('button.login-button:has-text("Sign in")');
    await page.waitForURL('**/home', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    await page.click('button.nav-icon-btn.profile-btn');
    await page.waitForURL('**/profile', { timeout: 10000 });
    await page.waitForTimeout(1000);
    
    await expect(page.locator('.profile-details h2')).toContainText(testUser1.fullName);
    await expect(page.locator('.profile-details .email')).toContainText(testUser1.email);
    await expect(page.locator('button.edit-btn:has-text("Edit Profile")')).toBeVisible();
    await expect(page.locator('.profile-tabs button:has-text("All Recipes")')).toBeVisible();
  });

  test('should view another user profile', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.fill('input[type="email"]', testUser1.email);
    await page.fill('input[type="password"]', testUser1.password);
    await page.click('button.login-button:has-text("Sign in")');
    await page.waitForURL('**/home', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    await page.click('.search-box input[type="text"]');
    await page.waitForURL('**/search', { timeout: 10000 });
    await page.waitForTimeout(1000);
    
    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill(testUser2.fullName);
    await page.waitForTimeout(2000);
    
    const usersTab = page.locator('.search-tabs button:has-text("Users")');
    if (await usersTab.isVisible()) {
      await usersTab.click();
      await page.waitForTimeout(500);
    }
    
    const userCard = page.locator(`.result-user:has-text("${testUser2.fullName}")`).first();
    await expect(userCard).toBeVisible({ timeout: 5000 });
    await userCard.click();
    await page.waitForTimeout(2000);
    
    await expect(page.locator('.profile-details h2')).toContainText(testUser2.fullName);
    await expect(page.locator('button.follow-btn:has-text("Follow")')).toBeVisible();
    await expect(page.locator('button.edit-btn:has-text("Edit Profile")')).not.toBeVisible();
  });

  test('should follow and unfollow user', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.fill('input[type="email"]', testUser1.email);
    await page.fill('input[type="password"]', testUser1.password);
    await page.click('button.login-button:has-text("Sign in")');
    await page.waitForURL('**/home', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    await page.click('.search-box input[type="text"]');
    await page.waitForURL('**/search', { timeout: 10000 });
    await page.waitForTimeout(1000);
    
    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill(testUser2.fullName);
    await page.waitForTimeout(2000);
    
    const usersTab = page.locator('.search-tabs button:has-text("Users")');
    if (await usersTab.isVisible()) {
      await usersTab.click();
      await page.waitForTimeout(500);
    }
    
    const userCard = page.locator(`.result-user:has-text("${testUser2.fullName}")`).first();
    await userCard.click();
    await page.waitForTimeout(2000);
    
    const followButton = page.locator('button.follow-btn:has-text("Follow")');
    await expect(followButton).toBeVisible();
    await followButton.click();
    await page.waitForTimeout(2000);
    
    await expect(page.locator('button.follow-btn:has-text("Unfollow")')).toBeVisible();
    
    const unfollowButton = page.locator('button.follow-btn:has-text("Unfollow")');
    await unfollowButton.click();
    await page.waitForTimeout(2000);
    
    await expect(page.locator('button.follow-btn:has-text("Follow")')).toBeVisible();
  });

  test('should display user recipes on profile', async ({ page, request }) => {
    const recipeData = generateTestRecipe('profile');
    
    const createResponse = await request.post('http://localhost:3000/api/recipes', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user1Token}`
      },
      data: recipeData
    });
    
    expect(createResponse.ok()).toBe(true);
    
    await page.goto('http://localhost:5173');
    await page.fill('input[type="email"]', testUser1.email);
    await page.fill('input[type="password"]', testUser1.password);
    await page.click('button.login-button:has-text("Sign in")');
    await page.waitForURL('**/home', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    await page.click('button.nav-icon-btn.profile-btn');
    await page.waitForURL('**/profile', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    const recipeTitle = page.locator(`.post-component:has-text("${recipeData.title}")`);
    await expect(recipeTitle).toBeVisible({ timeout: 5000 });
  });

  test('should start chat from user profile', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.fill('input[type="email"]', testUser1.email);
    await page.fill('input[type="password"]', testUser1.password);
    await page.click('button.login-button:has-text("Sign in")');
    await page.waitForURL('**/home', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    await page.click('.search-box input[type="text"]');
    await page.waitForURL('**/search', { timeout: 10000 });
    await page.waitForTimeout(1000);
    
    const searchInput = page.locator('input[type="text"]').first();
    await searchInput.fill(testUser2.fullName);
    await page.waitForTimeout(2000);
    
    const usersTab = page.locator('.search-tabs button:has-text("Users")');
    if (await usersTab.isVisible()) {
      await usersTab.click();
      await page.waitForTimeout(500);
    }
    
    const userCard = page.locator(`.result-user:has-text("${testUser2.fullName}")`).first();
    await userCard.click();
    await page.waitForTimeout(2000);
    
    const messageButton = page.locator('button.message-btn:has-text("Message")');
    await expect(messageButton).toBeVisible();
    await messageButton.click();
    
    await page.waitForURL('**/chat/**', { timeout: 10000 });
    await page.waitForTimeout(1000);
    
    await expect(page.locator('.chat-header, .conversation-header')).toBeVisible();
  });

  test('should display stats correctly', async ({ page, request }) => {
    const recipeData = generateTestRecipe('statstest');
    await request.post('http://localhost:3000/api/recipes', {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${user1Token}`
      },
      data: recipeData
    });
    
    await page.goto('http://localhost:5173');
    await page.fill('input[type="email"]', testUser1.email);
    await page.fill('input[type="password"]', testUser1.password);
    await page.click('button.login-button:has-text("Sign in")');
    await page.waitForURL('**/home', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    await page.click('button.nav-icon-btn.profile-btn');
    await page.waitForURL('**/profile', { timeout: 10000 });
    await page.waitForTimeout(2000);
    
    const statsContainer = page.locator('.stats-container');
    await expect(statsContainer).toBeVisible();
    
    const recipesCount = statsContainer.locator('.stat-item:has-text("Recipes")');
    await expect(recipesCount).toBeVisible();
    
    const followersCount = statsContainer.locator('.stat-item:has-text("Followers")');
    await expect(followersCount).toBeVisible();
  });
});
