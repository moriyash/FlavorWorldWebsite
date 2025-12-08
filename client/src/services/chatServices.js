import axios from 'axios';
import { io } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:3000/api';

const SOCKET_SERVER_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL
  : 'http://localhost:3000';


const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    try {
      const token = localStorage.getItem('userToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.log('Axios Error Response:', error.response?.status, error.response?.data);
    if (error.response?.status === 401) {
        localStorage.removeItem('userToken');
        localStorage.removeItem('userId');    
    }
    return Promise.reject(error);
  }
);

class ChatService {
  constructor() {
    this.currentUser = null;
    this.messageListeners = [];
    this.onlineUsersListeners = [];
    this.typingListeners = [];
    this.notificationListeners = [];
    this.socket = null;
    this.isConnected = false;
  }

  async initializeSocket(userId) {
    try {
      console.log(' Initializing chat service with socket for user:', userId);
      this.currentUser = userId;
      
      if (typeof userId === 'object' && userId._id) {
        this.currentUser = userId._id;
      } else if (typeof userId === 'object' && userId.id) {
        this.currentUser = userId.id;
      }
      
      console.log('Final currentUser ID:', this.currentUser);
      
      this.socket = io(SOCKET_SERVER_URL, {
        query: {
          userId: this.currentUser
        },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      this.socket.on('connect', () => {
        console.log(' Socket connected');
        this.isConnected = true;
      });

      this.socket.on('disconnect', () => {
        console.log(' Socket disconnected');
        this.isConnected = false;
      });

      this.socket.on('error', (error) => {
        console.error(' Socket error:', error);
      });

      this.socket.on('new_message', (message) => {
        console.log(' New message received:', message);
        this.messageListeners.forEach(callback => callback(message));
      });

      this.socket.on('messages_loaded', (messagesData) => {
        console.log(' Messages loaded:', messagesData.length);
      });

      this.socket.on('message_sent', (sentMessage) => {
        console.log(' Message sent:', sentMessage);
        this.messageListeners.forEach(callback => callback(sentMessage));
      });

      this.socket.on('group_messages_loaded', (messagesData) => {
        console.log(' Group messages loaded:', messagesData.length);
      });

      this.socket.on('group_message_sent', (sentMessage) => {
        console.log(' Group message sent:', sentMessage);
        this.messageListeners.forEach(callback => callback(sentMessage));
      });

      this.socket.on('group_chat_info_loaded', (chatInfo) => {
        console.log(' Group chat info loaded:', chatInfo);
      });

      this.socket.on('typing_started', (data) => {
        console.log(' User started typing:', data);
        this.typingListeners.forEach(callback => callback({ ...data, type: 'start' }));
      });

      this.socket.on('typing_stopped', (data) => {
        console.log(' User stopped typing:', data);
        this.typingListeners.forEach(callback => callback({ ...data, type: 'stop' }));
      });

      this.socket.on('group_typing_started', (data) => {
        console.log(' Group user started typing:', data);
        this.typingListeners.forEach(callback => callback({ ...data, type: 'start' }));
      });

      this.socket.on('group_typing_stopped', (data) => {
        console.log(' Group user stopped typing:', data);
        this.typingListeners.forEach(callback => callback({ ...data, type: 'stop' }));
      });

      this.socket.on('online_users_updated', (users) => {
        console.log(' Online users updated:', users.length);
        this.onlineUsersListeners.forEach(callback => callback(users));
      });

      this.socket.on('unread_count_updated', (count) => {
        console.log(' Unread count updated:', count);
        this.notificationListeners.forEach(callback => callback(count));
      });

      this.startNotificationPolling();
      return true;
    } catch (error) {
      console.error(' Socket initialization error:', error);
      return false;
    }
  }

  getCurrentUserId() {
    if (!this.currentUser) {
      console.warn(' Current user not set in chat service');
      return null;
    }
    
    if (typeof this.currentUser === 'object') {
      return this.currentUser._id || this.currentUser.id;
    }
    
    return this.currentUser;
  }

  disconnect() {
    console.log(' Chat service disconnecting...');
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.stopNotificationPolling();
    this.messageListeners = [];
    this.onlineUsersListeners = [];
    this.typingListeners = [];
    this.notificationListeners = [];
  }

  isSocketConnected() {
    return this.socket && this.isConnected;
  }

  getSocket() {
    return this.socket;
  }

  startNotificationPolling() {
    if (this.notificationInterval) {
      clearInterval(this.notificationInterval);
    }
    
    this.notificationInterval = setInterval(async () => {
      try {
        const result = await this.getUnreadCount();
        if (result.success) {
          this.notificationListeners.forEach(callback => {
            callback(result.count);
          });
        }
      } catch (error) {
      }
    }, 30000);
  }

  stopNotificationPolling() {
    if (this.notificationInterval) {
      clearInterval(this.notificationInterval);
      this.notificationInterval = null;
    }
  }

  onMessage(callback) {
    this.messageListeners.push(callback);
    return () => {
      this.messageListeners = this.messageListeners.filter(cb => cb !== callback);
    };
  }

  onOnlineUsers(callback) {
    this.onlineUsersListeners.push(callback);
    return () => {
      this.onlineUsersListeners = this.onlineUsersListeners.filter(cb => cb !== callback);
    };
  }

  onTyping(callback) {
    this.typingListeners.push(callback);
    return () => {
      this.typingListeners = this.typingListeners.filter(cb => cb !== callback);
    };
  }

  onNotification(callback) {
    this.notificationListeners.push(callback);
    return () => {
      this.notificationListeners = this.notificationListeners.filter(cb => cb !== callback);
    };
  }

  
  joinChat(chatId, chatType = 'private') {
    if (!this.isSocketConnected()) {
      console.warn(' Socket not connected, cannot join chat');
      return;
    }
    
    const event = chatType === 'group' ? 'join_group_chat' : 'join_chat';
    console.log(` Joining ${chatType} chat:`, chatId);
    this.socket.emit(event, chatId);
  }

  leaveChat(chatId, chatType = 'private') {
    if (!this.isSocketConnected()) {
      console.warn(' Socket not connected, cannot leave chat');
      return;
    }
    
    const event = chatType === 'group' ? 'leave_group_chat' : 'leave_chat';
    console.log(` Leaving ${chatType} chat:`, chatId);
    this.socket.emit(event, chatId);
  }

  loadChatMessages(chatId, chatType = 'private') {
    if (!this.isSocketConnected()) {
      console.warn(' Socket not connected, cannot load messages');
      return;
    }
    
    const event = chatType === 'group' ? 'load_group_messages' : 'load_messages';
    console.log(` Loading ${chatType} messages:`, chatId);
    this.socket.emit(event, chatId);
  }

  sendMessage(chatId, content, messageType = 'text', chatType = 'private') {
    if (!this.isSocketConnected()) {
      console.warn(' Socket not connected, cannot send message');
      return Promise.resolve({ success: false, message: 'Not connected' });
    }

    return new Promise((resolve, reject) => {
      const event = chatType === 'group' ? 'send_group_message' : 'send_message';
      const messageData = {
        chatId,
        content,
        messageType,
        senderId: this.getCurrentUserId()
      };

      console.log(` Sending ${chatType} message:`, messageData);
      console.log('Content length:', content.length);
      
      const timeout = setTimeout(() => {
        console.error(' Message send timeout');
        resolve({ success: false, message: 'Request timeout' });
      }, 10000); 
      
      this.socket.emit(event, messageData, (response) => {
        clearTimeout(timeout);
        
        if (response && response.success) {
          console.log(` ${chatType} message sent successfully`);
          resolve({ success: true, data: response.data });
        } else {
          console.error(` Failed to send ${chatType} message:`, response);
          resolve({ success: false, message: response?.message || 'Failed to send message' });
        }
      });
    });
  }

  markAsRead(chatId, chatType = 'private') {
    if (!this.isSocketConnected()) {
      console.warn(' Socket not connected, cannot mark as read');
      return;
    }
    
    const event = chatType === 'group' ? 'mark_group_as_read' : 'mark_as_read';
    console.log(` Marking ${chatType} chat as read:`, chatId);
    this.socket.emit(event, {
      chatId,
      userId: this.getCurrentUserId()
    });
  }

 startTyping(chatId, chatType = 'private') {
  if (!this.isSocketConnected()) {
    console.warn(' Socket not connected, cannot start typing');
    return;
  }

  const event = chatType === 'group' ? 'start_group_typing' : 'start_typing';
  const payload = {
    chatId,
    userId: this.getCurrentUserId(),
  };

  if (chatType === 'group') {
    payload.userName = this.getCurrentUserName();
  }

  console.log(`Starting typing in ${chatType} chat:`, payload);
  this.socket.emit(event, payload);
}


  stopTyping(chatId, chatType = 'private') {
  if (!this.isSocketConnected()) {
    console.warn('Socket not connected, cannot stop typing');
    return;
  }

  const event = chatType === 'group' ? 'stop_group_typing' : 'stop_typing';
  const payload = {
    chatId,
    userId: this.getCurrentUserId(),
  };

  if (chatType === 'group') {
    payload.userName = this.getCurrentUserName(); 
  }

  console.log(`Stopping typing in ${chatType} chat:`, payload);
  this.socket.emit(event, payload);
}

  getCurrentUserName() {
  return this.currentUser?.fullName || this.currentUser?.name || 'someone';
}


  loadGroupChatInfo(chatId) {
    if (!this.isSocketConnected()) {
      console.warn(' Socket not connected, cannot load group chat info');
      return;
    }
    
    console.log(' Loading group chat info:', chatId);
    this.socket.emit('load_group_chat_info', chatId);
  }

  // HTTP methods 
  
  async getFollowStatus(userId, currentUserId) {
    try {
      console.log(' Getting follow status:', userId, currentUserId);
      
      const response = await apiClient.get(`/users/${userId}/follow-status/${currentUserId}`);
      
      console.log(' Follow status response:', response.data);
      return { success: true, data: response.data };
      
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || error.message 
      };
    }
  }

  async toggleFollow(userId, followerId, isFollowing) {
    try {
      console.log(' Toggle follow:', userId, followerId, isFollowing);
      
      if (!userId || !followerId) {
        console.error('Error:', 'user-friendly message');
        return;
      }
      
      if (userId === followerId) {
        return {
          success: false,
          message: 'You cannot follow yourself'
        };
      }

      let response;
      
      if (isFollowing) {
        console.log(' Sending DELETE request to unfollow...');
        response = await apiClient.delete(`/users/${userId}/follow`, {
          data: { followerId: followerId }
        });
      } else {
        console.log(' Sending POST request to follow...');
        response = await apiClient.post(`/users/${userId}/follow`, {
          followerId: followerId
        });
      }
      
      console.log(' Toggle follow success:', response.data);
      return { success: true, data: response.data };
      
    } catch (error) {
      
      if (error.response?.status === 400) {
        const errorMsg = error.response.data?.message;
        if (errorMsg?.includes('Already following')) {
          return { success: false, message: 'You are already following this user' };
        }
        if (errorMsg?.includes('Not following')) {
          return { success: false, message: 'You are not following this user' };
        }
        if (errorMsg?.includes('Cannot follow yourself')) {
          return { success: false, message: 'You cannot follow yourself' };
        }
      }
      
      if (error.response?.status === 404) {
        return { success: false, message: 'User not found' };
      }
      
      if (error.response?.status === 503) {
        return { success: false, message: 'Database not available. Please try again later.' };
      }
      
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to update follow status' 
      };
    }
  }

