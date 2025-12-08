import express from 'express';
import mongoose from 'mongoose';
import { isMongoConnected } from '../config/database.js';
import GroupChat from '../models/GroupChat.js';
import GroupChatMessage from '../models/GroupChatMessage.js';
import PrivateChat from '../models/PrivateChat.js';
import User from '../models/User.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    console.log('=== Creating Group Chat ===');
    
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { name, description, participants, creatorId } = req.body;
    
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Group chat name is required' });
    }

    if (!creatorId) {
      return res.status(400).json({ message: 'Creator ID is required' });
    }

    if (!participants || participants.length === 0) {
      return res.status(400).json({ message: 'At least one participant is required' });
    }

    console.log('Creating group chat:', name, 'with', participants.length, 'participants');

    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ message: 'Creator not found' });
    }

    const chatParticipants = [{
      userId: creatorId,
      userName: creator.fullName,
      userAvatar: creator.avatar,
      role: 'admin',
      joinedAt: new Date()
    }];

    for (const participantId of participants) {
      if (participantId !== creatorId) { 
        const user = await User.findById(participantId);
        if (user) {
          chatParticipants.push({
            userId: participantId,
            userName: user.fullName,
            userAvatar: user.avatar,
            role: 'member',
            joinedAt: new Date()
          });
        }
      }
    }

    const groupChat = new GroupChat({
      name: name.trim(),
      description: description || '',
      adminId: creatorId,
      participants: chatParticipants,
      unreadCount: new Map(chatParticipants.map(p => [p.userId, 0])),
      settings: {
        allowMemberInvites: false,
        allowNameChange: true,
        allowMemberLeave: true
      }
    });

    await groupChat.save();

    const systemMessage = new GroupChatMessage({
      groupChatId: groupChat._id,
      senderId: 'system',
      senderName: 'System',
      content: `${creator.fullName} created the group`,
      messageType: 'system',
      isSystemMessage: true,
      systemMessageType: 'group_created',
      readBy: chatParticipants.map(p => ({ userId: p.userId }))
    });

    await systemMessage.save();

    console.log('Group chat created successfully:', groupChat._id);
    res.status(201).json(groupChat);

  } catch (error) {
    res.status(500).json({ message: 'Failed to create group chat' });
  }
});

router.get('/my', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';
    
    console.log('Fetching group chats for user:', currentUserId);

    const groupChats = await GroupChat.find({
      'participants.userId': currentUserId
    }).sort({ updatedAt: -1 });

    const enrichedChats = groupChats.map(chat => {
      const unreadCount = chat.unreadCount.get(currentUserId) || 0;
      const isAdmin = chat.adminId === currentUserId;

      return {
        ...chat.toObject(),
        unreadCount,
        isAdmin,
        participantsCount: chat.participants.length,
        type: 'group' 
      };
    });

    console.log(`Found ${enrichedChats.length} group chats for user`);
    res.json(enrichedChats);

  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch group chats' });
  }
});

router.get('/:chatId', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { chatId } = req.params;
    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    const groupChat = await GroupChat.findById(chatId);
    if (!groupChat) {
      return res.status(404).json({ message: 'Group chat not found' });
    }

    const isParticipant = groupChat.participants.some(p => p.userId === currentUserId);
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not authorized to access this chat' });
    }

    const isAdmin = groupChat.adminId === currentUserId;
    const unreadCount = groupChat.unreadCount.get(currentUserId) || 0;

    const enrichedChat = {
      ...groupChat.toObject(),
      isAdmin,
      unreadCount,
      participantsCount: groupChat.participants.length,
      type: 'group'
    };

    res.json(enrichedChat);

  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch group chat' });
  }
});

