import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000,
});

api.interceptors.request.use(
  async (config) => {
    try {
      const token = localStorage.getItem('userToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.log('No token found');
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const followService = {
  followUser: async (userId, followerId) => {
    try {
      console.log('Following user:', userId);
      
      const response = await api.post(`/users/${userId}/follow`, {
        followerId
      });
      
      console.log('Follow successful');
      return { 
        success: true, 
        data: response.data 
      };
    } catch (error) {
      console.error('Follow error:', error);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to follow user'
      };
    }
  },

  unfollowUser: async (userId, followerId) => {
    try {
      console.log('Unfollowing user:', userId);
      
      const response = await api.delete(`/users/${userId}/follow`, {
        data: { followerId }
      });
      
      console.log('Unfollow successful');
      return { 
        success: true, 
        data: response.data 
      };
    } catch (error) {
      console.error('Unfollow error:', error);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to unfollow user'
      };
    }
  },

  getFollowers: async (userId) => {
    try {
      console.log('Getting followers for user:', userId);
      
      const response = await api.get(`/users/${userId}/followers`);
      
      return { 
        success: true, 
        data: response.data || []
      };
    } catch (error) {
      console.error('Get followers error:', error);
      return {
        success: false,
        message: error.response?.data?.message || error.message,
        data: []
      };
    }
  },

  getFollowing: async (userId) => {
    try {
      console.log('Getting following for user:', userId);
      
      const response = await api.get(`/users/${userId}/following`);
      
      return { 
        success: true, 
        data: response.data || []
      };
    } catch (error) {
      console.error('Get following error:', error);
      return{
        success: false,
        message: error.response?.data?.message || error.message,
        data: []
      };
    }
  },

  getFollowStatus: async (userId, viewerId) => {
    try {
      console.log('Getting follow status:', userId, viewerId);
      
      const response = await api.get(`/users/${userId}/follow-status/${viewerId}`);
      
      return { 
        success: true, 
        data: response.data 
      };
    } catch (error) {
      console.error('Get follow status error:', error);
      return {
        success: false,
        message: error.message,
        data: {
          followersCount: 0,
          followingCount: 0,
          isFollowing: false
        }
      };
    }
  },

  removeFollower: async (userId, followerId) => {
    try {
      console.log('Removing follower:', followerId, 'from user:', userId);
      
      const response = await api.delete(`/users/${userId}/follow`, {
        data: { followerId }
      });
      
      return { 
        success: true, 
        data: response.data 
      };
    } catch (error) {
      console.error('Remove follower error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }
};