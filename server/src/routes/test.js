import express from 'express';
import { clearTestDB, isMongoConnected } from '../config/database.js';

const router = express.Router();

if (process.env.TEST_MODE === 'e2e' || process.env.NODE_ENV === 'test') {
  
  router.post('/clear-db', async (req, res) => {
    try {
      if (!isMongoConnected()) {
        return res.status(503).json({ 
          success: false, 
          message: 'Database not connected' 
        });
      }
      
      const result = await clearTestDB();
      res.json({ 
        success: true, 
        message: 'Test database cleared',
        deletedCount: result.deletedCount
      });
    } catch (error) {
      console.error('Clear DB error:', error);
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  });
  
  router.get('/db-status', async (req, res) => {
    const dbName = isMongoConnected() 
      ? global.mongoose?.connection?.db?.databaseName 
      : 'Not connected';
      
    res.json({
      connected: isMongoConnected(),
      database: dbName,
      mode: process.env.TEST_MODE || process.env.NODE_ENV
    });
  });
  
  console.log('Test endpoints enabled at /api/test');
  
} else {
  router.all('*', (req, res) => {
    res.status(403).json({ 
      success: false,
      message: 'Test endpoints only available in test mode' 
    });
  });
}

export default router;