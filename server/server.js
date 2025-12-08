import dotenv from 'dotenv';

dotenv.config();

import { app, server } from './src/app.js';
import { connectDB, isMongoConnected } from './src/config/database.js';

if (process.env.NODE_ENV !== 'test') {
  await connectDB();
}

if (process.env.NODE_ENV !== 'test') {
  const PORT = process.env.PORT || 3000;

  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`MongoDB status: ${isMongoConnected() ? 'Connected' : 'Disconnected'}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    if (process.env.TEST_MODE === 'e2e') {
      console.log('E2E Test Mode Active');
      console.log(`Using database: ${process.env.MONGODB_E2E_URI?.split('/').pop() || 'flavorworld-e2e'}`);
    }
  });
} else {
  console.log('Running in TEST mode - server and DB managed by tests');
}

export { app, server };