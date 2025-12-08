const API_URL = 'http://localhost:3000/api';

export async function clearTestDatabase() {
  try {
    const response = await fetch(`${API_URL}/test/clear-db`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.warn('Failed to clear test database:', error.message);
      return false;
    }
    
    const data = await response.json();
    console.log(`Test database cleared (${data.deletedCount} documents deleted)`);
    return true;
  } catch (error) {
    console.error('Error clearing test database:', error.message);
    return false;
  }
}

export async function checkDatabaseStatus() {
  try {
    const response = await fetch(`${API_URL}/test/db-status`);
    
    if (!response.ok) {
      console.error('Failed to check database status');
      return null;
    }
    
    const data = await response.json();
    console.log('Database Status:', {
      connected: data.connected ? 'yes' : 'no',
      database: data.database,
      mode: data.mode
    });
    
    return data;
  } catch (error) {
    console.error('Error checking database status:', error.message);
    return null;
  }
}

export function generateTestUser(prefix = 'e2e') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  
  return {
    fullName: `${prefix.toUpperCase()} Test User ${random}`,
    email: `${prefix}-test-${timestamp}-${random}@test.com`,
    password: 'Test1234!',
    confirmPassword: 'Test1234!',
    bio: `Test user created at ${new Date().toISOString()}`
  };
}

export function generateTestRecipe(prefix = 'e2e') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  
  return {
    title: `${prefix.toUpperCase()} Test Recipe ${random}`,
    description: `A delicious test recipe created at ${timestamp}`,
    ingredients: `Test ingredient 1\nTest ingredient 2\nTest ingredient 3`,
    instructions: `Step 1: Test step\nStep 2: Another test step\nStep 3: Final step`,
    category: 'Italian',
    meatType: 'Mixed',
    prepTime: 30,
    servings: 4
  };
}

export function generateTestGroup(prefix = 'e2e') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  
  return {
    name: `${prefix.toUpperCase()} Test Group ${random}`,
    description: `A test group created at ${timestamp}`,
    category: 'General',
    isPrivate: false
  };
}

export async function waitForDatabase(maxAttempts = 30, delayMs = 1000) {
  console.log('Waiting for database to be ready...');
  
  for (let i = 0; i < maxAttempts; i++) {
    const status = await checkDatabaseStatus();
    
    if (status && status.connected) {
      console.log('Database is ready!');
      return true;
    }
    
    if (i < maxAttempts - 1) {
      console.log(`Attempt ${i + 1}/${maxAttempts} - waiting ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw new Error(`Database not ready after ${maxAttempts} attempts`);
}

export async function waitForServer(maxAttempts = 30, delayMs = 1000) {
  console.log('Waiting for server to be ready...');
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://localhost:3000/api/health`, {
        method: 'GET'
      });
      
      if (response.ok) {
        console.log('Server is ready!');
        return true;
      }
    } catch (error) {
    }
    
    if (i < maxAttempts - 1) {
      console.log(`Attempt ${i + 1}/${maxAttempts} - waiting ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw new Error(`Server not ready after ${maxAttempts} attempts`);
}

export async function registerUser(userData) {
  try {
    console.log('📤 Registering user:', userData.email);
    console.log('📤 Data being sent:', JSON.stringify(userData, null, 2));
    
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(userData)
    });
    
    console.log(' Response status:', response.status);
    
    const data = await response.json();
    console.log(' Response data:', JSON.stringify(data, null, 2));
    
    if (!response.ok) {
      console.error(' Registration failed:', data.message);
      return {
        success: false,
        error: data.message || 'Registration failed',
        message: data.message
      };
    }
    
    console.log(' User registered:', userData.email);
    
    return {
      success: true,
      user: data.user,
      token: data.token
    };
  } catch (error) {
    console.error(' Registration exception:', error.message);
    return {
      success: false,
      error: error.message,
      message: error.message
    };
  }
}

export async function loginUser(email, password) {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.message || 'Login failed'
      };
    }
    
    const data = await response.json();
    console.log('User logged in:', email);
    
    return {
      success: true,
      user: data.user,
      token: data.token
    };
  } catch (error) {
    console.error('Login error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function setupE2ETest() {
  console.log(' Setting up E2E test environment...\n');
  
  await waitForServer();
  await waitForDatabase();
  await clearTestDatabase();
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  console.log(' E2E test environment ready!\n');
}

export async function cleanupE2ETest() {
  console.log(' Cleaning up E2E test environment...\n');
  
  await clearTestDatabase();
  
  console.log(' Cleanup complete!\n');
}