router.get('/:chatId/messages', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { chatId } = req.params;
    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(chatId)) {
      return res.status(400).json({ message: 'Invalid chat ID' });
    }

    const groupChat = await GroupChat.findById(chatId);
    if (!groupChat) {
      return res.status(404).json({ message: 'Group chat not found' });
    }

    const isParticipant = groupChat.participants.some(p => p.userId === currentUserId);
    if (!isParticipant) {
      return res.status(403).json({ message: 'Not authorized to access this chat' });
    }

    console.log(`Fetching messages for group chat ${chatId}, page ${page}`);

    const messages = await GroupChatMessage.find({ groupChatId: chatId })
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

    const groupChat = await GroupChat.findById(chatId);
    if (!groupChat) {
      return res.status(404).json({ message: 'Group chat not found' });
    }

    const participant = groupChat.participants.find(p => p.userId === currentUserId);
    if (!participant) {
      return res.status(403).json({ message: 'Not authorized to send message to this chat' });
    }

    console.log(`Sending message to group chat ${chatId} from ${participant.userName}`);

    const message = new GroupChatMessage({
      groupChatId: chatId,
      senderId: currentUserId,
      senderName: participant.userName,
      senderAvatar: participant.userAvatar,
      content: content.trim(),
      messageType,
      readBy: [{ userId: currentUserId }] 
    });

    await message.save();

    groupChat.lastMessage = {
      senderId: currentUserId,
      senderName: participant.userName,
      content: content.trim(),
      messageType,
      createdAt: message.createdAt
    };

    groupChat.participants.forEach(p => {
      if (p.userId !== currentUserId) {
        const currentCount = groupChat.unreadCount.get(p.userId) || 0;
        groupChat.unreadCount.set(p.userId, currentCount + 1);
      }
    });

    await groupChat.save();

    console.log('Message sent successfully to group chat:', message._id);
    res.status(201).json(message);

  } catch (error) {
    res.status(500).json({ message: 'Failed to send message' });
  }
});

router.post('/:chatId/participants', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { chatId } = req.params;
    const { userIds } = req.body; 
    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs array is required' });
    }

    const groupChat = await GroupChat.findById(chatId);
    if (!groupChat) {
      return res.status(404).json({ message: 'Group chat not found' });
    }

    if (groupChat.adminId !== currentUserId) {
      return res.status(403).json({ message: 'Only admin can add participants' });
    }

    const newParticipants = [];
    const addedUsers = [];

    for (const userId of userIds) {
      const isAlreadyParticipant = groupChat.participants.some(p => p.userId === userId);
      if (isAlreadyParticipant) {
        continue;
      }

      const user = await User.findById(userId);
      if (user) {
        const newParticipant = {
          userId,
          userName: user.fullName,
          userAvatar: user.avatar,
          role: 'member',
          joinedAt: new Date()
        };

        newParticipants.push(newParticipant);
        addedUsers.push(user.fullName);
        
        groupChat.unreadCount.set(userId, 0);
      }
    }

    if (newParticipants.length === 0) {
      return res.status(400).json({ message: 'No new participants to add' });
    }

    groupChat.participants.push(...newParticipants);
    await groupChat.save();

    const admin = groupChat.participants.find(p => p.userId === currentUserId);
    const systemMessage = new GroupChatMessage({
      groupChatId: chatId,
      senderId: 'system',
      senderName: 'System',
      content: `${admin.userName} added ${addedUsers.join(', ')} to the group`,
      messageType: 'system',
      isSystemMessage: true,
      systemMessageType: 'users_added',
      readBy: groupChat.participants.map(p => ({ userId: p.userId }))
    });

    await systemMessage.save();

    console.log(`Added ${newParticipants.length} participants to group chat`);
    res.json({ 
      message: `Added ${newParticipants.length} participants`,
      addedParticipants: newParticipants
    });

  } catch (error) {
    res.status(500).json({ message: 'Failed to add participants' });
  }
});

router.delete('/:chatId/participants/:userId', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { chatId, userId } = req.params;
    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';

    const groupChat = await GroupChat.findById(chatId);
    if (!groupChat) {
      return res.status(404).json({ message: 'Group chat not found' });
    }

    if (groupChat.adminId !== currentUserId) {
      return res.status(403).json({ message: 'Only admin can remove participants' });
    }

    if (userId === currentUserId) {
      return res.status(400).json({ message: 'Admin cannot remove themselves. Use leave group instead.' });
    }

    const participantIndex = groupChat.participants.findIndex(p => p.userId === userId);
    if (participantIndex === -1) {
      return res.status(404).json({ message: 'Participant not found' });
    }

    const removedParticipant = groupChat.participants[participantIndex];
    
    groupChat.participants.splice(participantIndex, 1);
    groupChat.unreadCount.delete(userId);
    await groupChat.save();

    const admin = groupChat.participants.find(p => p.userId === currentUserId);
    const systemMessage = new GroupChatMessage({
      groupChatId: chatId,
      senderId: 'system',
      senderName: 'System',
      content: `${admin.userName} removed ${removedParticipant.userName} from the group`,
      messageType: 'system',
      isSystemMessage: true,
      systemMessageType: 'user_removed',
      readBy: groupChat.participants.map(p => ({ userId: p.userId }))
    });

    await systemMessage.save();

    console.log(`Removed participant ${removedParticipant.userName} from group chat`);
    res.json({ 
      message: 'Participant removed successfully',
      removedParticipant: removedParticipant.userName
    });

  } catch (error) {
    res.status(500).json({ message: 'Failed to remove participant' });
  }
});

