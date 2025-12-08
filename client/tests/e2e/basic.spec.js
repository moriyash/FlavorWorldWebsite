import { test, expect } from '@playwright/test';
import { 
  setupE2ETest, 
  cleanupE2ETest,
  checkDatabaseStatus,
  generateTestUser,
  registerUser
} from './helpers/setup.js';

test.describe('Basic E2E Setup Tests', () => {
  
  test.beforeAll(async () => {
    await setupE2ETest();
  });

  test.afterAll(async () => {
    await cleanupE2ETest();
  });

  test('should verify test database is connected', async () => {
    const status = await checkDatabaseStatus();
    
    expect(status).toBeDefined();
    expect(status.connected).toBe(true);
    
    if (status.database) {
      expect(status.database).toMatch(/e2e|test/i);
      console.log('Test database verified:', status.database);
    } else {
      console.log('Database name not provided by server (this is OK)');
    }
    
    expect(status.mode).toBe('e2e');
  });

  test('should register a test user via API', async () => {
    const testUser = generateTestUser();
    const result = await registerUser(testUser);
    
    expect(result.success).toBe(true);
    expect(result.user).toBeDefined();
    expect(result.user.email).toBe(testUser.email.toLowerCase());
    expect(result.token).toBeDefined();
    
    console.log('User registered successfully');
  });

  test('should load frontend homepage', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.waitForLoadState('networkidle');
    
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    
    console.log('Frontend loaded:', title);
  });
});