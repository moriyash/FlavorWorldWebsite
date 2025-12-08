import mongoose from 'mongoose';

let isConnected = false;

const getMongoURI = () => {
  if (process.env.TEST_MODE === 'e2e') {
    const uri = process.env.MONGODB_E2E_URI || 'mongodb://127.0.0.1:27017/flavorworld-e2e';
    console.log('Using E2E Test Database');
    return uri;
  }
  
  if (process.env.NODE_ENV === 'test') {
    const uri = process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/flavorworld-test';
    console.log('Using Unit Test Database');
    return uri;
  }
  
  if (process.env.MONGODB_URI) {
    console.log('Using Production/Development Database (Atlas)');
    return process.env.MONGODB_URI;
  }
  
  console.log('⚠️  No MONGODB_URI found - using Default Local Database');
  return 'mongodb://127.0.0.1:27017/flavorworld';
};

const connectDB = async () => {
  try {
    if (isConnected) {
      console.log('MongoDB already connected');
      return;
    }

    const MONGODB_URI = getMongoURI();

    if (!MONGODB_URI) {
      console.log('MONGODB_URI not found - running without database');
      return;
    }

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 300000, 
      maxPoolSize: 10,
      minPoolSize: 2,
    });

    isConnected = true;
    console.log(' MongoDB Connected Successfully!');
    console.log(` Database: ${mongoose.connection.db.databaseName}`);
    
    if (process.env.TEST_MODE === 'e2e') {
      console.log(' E2E Test Mode - Using isolated test database');
      console.log('Your production data is safe!');
    }
    
  } catch (err) {
    console.error(' MongoDB Connection Error:', err.message);
    isConnected = false;
    
    if (process.env.TEST_MODE === 'e2e' || process.env.NODE_ENV === 'test') {
      throw err;
    }
  }
};

const isMongoConnected = () => {
  return mongoose.connection.readyState === 1;
};

const clearTestDB = async () => {
  if (process.env.TEST_MODE !== 'e2e' && process.env.NODE_ENV !== 'test') {
    throw new Error('clearTestDB can only be used in test mode!');
  }
  
  const dbName = mongoose.connection.db.databaseName;
  if (!dbName.includes('test') && !dbName.includes('e2e')) {
    throw new Error(`Cannot clear database "${dbName}" - not a test database!`);
  }
  
  try {
    const collections = mongoose.connection.collections;
    
    let clearedCount = 0;
    for (const key in collections) {
      const result = await collections[key].deleteMany({});
      clearedCount += result.deletedCount || 0;
    }
    
    console.log(`Test database cleared (${clearedCount} documents deleted)`);
    return { success: true, deletedCount: clearedCount };
  } catch (error) {
    console.error('Error clearing test database:', error.message);
    throw error;
  }
};

const disconnectDB = async () => {
  try {
    if (isConnected) {
      await mongoose.connection.close();
      isConnected = false;
      console.log('MongoDB disconnected');
    }
  } catch (error) {
    console.error('Error disconnecting MongoDB:', error.message);
  }
};

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await disconnectDB();
  process.exit(0);
});

export { connectDB, isMongoConnected, disconnectDB, clearTestDB };
export default connectDB;