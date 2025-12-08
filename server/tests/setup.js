import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { beforeAll, afterAll, afterEach, vi } from 'vitest';

import dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

let mongoServer;

if (process.env.NODE_ENV !== 'test') {
  console.warn('Warning: Tests should run with NODE_ENV=test');
  process.env.NODE_ENV = 'test';
}

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  
  await mongoose.connect(mongoUri);
  
  console.log('Test DB connected');
  console.log(`MongoDB URI: ${mongoUri}`);
}, 60000);

afterEach(async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
    vi.clearAllMocks();
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  
  if (mongoServer) {
    await mongoServer.stop();
  }
  
  console.log('Test DB disconnected');
}, 60000);