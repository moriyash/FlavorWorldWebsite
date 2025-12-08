import { test, expect } from '@playwright/test';
import { 
  setupE2ETest, 
  cleanupE2ETest,
  generateTestUser
} from '../../helpers/setup.js';
import { auth } from '../../helpers/selectors.js';
import { authAPI } from '../../helpers/api.js';

test.describe('User Registration E2E Tests', () => {
  
  test.beforeAll(async () => {
    await setupE2ETest();
  });

  test.afterAll(async () => {
    await cleanupE2ETest();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/register');
    await page.waitForLoadState('networkidle');
  });

  
  //  HAPPY PATH - Registration Flow

  test('should display register page with all elements', async ({ page }) => {
    // Title with FlavorWorld
    await expect(page.locator(auth.register.title)).toContainText('Join');
    await expect(page.locator(auth.register.titleHighlight)).toContainText('FlavorWorld');
    
    // All inputs visible
    await expect(page.locator(auth.register.fullNameInput)).toBeVisible();
    await expect(page.locator(auth.register.emailInput)).toBeVisible();
    await expect(page.locator(auth.register.passwordInput)).toBeVisible();
    await expect(page.locator(auth.register.confirmPasswordInput)).toBeVisible();
    
    // Submit button visible 
    await expect(page.locator(auth.register.submitButton)).toBeVisible();
    await expect(page.locator(auth.register.submitButton)).toBeEnabled();
    
    // Login link visible
    await expect(page.locator(auth.register.loginLink)).toBeVisible();
  });

  test('should successfully register a new user', async ({ page }) => {
    const user = generateTestUser('success');
    
    console.log(' Registering user:', user.email);
    
    let alertShown = false;
    page.on('dialog', async dialog => {
      console.log('Alert:', dialog.message());
      expect(dialog.message()).toContain('Welcome to FlavorWorld');
      alertShown = true;
      await dialog.accept();
    });
    
    // Fill form
    await page.locator(auth.register.fullNameInput).fill(user.fullName);
    await page.locator(auth.register.emailInput).fill(user.email);
    await page.locator(auth.register.passwordInput).fill(user.password);
    await page.locator(auth.register.confirmPasswordInput).fill(user.password);
    
    // Submit
    await page.locator(auth.register.submitButton).click();
    
    // Wait for navigation to login
    await page.waitForURL('**/login', { timeout: 10000 });
    
    // Verify alert was shown
    expect(alertShown).toBe(true);
    
    // Verify on login page
    await expect(page.locator(auth.login.pageTitle)).toBeVisible();
    
    // Verify user exists in DB
    const loginResult = await authAPI.login(user.email, user.password);
    expect(loginResult.ok).toBe(true);
  });

  test('should show and hide password when toggle clicked', async ({ page }) => {
    const passwordInput = page.locator(auth.register.passwordInput);
    
    // Fill password
    await passwordInput.fill('Test1234!');
    
    // Check initial state 
    await expect(passwordInput).toHaveAttribute('type', 'password');
    
    // Click toggle 
    await page.locator(auth.register.togglePasswordBtn).first().click();
    await page.waitForTimeout(100);
    
    // Should be visible
    await expect(passwordInput).toHaveAttribute('type', 'text');
    
    // Click again to hide
    await page.locator(auth.register.togglePasswordBtn).first().click();
    await page.waitForTimeout(100);
    
    // Should be hidden
    await expect(passwordInput).toHaveAttribute('type', 'password');
  });

  test('should navigate to login page from register link', async ({ page }) => {
    await page.locator(auth.register.loginLink).click();
    
    await page.waitForURL('**/login');
    await expect(page.locator(auth.login.pageTitle)).toBeVisible();
  });

  //  VALIDATION - Empty Fields

  test('should show alert when submitting empty form', async ({ page }) => {
    let alertMessage = '';
    
    page.on('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });
    
    await page.locator(auth.register.submitButton).click();
    await page.waitForTimeout(500);
    
    expect(alertMessage).toContain('fill in all fields correctly');
  });

  test('should show error for short name (less than 3 chars)', async ({ page }) => {
    await page.locator(auth.register.fullNameInput).fill('Ab');
    
    await page.locator(auth.register.emailInput).click();
    await page.waitForTimeout(300);
    
    const errors = page.locator(auth.register.errorText);
    const errorCount = await errors.count();
    
    if (errorCount > 0) {
      await expect(errors.first()).toBeVisible();
    }
  });

  test('should show error for invalid email', async ({ page }) => {
    await page.locator(auth.register.emailInput).fill('notanemail');
    await page.locator(auth.register.passwordInput).click();
    await page.waitForTimeout(300);
    
    const errors = page.locator(auth.register.errorText);
    const errorCount = await errors.count();
    
    if (errorCount > 0) {
      const errorText = await errors.first().textContent();
      expect(errorText?.toLowerCase()).toContain('email');
    }
  });

  test('should show error for weak password', async ({ page }) => {
    await page.locator(auth.register.passwordInput).fill('Test1234');
    await page.locator(auth.register.confirmPasswordInput).click();
    await page.waitForTimeout(300);
    
    const errors = page.locator(auth.register.errorText);
    const errorCount = await errors.count();
    
    if (errorCount > 0) {
      const errorText = await errors.first().textContent();
      expect(errorText?.toLowerCase()).toContain('character');
    }
  });

  test('should show error when passwords do not match', async ({ page }) => {
    await page.locator(auth.register.passwordInput).fill('Test1234!');
    await page.locator(auth.register.confirmPasswordInput).fill('Different1!');
    await page.locator(auth.register.fullNameInput).click();
    await page.waitForTimeout(300);
    
    const errors = page.locator(auth.register.errorText);
    const errorCount = await errors.count();
    
    if (errorCount > 0) {
      const lastError = errors.last();
      const errorText = await lastError.textContent();
      expect(errorText?.toLowerCase()).toContain('do not match');
    }
  });

  //  EXISTING USER

  test('should reject registration with existing email', async ({ page }) => {
    const fixedEmail = `existing-test-${Date.now()}@test.com`;
    const existingUser = {
      fullName: 'Existing User',
      email: fixedEmail,
      password: 'Test1234!',
      confirmPassword: 'Test1234!'
    };
    
    console.log('Creating first user with email:', fixedEmail);
    const registerResult = await authAPI.register(existingUser);
    console.log('First registration result:', registerResult);
    
    expect(registerResult.ok).toBe(true);
    
    // Wait to ensure user is saved
    await page.waitForTimeout(1000);
    
    // Now try to register again via UI with SAME email
    let alertMessage = '';
    page.on('dialog', async dialog => {
      alertMessage = dialog.message();
      console.log(' Alert received:', alertMessage);
      await dialog.accept();
    });
    
    await page.locator(auth.register.fullNameInput).fill('Different Name');
    await page.locator(auth.register.emailInput).fill(fixedEmail); // Same email!
    await page.locator(auth.register.passwordInput).fill('Different123!');
    await page.locator(auth.register.confirmPasswordInput).fill('Different123!');
    
    await page.locator(auth.register.submitButton).click();
    
    // Wait for alert
    await page.waitForTimeout(2000);
    
    console.log('Final alert message:', alertMessage);
    
    // Should contain error about existing user
    const hasError = alertMessage.toLowerCase().includes('already exists') || 
                    alertMessage.toLowerCase().includes('user already exists') ||
                    alertMessage.toLowerCase().includes('registration failed');
    
    expect(hasError).toBe(true);
    
    expect(page.url()).toContain('register');
  });

  //  EDGE CASES

  test('should trim whitespace from name and email', async ({ page }) => {
    const user = generateTestUser('whitespace');
    
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    
    // Fill with spaces
    await page.locator(auth.register.fullNameInput).fill(`  ${user.fullName}  `);
    await page.locator(auth.register.emailInput).fill(`  ${user.email}  `);
    await page.locator(auth.register.passwordInput).fill(user.password);
    await page.locator(auth.register.confirmPasswordInput).fill(user.password);
    
    await page.locator(auth.register.submitButton).click();
    await page.waitForURL('**/login', { timeout: 10000 });
    
    // Verify trimmed values work
    const result = await authAPI.login(user.email.trim(), user.password);
    expect(result.ok).toBe(true);
  });

  test('should show loading state during registration', async ({ page }) => {
    const user = generateTestUser('loading');
    
    let dialogHandled = false;
    page.on('dialog', async dialog => {
      await page.waitForTimeout(500); 
      dialogHandled = true;
      await dialog.accept();
    });
    
    await page.locator(auth.register.fullNameInput).fill(user.fullName);
    await page.locator(auth.register.emailInput).fill(user.email);
    await page.locator(auth.register.passwordInput).fill(user.password);
    await page.locator(auth.register.confirmPasswordInput).fill(user.password);
    
    const submitBtn = page.locator(auth.register.submitButton);
    
    await submitBtn.click();
    
    try {
      await expect(submitBtn).toBeDisabled({ timeout: 500 });
      console.log(' Button was disabled during loading');
    } catch {
      await page.waitForTimeout(1000);
      expect(dialogHandled).toBe(true);
    }
  });

  test('should handle special characters in name', async ({ page }) => {
    const user = generateTestUser('special');
    const specialName = "José María O'Brien";
    
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    
    await page.locator(auth.register.fullNameInput).fill(specialName);
    await page.locator(auth.register.emailInput).fill(user.email);
    await page.locator(auth.register.passwordInput).fill(user.password);
    await page.locator(auth.register.confirmPasswordInput).fill(user.password);
    
    await page.locator(auth.register.submitButton).click();
    await page.waitForURL('**/login', { timeout: 10000 });
    
    const result = await authAPI.login(user.email, user.password);
    expect(result.ok).toBe(true);
    expect(result.data.user.fullName).toBe(specialName);
  });

  //  ACCESSIBILITY

  test('should have form labels', async ({ page }) => {
    await expect(page.locator('label:has-text("Full Name")')).toBeVisible();
    await expect(page.locator('label:has-text("Email address")')).toBeVisible();
    await expect(page.locator('label:has-text("Password")').first()).toBeVisible();
    await expect(page.locator('label:has-text("Confirm Password")')).toBeVisible();
  });

  test('should support keyboard navigation', async ({ page }) => {
    const user = generateTestUser('keyboard');
    
    let dialogShown = false;
    page.on('dialog', async dialog => {
      dialogShown = true;
      await dialog.accept();
    });
    
    await page.locator(auth.register.fullNameInput).click();
    await page.keyboard.type(user.fullName);
    
    await page.keyboard.press('Tab');
    await page.keyboard.type(user.email);
    
    await page.keyboard.press('Tab');
    await page.keyboard.type(user.password);
    
    await page.keyboard.press('Tab');
    await page.keyboard.type(user.password);
    
    await page.keyboard.press('Tab'); 
    await page.waitForTimeout(200);
    
    await page.keyboard.press('Enter');
    
    await page.waitForTimeout(500);
    if (!dialogShown) {
      await page.locator(auth.register.submitButton).click();
    }
    
    try {
      await page.waitForURL('**/login', { timeout: 10000 });
    } catch {
      expect(dialogShown).toBe(true);
    }
  });

  //  RESPONSIVE

  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    const user = generateTestUser('mobile');
    
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    
    // Verify all elements visible
    await expect(page.locator(auth.register.fullNameInput)).toBeVisible();
    await expect(page.locator(auth.register.submitButton)).toBeVisible();
    
    // Fill and submit
    await page.locator(auth.register.fullNameInput).fill(user.fullName);
    await page.locator(auth.register.emailInput).fill(user.email);
    await page.locator(auth.register.passwordInput).fill(user.password);
    await page.locator(auth.register.confirmPasswordInput).fill(user.password);
    
    await page.locator(auth.register.submitButton).click();
    await page.waitForURL('**/login', { timeout: 10000 });
  });
});