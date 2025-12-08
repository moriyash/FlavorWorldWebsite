import axios from 'axios';

class UserService {
  constructor() {
    this.baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

    this.api = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 120000,
    });

    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('userToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        const currentUser = this.getCurrentUser();
        if (currentUser?.id) {
          config.headers['x-user-id'] = currentUser.id;
        }
        
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }

  getCurrentUser() {
    try {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    } catch (error) {
      console.error('Error parsing current user:', error);
      return null;
    }
  }

  async searchUsers(query, currentUserId = null) {
    try {
      console.log('UserService: Searching users for:', query);
      
      if (!currentUserId) {
        const currentUser = this.getCurrentUser();
        currentUserId = currentUser?.id || 'temp-user-id';
      }
      
      const response = await this.api.get('/api/users/search', {
        params: { q: query },
        headers: {
          'x-user-id': currentUserId,
        },
      });

      console.log('UserService: Search successful, found:', response.data.length, 'users');
      return response.data;
      
    } catch (error) {
      console.error('UserService: Search error:', error);
      return [];
    }
  }

  async deleteUserAccount(userId, password) {
    try {
      console.log('UserService: Deleting user account for ID:', userId);
      
      const deleteData = {
        userId: userId,
        password: password, 
        confirmDelete: true
      };

      try {
        console.log('Calling delete endpoint: /api/users/delete');
        
        const response = await this.api({
          method: 'delete',
          url: '/api/users/delete',
          data: deleteData,
          headers: {
            'x-user-id': userId,
          },
          timeout: 15000, 
        });

        if (response.data.success || response.status === 200) {
          console.log('User account deleted successfully');
          
          localStorage.removeItem('userToken');
          localStorage.removeItem('userData');
          localStorage.removeItem('user');
          
          return {
            success: true,
            message: 'Account deleted successfully',
            data: response.data
          };
        }
      } catch (error) {
        if (error.response && error.response.status === 401) {
          console.error('Password validation failed');
          return {
            success: false,
            message: error.response.data.message || 'Incorrect password. Account deletion cancelled.'
          };
        }
        
        if (!error.response && error.code === 'ERR_NETWORK') {
          return {
            success: false,
            message: 'Cannot connect to server. Please make sure the server is running.'
          };
        }
        
        console.error('Delete account error:', error);
        return {
          success: false,
          message: error.response?.data?.message || 'Failed to delete account. Please try again.'
        };
      }

      return {
        success: false,
        message: 'Failed to delete account'
      };
      
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to delete account'
      };
    }
  }

  async changePassword(passwordData) {
    try {
      console.log('=== Change Password Request ===');
      console.log('User ID:', passwordData.userId);
      
      if (!passwordData.currentPassword || !passwordData.newPassword) {
        return {
          success: false,
          message: 'Current password and new password are required'
        };
      }
      
      const endpoints = [
        { url: '/api/user/change-password', method: 'put' },
        { url: '/api/user/change-password', method: 'patch' }
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`Trying: ${endpoint.method.toUpperCase()} ${endpoint.url}`);
          
          const response = await this.api({
            method: endpoint.method,
            url: endpoint.url,
            data: passwordData,
          });

          console.log('Password changed successfully via:', endpoint.url);
          
          return {
            success: true,
            message: 'Password changed successfully',
            data: response.data
          };
          
        } catch (error) {
          const status = error.response?.status;
          const errorMsg = error.response?.data?.message;
          
          console.log(`${endpoint.url} - Status: ${status}, Error: ${errorMsg || error.message}`);
          
          if (error.response) {
            if (status === 401) {
              return {
                success: false,
                message: 'Current password is incorrect'
              };
            }

            if (status === 400) {
              return {
                success: false,
                message: errorMsg || 'Invalid password data'
              };
            }

            if (status === 404) {
              continue;
            }
          }

          continue;
        }
      }

      console.log('All endpoints failed');
      return {
        success: false,
        message: 'Password change service is currently unavailable.'
      };
      
    } catch (error) {
      console.error('Change password error:', error);      
      return {
        success: false,
        message: 'An unexpected error occurred. Please try again later.'
      };
    }
  }

  async updateAvatar(formData) {
    try {
      console.log('Uploading avatar...');
      
      if (!(formData instanceof FormData)) {
        return {
          success: false,
          message: 'Invalid data format - FormData expected'
        };
      }

      const endpoints = [
        '/api/user/upload-avatar',
        '/api/upload/avatar', 
        '/api/auth/avatar'
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint}`);
          
          const response = await this.api.post(endpoint, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            timeout: 30000,
          });

          if (response.data.success || response.data.url) {
            console.log('Avatar uploaded successfully via:', endpoint);
            
            const avatarUrl = response.data.url || response.data.avatarUrl;
            
            const currentUser = this.getCurrentUser();
            if (currentUser && avatarUrl) {
              currentUser.avatar = avatarUrl;
              localStorage.setItem('user', JSON.stringify(currentUser));
            }
            
            return {
              success: true,
              message: 'Profile picture updated successfully',
              data: {
                url: avatarUrl,
                ...response.data
              }
            };
          }
        } catch (error) {
          console.log(`Endpoint ${endpoint} error:`, error.response?.data?.error || error.message);
          
          if (error.response?.status === 404 || error.response?.status === 500) {
            continue;
          }
          
          if (error.response?.status === 400 || error.response?.status === 413) {
            return {
              success: false,
              message: error.response.data?.error || error.response.data?.message || 'Invalid image file'
            };
          }
          
          continue;
        }
      }

      console.log('All avatar upload endpoints failed');
      return {
        success: false,
        message: 'Could not upload avatar - profile will be updated without image change'
      };
      
    } catch (error) {
      console.error('Upload avatar error:', error);
      return {
        success: false,
        message: 'An error occurred while uploading the image'
      };
    }
  }

  async updateProfile(profileData) {
    try {
      console.log('Updating profile...');
      
      if (!profileData || Object.keys(profileData).length === 0) {
        return {
          success: false,
          message: 'No data to update'
        };
      }
      
      const endpoints = [
        { url: '/api/auth/update-profile', method: 'put' },
        { url: '/api/auth/profile', method: 'patch' },
        { url: '/api/user/profile', method: 'put' }
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`Trying endpoint: ${endpoint.url}`);
          
          const response = await this.api({
            method: endpoint.method,
            url: endpoint.url,
            data: profileData,
          });

          console.log('Profile updated successfully via:', endpoint.url);
          
          const currentUser = this.getCurrentUser();
          if (currentUser && response.data.user) {
            const updatedUser = { ...currentUser, ...response.data.user };
            localStorage.setItem('user', JSON.stringify(updatedUser));
          }
          
          return {
            success: true,
            message: 'Profile updated successfully',
            data: response.data
          };
        } catch (error) {
          console.log(`Endpoint ${endpoint.url} error:`, error.message);
          
          if (error.response?.status === 400) {
            return {
              success: false,
              message: error.response.data?.message || 'Invalid data provided'
            };
          }
          
          continue;
        }
      }

      return {
        success: false,
        message: 'Profile update service is currently unavailable. Please contact support.'
      };
      
    } catch (error) {
      return {
        success: false,
        message: 'An error occurred while updating profile'
      };
    }
  }

  async getUserProfile(userId) {
    try {
      if (!userId) {
        return {
          success: false,
          message: 'User ID is required'
        };
      }
      
      const response = await this.api.get(`/api/user/profile/${userId}`);

      return {
        success: true,
        data: response.data.user
      };
    } catch (error) {
      if (error.response?.status === 404) {
        return {
          success: false,
          message: 'User not found'
        };
      }
      
      return {
        success: false,
        message: error.response?.data?.message || 'An error occurred while loading profile'
      };
    }
  }


  validateImageFile(file) {
    if (!file) return { valid: false, message: 'No file selected' };
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return { 
        valid: false, 
        message: 'Please select a valid image file (JPEG, PNG, GIF)' 
      };
    }
    
    const maxSize = 5 * 1024 * 1024; 
    if (file.size > maxSize) {
      return { 
        valid: false, 
        message: 'Image size should be less than 5MB' 
      };
    }
    
    return { valid: true };
  }

  createAvatarPreview(file) {
    return new Promise((resolve) => {
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          url: e.target.result,
          name: file.name,
          size: file.size
        });
      };
      reader.readAsDataURL(file);
    });
  }

  compressAvatar(file, maxSize = 150) {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        const size = Math.min(img.width, img.height);
        canvas.width = maxSize;
        canvas.height = maxSize;

        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        
        ctx.drawImage(img, sx, sy, size, size, 0, 0, maxSize, maxSize);

        canvas.toBlob(resolve, 'image/jpeg', 0.8);
      };

      img.src = URL.createObjectURL(file);
    });
  }

  validatePassword(password) {
    const requirements = {
      minLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };

    const score = Object.values(requirements).filter(Boolean).length;
    
    let strength = 'weak';
    if (score >= 4) strength = 'strong';
    else if (score >= 3) strength = 'medium';

    return {
      isValid: score >= 3,
      strength,
      score,
      requirements,
      message: this.getPasswordMessage(requirements, strength)
    };
  }

  getPasswordMessage(requirements, strength) {
    const missing = [];
    if (!requirements.minLength) missing.push('8 characters');
    if (!requirements.hasUpperCase) missing.push('uppercase letter');
    if (!requirements.hasLowerCase) missing.push('lowercase letter');
    if (!requirements.hasNumbers) missing.push('number');
    if (!requirements.hasSpecialChars) missing.push('special character');

    if (missing.length === 0) {
      return `Password strength: ${strength}`;
    }

    return `Password needs: ${missing.join(', ')}`;
  }

  cacheUserProfile(userId, profileData) {
    try {
      const cacheKey = `userProfile_${userId}`;
      const cacheData = {
        data: profileData,
        timestamp: Date.now()
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error caching user profile:', error);
    }
  }

  getCachedUserProfile(userId, maxAge = 10 * 60 * 1000) { 
    try {
      const cacheKey = `userProfile_${userId}`;
      const cached = localStorage.getItem(cacheKey);
      
      if (cached) {
        const cacheData = JSON.parse(cached);
        const isExpired = Date.now() - cacheData.timestamp > maxAge;
        
        if (!isExpired) {
          return {
            success: true,
            data: cacheData.data,
            fromCache: true
          };
        }
      }
    } catch (error) {
      console.error('Error reading cached user profile:', error);
    }
    
    return {
      success: false,
      data: null,
      fromCache: false
    };
  }

  async getUserProfileWithCache(userId, useCache = true) {
    if (useCache) {
      const cached = this.getCachedUserProfile(userId);
      if (cached.success) {
        console.log('Using cached user profile');
        return cached;
      }
    }

    const result = await this.getUserProfile(userId);
    
    if (result.success) {
      this.cacheUserProfile(userId, result.data);
    }
    
    return result;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  clearUserData() {
    localStorage.removeItem('userToken');
    localStorage.removeItem('userData');
    localStorage.removeItem('user');
    
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('userProfile_')) {
        localStorage.removeItem(key);
      }
    });
  }

  subscribeToProfileUpdates(userId, callback) {
    const interval = setInterval(async () => {
      const result = await this.getUserProfile(userId);
      if (result.success && callback) {
        callback(result.data);
      }
    }, 60000); 

    return () => clearInterval(interval);
  }

  async getFriends(userId) {
    try {
      console.log('Fetching friends for user:', userId);
      
      const response = await this.api.get(`/api/users/${userId}/friends`);
      
      return {
        success: true,
        data: response.data.friends || response.data || []
      };
    } catch (error) {
      console.error('Get friends error:', error);
      
      if (error.response?.status === 404) {
        return {
          success: true,
          data: []
        };
      }
      
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch friends',
        data: []
      };
    }
  }

  async getSuggestedUsers(limit = 3) {
    try {
      console.log('Fetching suggested users...');
      
      const currentUser = this.getCurrentUser();
      const userId = currentUser?.id || currentUser?._id;
      
      const response = await this.api.get('/api/users/suggested', {
        params: { limit },
        headers: {
          'x-user-id': userId || 'temp-user-id'
        }
      });
      
      console.log('Suggested users fetched:', response.data);
      
      return {
        success: true,
        data: response.data.data || response.data || []
      };
    } catch (error) {
      console.error('Get suggested users error:', error);
      
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to fetch suggested users',
        data: []
      };
    }
  }
}

export const userService = new UserService();