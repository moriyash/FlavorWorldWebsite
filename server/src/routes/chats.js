import express from 'express';
import mongoose from 'mongoose';
import { isMongoConnected } from '../config/database.js';
import PrivateChat from '../models/PrivateChat.js';
import Message from '../models/Message.js';
import User from '../models/User.js';

const router = express.Router();

router.post('/private', async (req, res) => {
  try {
    console.log('=== Create/Get Private Chat ===');
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { otherUserId } = req.body;
    
    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';
    
    if (!otherUserId) {
      return res.status(400).json({ message: 'Other user ID is required' });
    }

    if (currentUserId === otherUserId) {
      return res.status(400).json({ message: 'Cannot chat with yourself' });
    }

    console.log(`Looking for chat between ${currentUserId} and ${otherUserId}`);

    let chat = await PrivateChat.findOne({
      'participants.userId': { $all: [currentUserId, otherUserId] }
    });

    if (!chat) {
      const currentUser = await User.findById(currentUserId);
      const otherUser = await User.findById(otherUserId);

      if (!otherUser) {
        return res.status(404).json({ message: 'Other user not found' });
      }

      chat = new PrivateChat({
        participants: [
          {
            userId: currentUserId,
            userName: currentUser ? currentUser.fullName : 'Unknown User',
            userAvatar: currentUser ? currentUser.avatar : null
          },
          {
            userId: otherUserId,
            userName: otherUser.fullName,
            userAvatar: otherUser.avatar
          }
        ],
        unreadCount: new Map([
          [currentUserId, 0],
          [otherUserId, 0]
        ])
      });

      await chat.save();
      console.log('New private chat created:', chat._id);
    } else {
      console.log('Existing chat found:', chat._id);
    }

    res.json(chat);
  } catch (error) {
    res.status(500).json({ message: 'Failed to create/get private chat' });
  }
});

router.get('/my', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';
    
    console.log('Fetching chats for user:', currentUserId);

    const chats = await PrivateChat.find({
      'participants.userId': currentUserId
    }).sort({ updatedAt: -1 });

    const enrichedChats = chats.map(chat => {
      const otherParticipant = chat.participants.find(p => p.userId !== currentUserId);
      const unreadCount = chat.unreadCount.get(currentUserId) || 0;

      return {
        ...chat.toObject(),
        unreadCount,
        otherUser: otherParticipant
      };
    });

    console.log(`Found ${enrichedChats.length} chats for user`);
    res.json(enrichedChats);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch chats' });
  }
});

router.get('/:chatId/messages', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { chatId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    console.log(`Fetching messages for chat ${chatId}, page ${page}`);

    const messages = await Message.find({ chatId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const orderedMessages = messages.reverse();
    console.log(`Found ${orderedMessages.length} messages`);
    
    res.json(orderedMessages);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

router.post('/:chatId/messages', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { chatId } = req.params;
    const { content, messageType = 'text' } = req.body;
    
    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';

    if (!content || content.trim() === '') {
      return res.status(400).json({ message: 'Message content is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    const chat = await PrivateChat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const isParticipant = chat.participants.some(p => p.userId === currentUserId);
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not authorized to send message to this chat' });
    }

    const sender = await User.findById(currentUserId);
    const senderName = sender ? sender.fullName : 'Unknown User';

    console.log(`Sending message to chat ${chatId} from ${senderName}`);

    const message = new Message({
      chatId,
      senderId: currentUserId,
      senderName,
      content: content.trim(),
      messageType,
      readBy: [{ userId: currentUserId }] 
    });

    await message.save();

    chat.lastMessage = {
      senderId: currentUserId,
      content: content.trim(),
      createdAt: message.createdAt
    };

    chat.participants.forEach(participant => {
      if (participant.userId !== currentUserId) {
        const currentCount = chat.unreadCount.get(participant.userId) || 0;
        chat.unreadCount.set(participant.userId, currentCount + 1);
      }
    });

    await chat.save();

    console.log('Message sent successfully:', message._id);
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: 'Failed to send message' });
  }
});

router.put('/:chatId/read', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { chatId } = req.params;
    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    console.log(`Marking messages as read for user ${currentUserId} in chat ${chatId}`);

    const chat = await PrivateChat.findById(chatId);
    if (chat) {
      chat.unreadCount.set(currentUserId, 0);
      await chat.save();
    }

    await Message.updateMany(
      { 
        chatId, 
        senderId: { $ne: currentUserId },
        'readBy.userId': { $ne: currentUserId }
      },
      { 
        $push: { 
          readBy: { 
            userId: currentUserId, 
            readAt: new Date() 
          } 
        } 
      }
    );

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark as read' });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';

    const chats = await PrivateChat.find({
      'participants.userId': currentUserId
    });

    let totalUnread = 0;
    chats.forEach(chat => {
      totalUnread += chat.unreadCount.get(currentUserId) || 0;
    });

    console.log(`User ${currentUserId} has ${totalUnread} unread messages`);
    res.json({ count: totalUnread });
  } catch (error) {
    res.status(500).json({ count: 0 });
  }
});

export default router;
