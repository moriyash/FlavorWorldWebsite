import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod = null;

export async function startMongoMemoryServer() {
  console.log('Starting MongoDB Memory Server...');
  
  mongod = await MongoMemoryServer.create({
    instance: {
      port: 27017,
      dbName: 'flavorworld-e2e'
    }
  });

  const uri = mongod.getUri();
  console.log('MongoDB Memory Server started at:', uri);
  
  return uri;
}

export async function stopMongoMemoryServer() {
  if (mongod) {
    console.log('Stopping MongoDB Memory Server...');
    await mongoose.disconnect();
    await mongod.stop();
    mongod = null;
    console.log('MongoDB Memory Server stopped');
  }
}

export async function clearDatabase() {
  if (mongoose.connection.readyState !== 1) {
    console.warn('Database not connected');
    return;
  }

  const collections = mongoose.connection.collections;
  let totalDeleted = 0;

  for (const key in collections) {
    const result = await collections[key].deleteMany({});
    totalDeleted += result.deletedCount || 0;
  }

  console.log(`Database cleared (${totalDeleted} documents deleted)`);
  return totalDeleted;
}

export default {
  start: startMongoMemoryServer,
  stop: stopMongoMemoryServer,
  clear: clearDatabase
};