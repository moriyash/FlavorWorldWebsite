import Notification from '../models/Notification.js';
import { isMongoConnected } from '../config/database.js';

const generateResetCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const createNotification = async (notificationData, io) => {
  try {
    if (!isMongoConnected()) {
      console.log('Database not connected, skipping notification');
      return { success: false };
    }

    const {
      type,
      fromUserId,
      toUserId,
      message,
      recipeId,
      postId,
      groupId,
      commentId,
      fromUser
    } = notificationData;

    if (fromUserId === toUserId || fromUserId?.toString() === toUserId?.toString()) {
      console.log('Skipping self-notification');
      return { success: false, reason: 'self-notification' };
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existingNotification = await Notification.findOne({
      toUserId,
      fromUserId,
      type,
      recipeId: recipeId || null,
      postId: postId || null,
      commentId: commentId || null,
      createdAt: { $gte: fiveMinutesAgo }
    });

    if (existingNotification) {
      console.log('Similar notification already exists, skipping');
      return { success: false, reason: 'duplicate', data: existingNotification };
    }

    const notification = new Notification({
      type,
      fromUserId,
      toUserId,
      message,
      recipeId: recipeId || null,
      postId: postId || null,
      groupId: groupId || null,
      commentId: commentId || null,
      fromUser: { 
        name: fromUser?.name || fromUser?.fullName || 'Someone',
        avatar: fromUser?.avatar || null
      },
      read: false  
    });

    await notification.save();
    
    console.log('Notification created:', notification.type, 'for user:', toUserId);
    
    if (io) {
      const userSockets = await io.in(toUserId.toString()).fetchSockets();
      if (userSockets.length > 0) {
        io.to(toUserId.toString()).emit('new_notification', {
          notification: notification.toObject(),
          unreadCount: await Notification.countDocuments({ toUserId, read: false })
        });
        console.log('Emitted new_notification event to user:', toUserId);
      }
    }
    
    return { success: true, data: notification };

  } catch (error) {
    console.error('Create notification error:', error);
    return { success: false, error: error.message };
  }
};

export { generateResetCode, createNotification };