import mongoose from 'mongoose';
import { isMongoConnected } from '../config/database.js';
import Message from '../models/Message.js';
import GroupChatMessage from '../models/GroupChatMessage.js';
import PrivateChat from '../models/PrivateChat.js';
import GroupChat from '../models/GroupChat.js';
import User from '../models/User.js';

export default (io) => {
  io.on('connection', (socket) => {
    console.log(' User connected:', socket.id);
    
    
    socket.on('join_chat', (chatId) => {
      socket.join(chatId);
      console.log(` User joined chat: ${chatId}`);
    });

    socket.on('leave_chat', (chatId) => {
      socket.leave(chatId);
      console.log(` User left chat: ${chatId}`);
    });

    socket.on('load_messages', async (chatId) => {
      try {
        if (!isMongoConnected()) {
          socket.emit('error', { message: 'Database not available' });
          return;
        }

        if (!mongoose.Types.ObjectId.isValid(chatId)) {
          socket.emit('error', { message: 'Invalid chat ID' });
          return;
        }

        const messages = await Message.find({ chatId })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();

        const orderedMessages = messages.reverse();
        socket.emit('messages_loaded', { chatId, messages: orderedMessages });
        console.log(` Sent ${orderedMessages.length} messages to client`);
      } catch (error) {
        console.error('Error loading messages:', error);
        socket.emit('error', { message: 'Failed to load messages' });
      }
    });
    
    socket.on('send_message', async (data, callback) => {
      try {
        if (!isMongoConnected()) {
          callback({ success: false, message: 'Database not available' });
          return;
        }

        const { chatId, content, messageType = 'text', senderId } = data;

        if (!content || content.trim() === '') {
          callback({ success: false, message: 'Message content is required' });
          return;
        }

        if (!mongoose.Types.ObjectId.isValid(chatId)) {
          callback({ success: false, message: 'Invalid chat ID' });
          return;
        }

        const chat = await PrivateChat.findById(chatId);
        if (!chat) {
          callback({ success: false, message: 'Chat not found' });
          return;
        }

        const isParticipant = chat.participants.some(p => p.userId === senderId);
        if (!isParticipant) {
          callback({ success: false, message: 'Not authorized' });
          return;
        }

        const sender = await User.findById(senderId);
        const senderName = sender ? sender.fullName : 'Unknown User';

        console.log(` Sending message to chat ${chatId} from ${senderName}`);

        const message = new Message({
          chatId,
          senderId,
          senderName,
          content: content.trim(),
          messageType,
          readBy: [{ userId: senderId }]
        });

        await message.save();

        chat.lastMessage = {
          senderId,
          content: content.trim(),
          createdAt: message.createdAt
        };

        chat.participants.forEach(participant => {
          if (participant.userId !== senderId) {
            const currentCount = chat.unreadCount.get(participant.userId) || 0;
            chat.unreadCount.set(participant.userId, currentCount + 1);
          }
        });

        await chat.save();

        io.to(chatId).emit('message_received', message);
        callback({ success: true, data: message });
        console.log(' Message sent successfully:', message._id);
      } catch (error) {
        console.error('Socket send_message error:', error);
        callback({ success: false, message: 'Failed to send message' });
      }
    });

    socket.on('mark_as_read', async (data) => {
      try {
        const { chatId, userId } = data;
        
        if (!mongoose.Types.ObjectId.isValid(chatId)) {
          return;
        }

        const chat = await PrivateChat.findById(chatId);
        if (chat) {
          chat.unreadCount.set(userId, 0);
          await chat.save();
          
          io.to(chatId).emit('messages_marked_read', { chatId, userId });
          console.log(` Messages marked as read for user ${userId}`);
        }
      } catch (error) {
        console.error('Error marking as read:', error);
      }
    });

    socket.on('start_typing', (data) => {
      const { chatId, userId } = data;
      socket.to(chatId).emit('typing_started', { chatId, userId });
      console.log(` User ${userId} started typing`);
    });

    socket.on('stop_typing', (data) => {
      const { chatId, userId } = data;
      socket.to(chatId).emit('typing_stopped', { chatId, userId });
      console.log(` User ${userId} stopped typing`);
    });


    socket.on('join_group_chat', (chatId) => {
      socket.join(chatId);
      console.log(` User joined group chat: ${chatId}`);
    });

    socket.on('leave_group_chat', (chatId) => {
      socket.leave(chatId);
      console.log(` User left group chat: ${chatId}`);
    });

    socket.on('load_group_messages', async (chatId) => {
      try {
        if (!isMongoConnected()) {
          socket.emit('error', { message: 'Database not available' });
          return;
        }

        if (!mongoose.Types.ObjectId.isValid(chatId)) {
          socket.emit('error', { message: 'Invalid chat ID' });
          return;
        }

        const messages = await GroupChatMessage.find({ groupChatId: chatId })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();

        const orderedMessages = messages.reverse();
        socket.emit('group_messages_loaded', { chatId, messages: orderedMessages });
        console.log(` Sent ${orderedMessages.length} group messages to client`);
      } catch (error) {
        console.error('Error loading group messages:', error);
        socket.emit('error', { message: 'Failed to load group messages' });
      }
    });

    socket.on('send_group_message', async (data, callback) => {
      try {
        if (!isMongoConnected()) {
          callback({ success: false, message: 'Database not available' });
          return;
        }

        const { chatId, content, messageType = 'text', senderId } = data;

        if (!content || content.trim() === '') {
          callback({ success: false, message: 'Message content is required' });
          return;
        }

        if (!mongoose.Types.ObjectId.isValid(chatId)) {
          callback({ success: false, message: 'Invalid chat ID' });
          return;
        }

        const groupChat = await GroupChat.findById(chatId);
        if (!groupChat) {
          callback({ success: false, message: 'Group chat not found' });
          return;
        }

        const participant = groupChat.participants.find(p => p.userId === senderId);
        if (!participant) {
          callback({ success: false, message: 'Not authorized' });
          return;
        }

        console.log(` Sending group message to chat ${chatId} from ${participant.userName}`);

        const message = new GroupChatMessage({
          groupChatId: chatId,
          senderId,
          senderName: participant.userName,
          senderAvatar: participant.userAvatar,
          content: content.trim(),
          messageType,
          readBy: [{ userId: senderId }]
        });

        await message.save();

        groupChat.lastMessage = {
          senderId,
          senderName: participant.userName,
          content: content.trim(),
          messageType,
          createdAt: message.createdAt
        };

        groupChat.participants.forEach(p => {
          if (p.userId !== senderId) {
            const currentCount = groupChat.unreadCount.get(p.userId) || 0;
            groupChat.unreadCount.set(p.userId, currentCount + 1);
          }
        });

        await groupChat.save();

        io.to(chatId).emit('group_message_received', message);
        callback({ success: true, data: message });
        console.log(' Group message sent successfully:', message._id);
      } catch (error) {
        console.error('Socket send_group_message error:', error);
        callback({ success: false, message: 'Failed to send group message' });
      }
    });

    socket.on('mark_group_as_read', async (data) => {
      try {
        const { chatId, userId } = data;
        
        if (!mongoose.Types.ObjectId.isValid(chatId)) {
          return;
        }

        const groupChat = await GroupChat.findById(chatId);
        if (groupChat) {
          groupChat.unreadCount.set(userId, 0);
          await groupChat.save();
          
          io.to(chatId).emit('group_messages_marked_read', { chatId, userId });
          console.log(` Group messages marked as read for user ${userId}`);
        }
      } catch (error) {
        console.error('Error marking group as read:', error);
      }
    });

    socket.on('start_group_typing', (data) => {
      const { chatId, userId, userName } = data;
      socket.to(chatId).emit('group_typing_started', { chatId, userId, userName });
      console.log(` User ${userName} started typing in group chat ${chatId}`);
    });

    socket.on('stop_group_typing', (data) => {
      const { chatId, userId } = data;
      socket.to(chatId).emit('group_typing_stopped', { chatId, userId });
      console.log(` User ${userId} stopped typing in group chat ${chatId}`);
    });

   

    socket.on('disconnect', () => {
      console.log(' User disconnected:', socket.id);
    });
  });
};