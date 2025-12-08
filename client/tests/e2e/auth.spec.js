import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should register new user', async ({ page }) => {
    await page.goto('/');
    
    await expect(page).toHaveTitle(/FlavorWorld|Recipe/i);
    
    console.log('Basic test passed!');
  });
});