router.delete('/:chatId/leave', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { chatId } = req.params;
    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';

    const groupChat = await GroupChat.findById(chatId);
    if (!groupChat) {
      return res.status(404).json({ message: 'Group chat not found' });
    }

    const participantIndex = groupChat.participants.findIndex(p => p.userId === currentUserId);
    if (participantIndex === -1) {
      return res.status(404).json({ message: 'Not a participant in this chat' });
    }

    const leavingParticipant = groupChat.participants[participantIndex];
    const isAdmin = groupChat.adminId === currentUserId;

    groupChat.participants.splice(participantIndex, 1);
    groupChat.unreadCount.delete(currentUserId);

    if (isAdmin && groupChat.participants.length > 0) {
      const randomIndex = Math.floor(Math.random() * groupChat.participants.length);
      const newAdmin = groupChat.participants[randomIndex];
      
      groupChat.adminId = newAdmin.userId;
      newAdmin.role = 'admin';

      console.log(`Admin left, new admin is: ${newAdmin.userName}`);

      const adminChangeMessage = new GroupChatMessage({
        groupChatId: chatId,
        senderId: 'system',
        senderName: 'System',
        content: `${newAdmin.userName} is now the group admin`,
        messageType: 'system',
        isSystemMessage: true,
        systemMessageType: 'admin_changed',
        readBy: groupChat.participants.map(p => ({ userId: p.userId }))
      });

      await adminChangeMessage.save();
    }

    if (groupChat.participants.length === 0) {
      await GroupChat.findByIdAndDelete(chatId);
      await GroupChatMessage.deleteMany({ groupChatId: chatId });
      
      console.log('Group chat deleted - no participants left');
      return res.json({ message: 'Left group chat successfully. Group was deleted.' });
    }

    await groupChat.save();

    const systemMessage = new GroupChatMessage({
      groupChatId: chatId,
      senderId: 'system',
      senderName: 'System',
      content: `${leavingParticipant.userName} left the group`,
      messageType: 'system',
      isSystemMessage: true,
      systemMessageType: 'user_left',
      readBy: groupChat.participants.map(p => ({ userId: p.userId }))
    });

    await systemMessage.save();

    console.log(`User ${leavingParticipant.userName} left group chat`);
    res.json({ message: 'Left group chat successfully' });

  } catch (error) {
    res.status(500).json({ message: 'Failed to leave group chat' });
  }
});

