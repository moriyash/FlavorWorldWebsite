import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);
let io;
if (process.env.NODE_ENV !== 'test') {
  io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  console.log('Socket.IO initialized');
} else {
  io = {
    on: () => {},
    emit: () => {},
    to: () => ({ emit: () => {} })
  };
  console.log(' Socket.IO mocked for tests');
}

const allowedOrigins = [
  'http://localhost:5173', 
  'http://localhost:3000', 
  'http://localhost:3001',
  'https://flavorworldwebsiteclient.onrender.com'
];
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    return cors()(req, res, next);
  }
  next();
});app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
  req.io = io;
  next();
});

if (process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path} - Content-Type: ${req.headers['content-type']}`);
    next();
  });
}

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import recipeRoutes from './routes/recipes.js';
import groupRoutes from './routes/groups.js';
import groupPostRoutes from './routes/groupPosts.js';
import chatRoutes from './routes/chats.js';
import groupChatRoutes from './routes/groupChats.js';
import notificationRoutes from './routes/notifications.js';
import feedRoutes from './routes/feed.js';
import uploadRoutes from './routes/upload.js';

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/users', userRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/groups', groupPostRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/group-chats', groupChatRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/following', feedRoutes);
app.use('/api/upload', uploadRoutes);

if (process.env.NODE_ENV !== 'test') {
  const { default: socketHandlers } = await import('./socket/socketHandlers.js');
  socketHandlers(io);
  console.log('Notifications activated for all user actions');
}

app.get('/', (req, res) => {
  res.send('Recipe Social Network API Server is running');
});

app.get('/api/health', async (req, res) => {
  const { isMongoConnected } = await import('./config/database.js');
  res.json({
    status: 'OK',
    environment: process.env.NODE_ENV || 'development',
    mongoConnected: isMongoConnected(),
    timestamp: new Date().toISOString()
  });
});

if (process.env.NODE_ENV !== 'production') {
  app.get('/api/test-delete', async (req, res) => {
    const { default: User } = await import('./models/User.js');
    const { default: Recipe } = await import('./models/Recipe.js');
    const { default: Group } = await import('./models/Group.js');
    const { default: GroupPost } = await import('./models/GroupPost.js');
    const { default: PrivateChat } = await import('./models/PrivateChat.js');
    const { default: Message } = await import('./models/Message.js');
    const { default: GroupChat } = await import('./models/GroupChat.js');
    const { default: GroupChatMessage } = await import('./models/GroupChatMessage.js');
    const { default: Notification } = await import('./models/Notification.js');
    
    res.json({
      success: true,
      message: 'Delete endpoints are available',
      endpoints: [
        'DELETE /api/auth/delete-account',
        'DELETE /api/user/delete',
        'DELETE /api/auth/delete-user'
      ],
      modelsAvailable: {
        User: !!User,
        Recipe: !!Recipe,
        Group: !!Group,
        GroupPost: !!GroupPost,
        PrivateChat: !!PrivateChat,
        Message: !!Message,
        GroupChat: !!GroupChat,
        GroupChatMessage: !!GroupChatMessage,
        Notification: !!Notification
      },
      timestamp: new Date()
    });
  });
}

if (process.env.TEST_MODE === 'e2e' || process.env.NODE_ENV === 'test') {
  (async () => {
    try {
      const testRoutes = await import('./routes/test.js');
      app.use('/api/test', testRoutes.default);
      console.log('Test endpoints loaded at /api/test');
    } catch (err) {
      console.error('Failed to load test routes:', err.message);
    }
  })();
}

app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong!'
      : error.message
  });
});

export { app, server, io };