  async getOrCreatePrivateChat(otherUserId) {
    try {
      console.log(' STARTING CHAT CREATION ');
      console.log('Other User ID:', otherUserId);
      
      const currentUserId = this.getCurrentUserId();
      console.log('Current User ID:', currentUserId);
      
      if (!currentUserId) {
        return {
          success: false,
          message: 'Please log in to continue'
        };
      }

      if (!otherUserId) {
        return {
          success: false,
          message: 'User information is missing. Please try again.'
        };
      }

      if (currentUserId === otherUserId) {
        return {
          success: false,
          message: 'You cannot start a chat with yourself'
        };
      }

      console.log(' Creating/Getting private chat...');
      
      const response = await apiClient.post('/chats/private', 
        { otherUserId },
        {
          headers: { 
            'x-user-id': currentUserId
          }
        }
      );

      console.log(' Private chat ready:', response.data._id);
      return { success: true, data: response.data };

    } catch (error) {
      
      if (error.response?.status === 400) {
        const errorMsg = error.response.data?.message;
        if (errorMsg?.includes('Cannot chat with yourself')) {
          return { success: false, message: 'You cannot chat with yourself' };
        }
        if (errorMsg?.includes('Other user ID is required')) {
          return { success: false, message: 'User ID is missing' };
        }
      }
      
      if (error.response?.status === 404) {
        return { success: false, message: 'User not found' };
      }
      
      if (error.response?.status === 503) {
        return { success: false, message: 'Database not available. Please try again later.' };
      }
      
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to create chat'
      };
    }
  }

  async getMyChats() {
    try {
      console.log(' Fetching my chats...');
      
      const currentUserId = this.getCurrentUserId();
      
      const response = await apiClient.get('/chats/my', {
        headers: { 'x-user-id': currentUserId }
      });

      console.log(' My chats fetched:', response.data.length);
      return { success: true, data: response.data };

    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || error.message 
      };
    }
  }

  async getChatMessages(chatId, page = 1, limit = 50) {
    try {
      console.log(' Fetching chat messages:', chatId);
      
      const currentUserId = this.getCurrentUserId();
      
      const response = await apiClient.get(`/chats/${chatId}/messages`, {
        params: { page, limit },
        headers: { 'x-user-id': currentUserId }
      });

      console.log(' Chat messages fetched:', response.data.length);
      return { success: true, data: response.data };

    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || error.message 
      };
    }
  }

  async getUnreadCount() {
    try {
      const currentUserId = this.getCurrentUserId();
      
      const response = await apiClient.get('/chats/unread-count', {
        headers: { 'x-user-id': currentUserId }
      });

      return { success: true, count: response.data.count };

    } catch (error) {
      return { success: false, count: 0 };
    }
  }

  async searchUsers(query) {
    try {
      console.log(' Searching users:', query);
      
      const currentUserId = this.getCurrentUserId();
      
      const response = await apiClient.get('/users/search', {
        params: { q: query },
        headers: { 'x-user-id': currentUserId }
      });

      console.log(' Users search completed:', response.data.length);
      return { success: true, data: response.data };

    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || error.message 
      };
    }
  }

  async createGroupChat(name, description, participantIds) {
    try {
      console.log(' Creating group chat:', name);
      
      if (!name || name.trim().length === 0) {
        return { success: false, message: 'Group name is required' };
      }

      if (!participantIds || participantIds.length === 0) {
        return { success: false, message: 'At least one participant is required' };
      }

      const currentUserId = this.getCurrentUserId();

      const response = await apiClient.post('/group-chats', {
        name: name.trim(),
        description: description || '',
        participants: participantIds,
        creatorId: currentUserId
      }, {
        headers: { 'x-user-id': currentUserId }
      });

      console.log(' Group chat created successfully:', response.data._id);
      return { success: true, data: response.data };

    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to create group chat' 
      };
    }
  }

  async getMyGroupChats() {
    try {
      console.log(' Fetching my group chats...');

      const currentUserId = this.getCurrentUserId();

      const response = await apiClient.get('/group-chats/my', {
        headers: { 'x-user-id': currentUserId }
      });

      console.log(' My group chats fetched:', response.data.length);
      return { success: true, data: response.data };

    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to fetch group chats' 
      };
    }
  }

  async getGroupChat(chatId) {
    try {
      console.log(' Fetching group chat:', chatId);

      const currentUserId = this.getCurrentUserId();

      const response = await apiClient.get(`/group-chats/${chatId}`, {
        headers: { 'x-user-id': currentUserId }
      });

      console.log(' Group chat fetched successfully');
      return { success: true, data: response.data };

    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to fetch group chat' 
      };
    }
  }

  async getGroupChatMessages(chatId, page = 1, limit = 50) {
    try {
      console.log(' Fetching group chat messages:', chatId);
      
      const currentUserId = this.getCurrentUserId();
      
      const response = await apiClient.get(`/group-chats/${chatId}/messages`, {
        params: { page, limit },
        headers: { 'x-user-id': currentUserId }
      });

      console.log(' Group chat messages fetched:', response.data.length);
      return { success: true, data: response.data };

    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to fetch messages' 
      };
    }
  }

  async sendGroupChatMessage(chatId, content, messageType = 'text') {
    try {
      console.log(' Sending message to group chat:', chatId, 'Type:', messageType);
      
      const currentUserId = this.getCurrentUserId();
      
      const response = await apiClient.post(`/group-chats/${chatId}/messages`, {
        content,
        messageType,
      }, {
        headers: { 'x-user-id': currentUserId }
      });

      console.log(' Group message sent successfully');
      
      this.messageListeners.forEach(callback => {
        callback(response.data);
      });
      
      return { success: true, data: response.data };

    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to send message' 
      };
    }
  }

  async sendPrivateChatMessage(chatId, content, messageType = 'text') {
    try {
      console.log(' Sending message to private chat via HTTP:', chatId, 'Type:', messageType);
      
      const currentUserId = this.getCurrentUserId();
      
      const response = await apiClient.post(`/chats/${chatId}/messages`, {
        content,
        messageType,
      }, {
        headers: { 'x-user-id': currentUserId }
      });

      console.log(' Private message sent successfully via HTTP');
      
      this.messageListeners.forEach(callback => {
        callback(response.data);
      });
      
      return { success: true, data: response.data };

    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to send message' 
      };
    }
  }

  async markGroupChatAsRead(chatId) {
    try {
      const currentUserId = this.getCurrentUserId();
      
      await apiClient.put(`/group-chats/${chatId}/read`, {}, {
        headers: { 'x-user-id': currentUserId }
      });

      console.log(' Group chat messages marked as read');
      return { success: true };

    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to mark as read' 
      };
    }
  }

  async getAllChats() {
    try {
      console.log('Fetching all chats (private + group)...');
      
      const currentUserId = this.getCurrentUserId();
      
      if (!currentUserId) {
        console.warn('No current user ID');
        return { success: true, data: [] };
      }

      const config = {
        headers: { 
          'x-user-id': currentUserId 
        },
        timeout: 120000
      };

      let allChats = [];

      try {
        const privateResponse = await apiClient.get('/chats/my', config);
        const privateChats = (privateResponse.data || []).map(chat => ({
          ...chat,
          chatType: 'private',
          displayName: chat.otherUser?.userName || 'Unknown User',
          displayAvatar: chat.otherUser?.userAvatar,
          participantsCount: 2
        }));
        allChats.push(...privateChats);
        console.log('Private chats loaded:', privateChats.length);
      } catch (error) {
        console.warn('Failed to load private chats:', error.message);
      }

      try {
        const groupResponse = await apiClient.get('/group-chats/my', config);
        const groupChats = (groupResponse.data || []).map(chat => ({
          ...chat,
          chatType: 'group',
          displayName: chat.name,
          displayAvatar: chat.image,
          participantsCount: chat.participantsCount || chat.participants?.length || 0
        }));
        allChats.push(...groupChats);
        console.log('Group chats loaded:', groupChats.length);
      } catch (error) {
        console.warn('Failed to load group chats:', error.message);
      }

      allChats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

      console.log(`All chats fetched: ${allChats.length} total`);
      return { success: true, data: allChats };

    } catch (error) {
      console.error('Get all chats error:', error);
      return { 
        success: false, 
        message: 'Failed to fetch chats',
        data: []
      };
    }
  }

  async getUnreadChatsCount() {
    try {
      const result = await this.getAllChats();
      if (result.success) {
        const unreadChatsCount = result.data.filter(chat => chat.unreadCount > 0).length;
        return { success: true, count: unreadChatsCount };
      } else {
        return {
          success: false,
          message: result.message || 'Failed to get unread chats count',
          count: 0
        };
      }
    } catch (error) {
      return { success: false, count: 0 };
    }
  }

  async getAvailableUsersForGroupChat(chatId) {
    try {
      console.log(' Getting available users for group chat:', chatId);
      
      const groupResult = await this.getGroupChat(chatId);
      let existingParticipants = [];
      
      if (groupResult.success) {
        existingParticipants = groupResult.data.participants.map(p => p.userId);
        console.log(' Existing participants:', existingParticipants.length);
      }
      
      const chatsResult = await this.getMyChats();
      
      if (!chatsResult.success || !chatsResult.data || chatsResult.data.length === 0) {
        console.log(' No chats found or error occurred');
        return { 
          success: true, 
          data: [],
          message: 'No private chats found'
        };
      }
      
      const currentUserId = this.getCurrentUserId();
      
      const availableUsers = [];
      
      chatsResult.data.forEach((chat) => {
        if (chat.otherUser && 
            chat.otherUser.userId !== currentUserId &&
            !existingParticipants.includes(chat.otherUser.userId)) {
          
          const user = {
            userId: chat.otherUser.userId,
            userName: chat.otherUser.userName || 'Unknown User',
            userAvatar: chat.otherUser.userAvatar,
            userEmail: chat.otherUser.userEmail || 'No email',
            userBio: chat.otherUser.userBio || '',
            hasPrivateChat: true,
            isFollowing: false
          };
          
          availableUsers.push(user);
        }
      });
      
      const uniqueUsers = availableUsers.filter((user, index, self) => 
        index === self.findIndex(u => u.userId === user.userId)
      );
      
      console.log(' Available users for group:', uniqueUsers.length);
      return { success: true, data: uniqueUsers };

    } catch (error) {
      return { 
        success: false, 
        message: 'Failed to get available users',
        data: []
      };
    }
  }

  async updateGroupChat(chatId, updateData) {
    try {
      console.log(' Updating group chat:', chatId);
      console.log(' Update data:', Object.keys(updateData));
      
      const currentUserId = this.getCurrentUserId();
      
      if (!currentUserId) {
        return {
          success: false,
          message: 'Please log in to continue'
        };
      }
      
      const changes = [];
      if (updateData.name) changes.push('name');
      if (updateData.description !== undefined) changes.push('description');
      if (updateData.image !== undefined) changes.push('image');
      if (updateData.allowNameChange !== undefined) changes.push('allowNameChange permission');
      if (updateData.allowImageChange !== undefined) changes.push('allowImageChange permission');
      if (updateData.allowMemberInvites !== undefined) changes.push('allowMemberInvites permission');
      
      console.log(' Changes:', changes.join(', '));
      
      const response = await apiClient.put(`/group-chats/${chatId}`, updateData, {
        headers: { 'x-user-id': currentUserId }
      });
      
      console.log(' Group chat updated successfully');
      return { success: true, data: response.data };
      
    } catch (error) {
      
      if (error.response?.status === 403) {
        const errorMsg = error.response.data?.message;
        if (errorMsg?.includes('Only admin can change')) {
          return { success: false, message: 'Only group admin can make this change' };
        }
        return { success: false, message: 'Permission denied' };
      }
      
      if (error.response?.status === 404) {
        return { success: false, message: 'Group chat not found' };
      }
      
      if (error.response?.status === 400) {
        return { success: false, message: error.response.data?.message || 'Invalid update data' };
      }
      
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to update group chat' 
      };
    }
  }

  async updateGroupChatImage(chatId, imageData) {
    try {
      console.log(' Updating group chat image:', chatId);
      console.log(' Image data length:', imageData ? imageData.length : 0);
      
      const result = await this.updateGroupChat(chatId, {
        image: imageData
      });
      
      if (result.success) {
        console.log(' Group chat image updated successfully');
      }
      
      return result;
      
    } catch (error) {
      return { 
        success: false, 
        message: 'Failed to update group chat image' 
      };
    }
  }

  async updateGroupChatSettings(chatId, settings) {
    try {
      console.log(' Updating group chat settings:', chatId);
      console.log(' Settings:', settings);
      
      const result = await this.updateGroupChat(chatId, settings);
      
      if (result.success) {
        console.log(' Group chat settings updated successfully');
      }
      
      return result;
      
    } catch (error) {
      return { 
        success: false, 
        message: 'Failed to update group chat settings' 
      };
    }
  }

  async removeParticipantFromGroupChat(chatId, userId) {
    try {
      const currentUserId = this.getCurrentUserId();
      
      const response = await apiClient.delete(`/group-chats/${chatId}/participants/${userId}`, {
        headers: { 'x-user-id': currentUserId }
      });
      
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to remove participant' 
      };
    }
  }

  async addParticipantsToGroupChat(chatId, userIds) {
    try {
      const currentUserId = this.getCurrentUserId();
      
      const response = await apiClient.post(`/group-chats/${chatId}/participants`, {
        userIds
      }, {
        headers: { 'x-user-id': currentUserId }
      });
      
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to add participants' 
      };
    }
  }

  async leaveGroupChat(chatId) {
    try {
      const currentUserId = this.getCurrentUserId();
      
      const response = await apiClient.delete(`/group-chats/${chatId}/leave`, {
        headers: { 'x-user-id': currentUserId }
      });
      
      return { success: true, data: response.data };
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Failed to leave group chat' 
      };
    }
  }

  formatMessageTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'now';
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'yesterday';
    if (diffInDays < 7) return `${diffInDays}d`;
    
    return date.toLocaleDateString('en-US');
  }

  isToday(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  getMessagePreview(message, maxLength = 50) {
    if (!message) return 'Start a conversation...';
    
    switch (message.messageType) {
      case 'image':
        return ' Image';
      case 'document':
        return ' File';
      case 'location':
        return ' Location';
      case 'audio':
        return ' Voice message';
      case 'video':
        return ' Video';
      default:
        const content = message.content || 'Message';
        return content.length > maxLength 
          ? content.substring(0, maxLength) + '...' 
          : content;
    }
  }
}

export const chatService = new ChatService();