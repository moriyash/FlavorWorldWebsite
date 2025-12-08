import { test, expect } from '@playwright/test';
import { 
  setupE2ETest, 
  cleanupE2ETest,
  generateTestUser,
  registerUser,
  loginUser
} from '../../helpers/setup.js';
import { 
  generateTestRecipe,
  navigateToHome,
  openCreateRecipeModal,
  fillRecipeForm,
  submitRecipeForm,
  waitForRecipeInFeed
} from '../../helpers/recipes.js';

test.describe('Create Recipe E2E Tests', () => {
  
  let testUser;
  let userToken;

  test.beforeAll(async () => {
    await setupE2ETest();
    
    testUser = generateTestUser('recipe-creator');
    const registerResult = await registerUser(testUser);
    
    expect(registerResult.success).toBe(true);
    
    const loginResult = await loginUser(testUser.email, testUser.password);
    expect(loginResult.success).toBe(true);
    
    userToken = loginResult.token;
    
    console.log('✅ Test user created and logged in for recipe tests');
  });

  test.afterAll(async () => {
    await cleanupE2ETest();
  });

  test.beforeEach(async ({ page }) => {
    // Login via UI
    await page.goto('http://localhost:5173/login');
    await page.locator('input[placeholder*="example@flavorworld.com"]').fill(testUser.email);
    await page.locator('input[placeholder*="Enter your password"]').fill(testUser.password);
    
    page.once('dialog', async dialog => {
      await dialog.accept();
    });
    
    await page.locator('button:has-text("Sign in")').click();
    await page.waitForURL('**/home', { timeout: 10000 });
    
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  //  POSITIVE TEST CASES

  test('should display create recipe modal', async ({ page }) => {
  await openCreateRecipeModal(page);
  
  await expect(page.locator('.modal-container')).toBeVisible();
  await expect(page.locator('h2:has-text("Share Recipe")')).toBeVisible();
  
  await expect(page.locator('input[placeholder="What\'s cooking?"]')).toBeVisible();
  await expect(page.locator('textarea[placeholder*="Tell us about"]')).toBeVisible();
  await expect(page.locator('textarea[placeholder*="ingredients"]')).toBeVisible();
  await expect(page.locator('textarea[placeholder*="instructions"]')).toBeVisible();
  await expect(page.locator('.dropdown-button').first()).toBeVisible();
  
  await expect(page.locator('.modal-container button:has-text("Share Recipe")')).toBeVisible();
});

  test('should create recipe with all required fields', async ({ page }) => {
    const recipeData = generateTestRecipe('complete');
    
    await openCreateRecipeModal(page);
    await fillRecipeForm(page, recipeData);
    
    let alertMessage = '';
    page.once('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });
    
    await submitRecipeForm(page);
    
    await page.waitForTimeout(2000);
    
    expect(alertMessage.toLowerCase()).toContain('success');
    
    await expect(page.locator('.modal-container')).not.toBeVisible();
    
    const recipeInFeed = await waitForRecipeInFeed(page, recipeData.title, 5000);
    expect(recipeInFeed).toBe(true);
  });

  test('should create recipe without media', async ({ page }) => {
    const recipeData = generateTestRecipe('no-media');
    
    await openCreateRecipeModal(page);
    await fillRecipeForm(page, recipeData);
    
    page.once('dialog', async dialog => {
      await dialog.accept();
    });
    
    await submitRecipeForm(page);
    await page.waitForTimeout(2000);
    
    await expect(page.locator(`text=${recipeData.title}`)).toBeVisible({ timeout: 5000 });
  });

  test('should handle prep time with hours and minutes', async ({ page }) => {
    const recipeData = {
      ...generateTestRecipe('time-test'),
      prepTime: 125 
    };
    
    await openCreateRecipeModal(page);
    
    // Fill form
    await page.locator('input[placeholder="What\'s cooking?"]').fill(recipeData.title);
    await page.locator('textarea[placeholder*="Tell us about"]').first().fill(recipeData.description);
    await page.locator('textarea[placeholder*="ingredients"]').fill(recipeData.ingredients);
    await page.locator('textarea[placeholder*="instructions"]').fill(recipeData.instructions);
    
    // Select category
    await page.locator('.dropdown-button').first().click();
    await page.waitForTimeout(300);
    await page.locator('.dropdown-item:has-text("Italian")').click();
    
    // Select meat type
    await page.locator('.dropdown-button').last().click();
    await page.waitForTimeout(300);
    await page.locator('.dropdown-item:has-text("Mixed")').click();
    
    await page.locator('input.time-input').first().fill('2');
    await page.locator('input.time-input').last().fill('5');
    
    // Fill servings
    await page.locator('input[placeholder="4"]').fill('4');
    
    page.once('dialog', async dialog => {
      await dialog.accept();
    });
    
    await submitRecipeForm(page);
    await page.waitForTimeout(2000);
    
    // Verify recipe created
    await expect(page.locator(`text=${recipeData.title}`)).toBeVisible({ timeout: 5000 });
  });

  test('should select category from dropdown', async ({ page }) => {
    await openCreateRecipeModal(page);
    
    const categoryButton = page.locator('.dropdown-button').first();
    await categoryButton.click();
    
    // Check dropdown is open
    await expect(page.locator('.dropdown-menu')).toBeVisible();
    
    // Check categories exist
    await expect(page.locator('.dropdown-item:has-text("Asian")')).toBeVisible();
    await expect(page.locator('.dropdown-item:has-text("Italian")')).toBeVisible();
    await expect(page.locator('.dropdown-item:has-text("Mexican")')).toBeVisible();
    
    // Select Italian
    await page.locator('.dropdown-item:has-text("Italian")').click();
    
    // Verify selection
    await expect(categoryButton).toContainText('Italian');
  });

  test('should select meat type from dropdown', async ({ page }) => {
    await openCreateRecipeModal(page);
    
    const meatTypeButton = page.locator('.dropdown-button').last();
    await meatTypeButton.click();
    
    // Check dropdown is open
    await expect(page.locator('.dropdown-menu')).toBeVisible();
    
    // Check meat types exist
    await expect(page.locator('.dropdown-item:has-text("Vegetarian")')).toBeVisible();
    await expect(page.locator('.dropdown-item:has-text("Chicken")')).toBeVisible();
    await expect(page.locator('.dropdown-item:has-text("Beef")')).toBeVisible();
    
    // Select Chicken
    await page.locator('.dropdown-item:has-text("Chicken")').click();
    
    // Verify selection
    await expect(meatTypeButton).toContainText('Chicken');
  });

  test('should close modal with X button', async ({ page }) => {
    await openCreateRecipeModal(page);
    
    await expect(page.locator('.modal-container')).toBeVisible();
    
    // Click X button
    const closeButton = page.locator('.modal-header button:has(svg)');
    await closeButton.click();
    
    // Modal should close
    await expect(page.locator('.modal-container')).not.toBeVisible();
  });

  test('should close modal by clicking overlay', async ({ page }) => {
    await openCreateRecipeModal(page);
    
    await expect(page.locator('.modal-container')).toBeVisible();
    
    // Click overlay
    await page.locator('.modal-overlay').click({ position: { x: 10, y: 10 } });
    
    // Modal should close
    await expect(page.locator('.modal-container')).not.toBeVisible();
  });

  //  VALIDATION TEST CASES

  test('should show alert for empty title', async ({ page }) => {
    const recipeData = generateTestRecipe('no-title');
    
    await openCreateRecipeModal(page);
    
    // Fill all except title
    await page.locator('textarea[placeholder*="Tell us about"]').first().fill(recipeData.description);
    await page.locator('textarea[placeholder*="ingredients"]').fill(recipeData.ingredients);
    await page.locator('textarea[placeholder*="instructions"]').fill(recipeData.instructions);
    
    let alertMessage = '';
    page.once('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });
    
    await page.locator('.modal-container button:has-text("Share Recipe")').click();
    await page.waitForTimeout(500);
    
    expect(alertMessage.toLowerCase()).toContain('fill in all');
  });

  test('should show alert for empty description', async ({ page }) => {
    const recipeData = generateTestRecipe('no-desc');
    
    await openCreateRecipeModal(page);
    
    await page.locator('input[placeholder="What\'s cooking?"]').fill(recipeData.title);
    // Skip description
    await page.locator('textarea[placeholder*="ingredients"]').fill(recipeData.ingredients);
    
    let alertMessage = '';
    page.once('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });
    
    await page.locator('.modal-container button:has-text("Share Recipe")').click();
    await page.waitForTimeout(500);
    
    expect(alertMessage.toLowerCase()).toContain('fill in all');
  });

  test('should show alert for missing category', async ({ page }) => {
    const recipeData = generateTestRecipe('no-category');
    
    await openCreateRecipeModal(page);
    
    await page.locator('input[placeholder="What\'s cooking?"]').fill(recipeData.title);
    await page.locator('textarea[placeholder*="Tell us about"]').first().fill(recipeData.description);
    await page.locator('textarea[placeholder*="ingredients"]').fill(recipeData.ingredients);
    await page.locator('textarea[placeholder*="instructions"]').fill(recipeData.instructions);
    await page.locator('input[placeholder="4"]').fill('4');
    await page.locator('input.time-input').first().fill('1');
    
    // Skip category
    
    let alertMessage = '';
    page.once('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });
    
    await page.locator('.modal-container button:has-text("Share Recipe")').click();
    await page.waitForTimeout(500);
    
    expect(alertMessage.toLowerCase()).toContain('fill in all');
  });

  test('should show alert for missing prep time', async ({ page }) => {
    const recipeData = generateTestRecipe('no-time');
    
    await openCreateRecipeModal(page);
    await fillRecipeForm(page, { ...recipeData, prepTime: 0 });
    
    let alertMessage = '';
    page.once('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });
    
    await page.locator('.modal-container button:has-text("Share Recipe")').click();
    await page.waitForTimeout(500);
    
    expect(alertMessage.toLowerCase()).toContain('fill in all');
  });

  
  //  RESPONSIVE

  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    const recipeData = generateTestRecipe('mobile');
    
    await openCreateRecipeModal(page);
    
    // Modal should be visible
    await expect(page.locator('.modal-container')).toBeVisible();
    
    await fillRecipeForm(page, recipeData);
    
    page.once('dialog', async dialog => {
      await dialog.accept();
    });
    
    await submitRecipeForm(page);
    await page.waitForTimeout(2000);
    
    await expect(page.locator(`text=${recipeData.title}`)).toBeVisible({ timeout: 5000 });
  });
});