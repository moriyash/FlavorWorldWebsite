
import { startMongoMemoryServer, stopMongoMemoryServer } from './tests/helpers/mongoMemoryServer.js';

async function startE2EServer() {
  try {
    console.log('Starting E2E Test Server...\n');

    const mongoUri = await startMongoMemoryServer();
    process.env.MONGODB_E2E_URI = mongoUri;
    process.env.TEST_MODE = 'e2e';
    process.env.PORT = '3000';

    const { app, server } = await import('./src/app.js');
    const { connectDB } = await import('./src/config/database.js');
    
    await connectDB();

    const PORT = 3000;
    server.listen(PORT, () => {
      console.log('E2E Test Server Ready!');
      console.log(`API: http://localhost:${PORT}`);
      console.log(`MongoDB: In-Memory`);
      console.log(`Mode: E2E Testing`);
      console.log('Test endpoints:');
      console.log(`POST http://localhost:${PORT}/api/test/clear-db`);
      console.log(`GET  http://localhost:${PORT}/api/test/db-status`);
      console.log('Press Ctrl+C to stop\n');
    });

    process.on('SIGINT', async () => {
      console.log('Shutting down E2E server...');
      server.close();
      await stopMongoMemoryServer();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Shutting down E2E server...');
      server.close();
      await stopMongoMemoryServer();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start E2E server:', error);
    process.exit(1);
  }
}

startE2EServer();