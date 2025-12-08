
const API_URL = process.env.API_URL || 'http://localhost:3000/api';


async function apiCall(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });
  
  const data = await response.json();
  
  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

//  AUTH API

export const authAPI = {
  async register(userData) {
    return apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  async login(email, password) {
    return apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  async forgotPassword(email) {
    return apiCall('/auth/forgotpassword', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
  }
};

//  USER API

export const userAPI = {
  async getProfile(userId) {
    return apiCall(`/user/profile/${userId}`);
  },

  async updateProfile(profileData) {
    return apiCall('/user/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
  },

  async changePassword(userId, currentPassword, newPassword) {
    return apiCall('/user/change-password', {
      method: 'PUT',
      body: JSON.stringify({ userId, currentPassword, newPassword })
    });
  },

  async follow(userId, followerId) {
    return apiCall(`/users/${userId}/follow`, {
      method: 'POST',
      body: JSON.stringify({ followerId })
    });
  },

  async unfollow(userId, followerId) {
    return apiCall(`/users/${userId}/follow`, {
      method: 'DELETE',
      body: JSON.stringify({ followerId })
    });
  },

  async getFollowStatus(userId, viewerId) {
    return apiCall(`/users/${userId}/follow-status/${viewerId}`);
  },

  async searchUsers(query, userId = null) {
    const headers = userId ? { 'x-user-id': userId } : {};
    return apiCall(`/users/search?q=${encodeURIComponent(query)}`, { headers });
  },

  async deleteUser(userId) {
    return apiCall('/user/delete', {
      method: 'DELETE',
      body: JSON.stringify({ userId })
    });
  }
};

//  RECIPE API

export const recipeAPI = {
  async create(recipeData, token) {
    return apiCall('/recipes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(recipeData)
    });
  },

  async getAll() {
    return apiCall('/recipes');
  },

  async getById(recipeId) {
    return apiCall(`/recipes/${recipeId}`);
  },

  async update(recipeId, recipeData, token) {
    return apiCall(`/recipes/${recipeId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(recipeData)
    });
  },

  async delete(recipeId, token) {
    return apiCall(`/recipes/${recipeId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  },

  async like(recipeId, token) {
    return apiCall(`/recipes/${recipeId}/like`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  },

  async unlike(recipeId, token) {
    return apiCall(`/recipes/${recipeId}/like`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  },

  async addComment(recipeId, text, token) {
    return apiCall(`/recipes/${recipeId}/comments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ text })
    });
  },

  async deleteComment(recipeId, commentId, token) {
    return apiCall(`/recipes/${recipeId}/comments/${commentId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }
};

//  GROUP API

export const groupAPI = {
  async create(groupData) {
    return apiCall('/groups', {
      method: 'POST',
      body: JSON.stringify(groupData)
    });
  },

  async getAll(userId = null) {
    const query = userId ? `?userId=${userId}` : '';
    return apiCall(`/groups${query}`);
  },

  async getById(groupId) {
    return apiCall(`/groups/${groupId}`);
  },

  async update(groupId, groupData) {
    return apiCall(`/groups/${groupId}`, {
      method: 'PUT',
      body: JSON.stringify(groupData)
    });
  },

  async delete(groupId, userId) {
    return apiCall(`/groups/${groupId}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId })
    });
  },

  async join(groupId, userId) {
    return apiCall(`/groups/${groupId}/join`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  },

  async cancelJoinRequest(groupId, userId) {
    return apiCall(`/groups/${groupId}/join`, {
      method: 'DELETE',
      body: JSON.stringify({ userId })
    });
  },

  async leave(groupId, userId) {
    return apiCall(`/groups/${groupId}/leave/${userId}`, {
      method: 'DELETE'
    });
  },

  async approveRequest(groupId, userId, adminId) {
    return apiCall(`/groups/${groupId}/requests/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ action: 'approve', adminId })
    });
  },

  async rejectRequest(groupId, userId, adminId) {
    return apiCall(`/groups/${groupId}/requests/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ action: 'reject', adminId })
    });
  },

  async searchGroups(query, userId = null, includePrivate = false) {
    let url = `/groups/search?q=${encodeURIComponent(query)}`;
    if (userId) url += `&userId=${userId}`;
    if (includePrivate) url += '&includePrivate=true';
    return apiCall(url);
  },

  async getMembers(groupId) {
    return apiCall(`/groups/${groupId}/members`);
  },

  async updateMemberRole(groupId, memberUserId, role, adminId) {
    return apiCall(`/groups/${groupId}/members/${memberUserId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ role, adminId })
    });
  },

  async removeMember(groupId, memberUserId, adminId) {
    return apiCall(`/groups/${groupId}/members/${memberUserId}`, {
      method: 'DELETE',
      body: JSON.stringify({ adminId })
    });
  }
};

//  GROUP POST API

export const groupPostAPI = {
  async create(groupId, postData) {
    return apiCall(`/groups/${groupId}/posts`, {
      method: 'POST',
      body: JSON.stringify(postData)
    });
  },

  async getAll(groupId, userId = null) {
    const query = userId ? `?userId=${userId}` : '';
    return apiCall(`/groups/${groupId}/posts${query}`);
  },

  async getById(groupId, postId) {
    return apiCall(`/groups/${groupId}/posts/${postId}`);
  },

  async update(groupId, postId, postData) {
    return apiCall(`/groups/${groupId}/posts/${postId}`, {
      method: 'PUT',
      body: JSON.stringify(postData)
    });
  },

  async delete(groupId, postId, userId) {
    return apiCall(`/groups/${groupId}/posts/${postId}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId })
    });
  },

  async like(groupId, postId, userId) {
    return apiCall(`/groups/${groupId}/posts/${postId}/like`, {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  },

  async unlike(groupId, postId, userId) {
    return apiCall(`/groups/${groupId}/posts/${postId}/like`, {
      method: 'DELETE',
      body: JSON.stringify({ userId })
    });
  },

  async addComment(groupId, postId, text, userId, userName) {
    return apiCall(`/groups/${groupId}/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ text, userId, userName })
    });
  },

  async deleteComment(groupId, postId, commentId, userId) {
    return apiCall(`/groups/${groupId}/posts/${postId}/comments/${commentId}`, {
      method: 'DELETE',
      body: JSON.stringify({ userId })
    });
  }
};

//  CHAT API

export const chatAPI = {
  async createPrivate(otherUserId, currentUserId) {
    return apiCall('/chats/private', {
      method: 'POST',
      headers: {
        'x-user-id': currentUserId
      },
      body: JSON.stringify({ otherUserId })
    });
  },

  async getMyChats(userId) {
    return apiCall('/chats/my', {
      headers: {
        'x-user-id': userId
      }
    });
  },

  async getMessages(chatId, page = 1, limit = 50) {
    return apiCall(`/chats/${chatId}/messages?page=${page}&limit=${limit}`);
  },

  async sendMessage(chatId, content, userId, messageType = 'text') {
    return apiCall(`/chats/${chatId}/messages`, {
      method: 'POST',
      headers: {
        'x-user-id': userId
      },
      body: JSON.stringify({ content, messageType })
    });
  },

  async markAsRead(chatId, userId) {
    return apiCall(`/chats/${chatId}/read`, {
      method: 'PUT',
      headers: {
        'x-user-id': userId
      }
    });
  },

  async getUnreadCount(userId) {
    return apiCall('/chats/unread-count', {
      headers: {
        'x-user-id': userId
      }
    });
  }
};

//  GROUP CHAT API

export const groupChatAPI = {
  async create(name, description, participants, creatorId) {
    return apiCall('/group-chats', {
      method: 'POST',
      body: JSON.stringify({ name, description, participants, creatorId })
    });
  },

  async getMy(userId) {
    return apiCall('/group-chats/my', {
      headers: {
        'x-user-id': userId
      }
    });
  },

  async getById(chatId, userId) {
    return apiCall(`/group-chats/${chatId}`, {
      headers: {
        'x-user-id': userId
      }
    });
  },

  async getMessages(chatId, userId, page = 1, limit = 50) {
    return apiCall(`/group-chats/${chatId}/messages?page=${page}&limit=${limit}`, {
      headers: {
        'x-user-id': userId
      }
    });
  },

  async sendMessage(chatId, content, userId, messageType = 'text') {
    return apiCall(`/group-chats/${chatId}/messages`, {
      method: 'POST',
      headers: {
        'x-user-id': userId
      },
      body: JSON.stringify({ content, messageType })
    });
  },

  async addParticipants(chatId, userIds, adminId) {
    return apiCall(`/group-chats/${chatId}/participants`, {
      method: 'POST',
      headers: {
        'x-user-id': adminId
      },
      body: JSON.stringify({ userIds })
    });
  },

  async removeParticipant(chatId, userId, adminId) {
    return apiCall(`/group-chats/${chatId}/participants/${userId}`, {
      method: 'DELETE',
      headers: {
        'x-user-id': adminId
      }
    });
  },

  async leave(chatId, userId) {
    return apiCall(`/group-chats/${chatId}/leave`, {
      method: 'DELETE',
      headers: {
        'x-user-id': userId
      }
    });
  },

  async update(chatId, updates, userId) {
    return apiCall(`/group-chats/${chatId}`, {
      method: 'PUT',
      headers: {
        'x-user-id': userId
      },
      body: JSON.stringify(updates)
    });
  },

  async markAsRead(chatId, userId) {
    return apiCall(`/group-chats/${chatId}/read`, {
      method: 'PUT',
      headers: {
        'x-user-id': userId
      }
    });
  }
};

//  NOTIFICATION API

export const notificationAPI = {
  async getAll(userId) {
    return apiCall(`/notifications?userId=${userId}`);
  },

  async markAsRead(notificationId) {
    return apiCall(`/notifications/${notificationId}/read`, {
      method: 'PUT'
    });
  },

  async markAllAsRead(userId) {
    return apiCall('/notifications/mark-all-read', {
      method: 'PUT',
      body: JSON.stringify({ userId })
    });
  },

  async getUnreadCount(userId) {
    return apiCall(`/notifications/unread-count?userId=${userId}`);
  }
};

//  FEED API

export const feedAPI = {
  async getPersonalized(userId, type = null, page = 1, limit = 50) {
    let url = `/feed?userId=${userId}&page=${page}&limit=${limit}`;
    if (type) url += `&type=${type}`;
    return apiCall(url);
  },

  async getStats(userId) {
    return apiCall(`/feed/stats?userId=${userId}`);
  },

  async getMyPosts(userId) {
    return apiCall(`/feed/my-posts?userId=${userId}`);
  },

  async getFollowingPosts(userId) {
    return apiCall(`/feed/posts?userId=${userId}`);
  }
};


//  UPLOAD API


export const uploadAPI = {
  async avatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    
    const response = await fetch(`${API_URL}/upload/avatar`, {
      method: 'POST',
      body: formData
    });
    
    return {
      ok: response.ok,
      status: response.status,
      data: await response.json()
    };
  }
};

//  TEST UTILITIES

export const testAPI = {
  async clearDatabase() {
    return apiCall('/test/clear-db', {
      method: 'POST'
    });
  },

  async getDatabaseStatus() {
    return apiCall('/test/db-status');
  }
};

export default {
  auth: authAPI,
  user: userAPI,
  recipe: recipeAPI,
  group: groupAPI,
  groupPost: groupPostAPI,
  chat: chatAPI,
  groupChat: groupChatAPI,
  notification: notificationAPI,
  feed: feedAPI,
  upload: uploadAPI,
  test: testAPI
};