router.put('/:chatId', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const { chatId } = req.params;
    const { 
      name, 
      description, 
      image, 
      allowNameChange, 
      allowImageChange, 
      allowMemberInvites 
    } = req.body;
    
    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';

    console.log('Updating group chat:', chatId);
    console.log('Requested by:', currentUserId);
    console.log('Update fields:', Object.keys(req.body));

    const groupChat = await GroupChat.findById(chatId);
    if (!groupChat) {
      console.log('Group chat not found');
      return res.status(404).json({ message: 'Group chat not found' });
    }

    const participant = groupChat.participants.find(p => p.userId === currentUserId);
    if (!participant) {
      console.log('User not authorized - not a participant');
      return res.status(403).json({ message: 'Not authorized to modify this chat' });
    }

    const isAdmin = groupChat.adminId === currentUserId;
    console.log('User permissions:', { isAdmin, participantRole: participant.role });

    if (!groupChat.settings) {
      groupChat.settings = {
        allowMemberInvites: false,
        allowNameChange: true,
        allowImageChange: true,
        allowMemberLeave: true
      };
    }

    const oldName = groupChat.name;
    let changes = [];

    if (name && name.trim() !== groupChat.name) {
      const canChangeName = groupChat.settings.allowNameChange || isAdmin;
      if (!canChangeName) {
        console.log(' Permission denied for name change');
        return res.status(403).json({ message: 'Only admin can change group name when member editing is disabled' });
      }
      groupChat.name = name.trim();
      changes.push(`name changed from "${oldName}" to "${name.trim()}"`);
      console.log('Name updated:', name.trim());
    }

    if (description !== undefined && description !== groupChat.description) {
      const canChangeDescription = groupChat.settings.allowNameChange || isAdmin;
      if (!canChangeDescription) {
        console.log('Permission denied for description change');
        return res.status(403).json({ message: 'Only admin can change group description when member editing is disabled' });
      }
      groupChat.description = description;
      changes.push('description updated');
      console.log('Description updated');
    }

    if (image !== undefined && image !== groupChat.image) {
      const canChangeImage = groupChat.settings.allowImageChange !== false || isAdmin;
      if (!canChangeImage) {
        console.log('Permission denied for image change');
        return res.status(403).json({ message: 'Only admin can change group image when member editing is disabled' });
      }
      groupChat.image = image;
      changes.push(image ? 'image updated' : 'image removed');
      console.log('Image updated:', image ? 'new image set' : 'image removed');
    }

    if (allowNameChange !== undefined && isAdmin) {
      groupChat.settings.allowNameChange = allowNameChange;
      changes.push(`member name editing ${allowNameChange ? 'enabled' : 'disabled'}`);
      console.log('allowNameChange updated:', allowNameChange);
    }

    if (allowImageChange !== undefined && isAdmin) {
      groupChat.settings.allowImageChange = allowImageChange;
      changes.push(`member image editing ${allowImageChange ? 'enabled' : 'disabled'}`);
      console.log('allowImageChange updated:', allowImageChange);
    }

    if (allowMemberInvites !== undefined && isAdmin) {
      groupChat.settings.allowMemberInvites = allowMemberInvites;
      changes.push(`member invites ${allowMemberInvites ? 'enabled' : 'disabled'}`);
      console.log('allowMemberInvites updated:', allowMemberInvites);
    }

    if (changes.length === 0) {
      console.log('No changes to apply');
      return res.status(400).json({ message: 'No changes provided' });
    }

    await groupChat.save();
    console.log('Group chat saved successfully');

    try {
      const systemMessage = new GroupChatMessage({
        groupChatId: chatId,
        senderId: 'system',
        senderName: 'System',
        content: `${participant.userName} ${changes.join(' and ')}`,
        messageType: 'system',
        isSystemMessage: true,
        systemMessageType: 'group_updated',
        readBy: groupChat.participants.map(p => ({ userId: p.userId }))
      });

      await systemMessage.save();
      console.log('System message created');
    } catch (msgError) {
      console.warn('Failed to create system message:', msgError.message);
    }

    console.log(`Group chat updated successfully: ${changes.join(', ')}`);
    
    res.json({ 
      message: 'Group chat updated successfully',
      changes,
      groupChat: {
        ...groupChat.toObject(),
        participantsCount: groupChat.participants.length
      }
    });

  } catch (error) {
    res.status(500).json({ 
      message: 'Failed to update group chat',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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

    console.log(`Marking group chat messages as read for user ${currentUserId} in chat ${chatId}`);

    const groupChat = await GroupChat.findById(chatId);
    if (groupChat) {
      groupChat.unreadCount.set(currentUserId, 0);
      await groupChat.save();
    }

    await GroupChatMessage.updateMany(
      { 
        groupChatId: chatId, 
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

router.get('/available-users', async (req, res) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ message: 'Database not available' });
    }

    const currentUserId = req.headers['x-user-id'] || 'temp-user-id';
    const { chatId } = req.query; 

    const currentUser = await User.findById(currentUserId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const following = currentUser.following || [];

    const privateChats = await PrivateChat.find({
      'participants.userId': currentUserId
    });

    const chatPartners = new Set();
    privateChats.forEach(chat => {
      chat.participants.forEach(p => {
        if (p.userId !== currentUserId) {
          chatPartners.add(p.userId);
        }
      });
    });

    const availableUserIds = [...new Set([...following, ...Array.from(chatPartners)])];

    let excludedUsers = [currentUserId]; 
    
    if (chatId && mongoose.Types.ObjectId.isValid(chatId)) {
      const existingChat = await GroupChat.findById(chatId);
      if (existingChat) {
        excludedUsers.push(...existingChat.participants.map(p => p.userId));
      }
    }

    const availableUsers = await Promise.all(
      availableUserIds
        .filter(userId => !excludedUsers.includes(userId))
        .map(async (userId) => {
          try {
            const user = await User.findById(userId);
            if (user) {
              return {
                userId: user._id,
                userName: user.fullName,
                userEmail: user.email,
                userAvatar: user.avatar,
                userBio: user.bio,
                isFollowing: following.includes(userId),
                hasPrivateChat: chatPartners.has(userId)
              };
            }
            return null;
          } catch (error) {
            return null;
          }
        })
    );

    const validUsers = availableUsers.filter(user => user !== null);

    validUsers.sort((a, b) => a.userName.localeCompare(b.userName));

    console.log(`Found ${validUsers.length} available users for invitation`);
    res.json(validUsers);

  } catch (error) {
    res.status(500).json({ message: 'Failed to get available users' });
  }
});

export default router;
