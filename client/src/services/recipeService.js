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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    return Promise.reject(error);
  }
);

export const recipeService = {
  testConnection: async () => {
    try {
      console.log('Testing server connection...');
      const response = await api.get('/');
      console.log('Server connection successful');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  getFeed: async (userId) => {
    try {
      console.log('Fetching personalized feed for user:', userId);
      const response = await api.get(`/feed?userId=${userId}`);
      console.log('Feed response:', response.data?.length || 0, 'posts');
      
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch feed'
      };
    }
  },

  getUserGroupsPosts: async (userId) => {
    try {
      console.log('Fetching user groups posts for:', userId);
      const response = await api.get(`/groups/my-posts?userId=${userId}`);
      console.log('Groups posts response:', response.data?.length || 0, 'posts');
      
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch groups posts'
      };
    }
  },

  getFollowingPosts: async (userId) => {
    try {
      console.log('Fetching following posts for user:', userId);
      const response = await api.get(`/following/posts?userId=${userId}`);
      console.log('Following posts response:', response.data?.length || 0, 'posts');
      
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch following posts'
      };
    }
  },

  createRecipe: async (recipeData, mediaFile = null, mediaType = null) => {
    try {
      console.log('🍳 Creating recipe on server...', recipeData.title);
      
      if (!recipeData || !recipeData.title) {
        return {
          success: false,
          message: 'Recipe title is required. Please add a title and try again.'
        };
      }

      if (!recipeData.userId) {
        console.error(' No userId provided');
        return {
          success: false,
          message: 'User information is missing. Please try logging in again.'
        };
      }

      const hasMedia = mediaFile instanceof File;
      const detectedMediaType = mediaType || (hasMedia ? (
        mediaFile.type.startsWith('video/') ? 'video' : 'image'
      ) : 'none');

      console.log(' Media info:', {
        hasMedia,
        mediaType: detectedMediaType,
        fileName: hasMedia ? mediaFile.name : 'none',
        fileSize: hasMedia ? mediaFile.size : 0
      });

      if (hasMedia) {
        console.log(` ${detectedMediaType} detected, using FormData...`);
        
        const formData = new FormData();
        
        formData.append('title', recipeData.title || '');
        formData.append('description', recipeData.description || '');
        formData.append('ingredients', recipeData.ingredients || '');
        formData.append('instructions', recipeData.instructions || '');
        formData.append('category', recipeData.category || 'Asian');
        formData.append('meatType', recipeData.meatType || 'Mixed');
        formData.append('prepTime', Math.max(0, recipeData.prepTime || 0).toString());
        formData.append('servings', Math.max(1, recipeData.servings || 1).toString());
        formData.append('userId', recipeData.userId || '');
        formData.append('userName', recipeData.userName || 'Anonymous Chef');
        formData.append('userAvatar', recipeData.userAvatar || '');
        formData.append('mediaType', detectedMediaType);

        if (detectedMediaType === 'video' && recipeData.videoDuration) {
          formData.append('videoDuration', recipeData.videoDuration.toString());
        }

        if (detectedMediaType === 'video') {
          formData.append('video', mediaFile);
          console.log(' Video file added to FormData');
        } else {
          formData.append('image', mediaFile);
          console.log(' Image file added to FormData');
        }

        const uploadTimeout = detectedMediaType === 'video' ? 300000 : 120000;

        const response = await api.post('/recipes', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          timeout: uploadTimeout,
          onUploadProgress: (progressEvent) => {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            console.log(` Upload progress: ${progress}%`);
            
            if (recipeData.onUploadProgress) {
              recipeData.onUploadProgress(progress);
            }
          }
        });

        console.log(` Recipe with ${detectedMediaType} uploaded successfully!`);
        return { success: true, data: response.data };

      } else {
        console.log(' No media, using JSON...');
        
        const jsonData = {
          title: recipeData.title,
          description: recipeData.description,
          ingredients: recipeData.ingredients,
          instructions: recipeData.instructions,
          category: recipeData.category || 'Asian',
          meatType: recipeData.meatType || 'Mixed',
          prepTime: Math.max(0, recipeData.prepTime || 0),
          servings: Math.max(1, recipeData.servings || 1),
          userId: recipeData.userId || '',
          userName: recipeData.userName || 'Anonymous Chef',
          userAvatar: recipeData.userAvatar || null,
          mediaType: 'none'
        };

        console.log(' Sending JSON data:', {
          ...jsonData,
          userId: jsonData.userId,
          userName: jsonData.userName,
          category: jsonData.category,
          meatType: jsonData.meatType
        });

        const response = await api.post('/recipes', jsonData, {
          headers: {
            'Content-Type': 'application/json',
          },
        });

        console.log(' Recipe without media uploaded successfully!');
        return { success: true, data: response.data };
      }

    } catch (error) {
      let errorMessage = 'Failed to create recipe';
      
      console.error(' Recipe creation error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        code: error.code
      });
      
      if (error.response) {
        errorMessage = error.response.data?.message || `Server error: ${error.response.status}`;
        
        if (error.response.status === 400) {
          const validationDetails = error.response.data?.errors || [];
          if (validationDetails.length > 0) {
            errorMessage = `Validation error: ${validationDetails.join(', ')}`;
          }
        } else if (error.response.status === 413) {
          errorMessage = 'File too large. Please use a smaller image or video.';
        }
      } else if (error.request) {
        errorMessage = 'No response from server. Check your connection.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Upload took too long. Please try again with a smaller file.';
      } else {
        errorMessage = error.message || 'Unknown error occurred';
      }
      
      console.error(' Recipe creation error:', errorMessage);
      
      return {
        success: false,
        message: errorMessage,
        details: error.response?.data
      };
    }
  },

  getAllRecipes: async (userId = null) => {
    try {
      if (userId) {
        console.log(' Fetching personalized feed...');
        const result = await recipeService.getFeed(userId);
        return result;
      } else {
        console.log(' Fetching all recipes from server...');
        const response = await api.get('/recipes');
        console.log(` Server response: ${response.data?.length || 0} recipes`);
        
        return { success: true, data: response.data };
      }
    } catch (error) {
      console.error(' Get recipes error:', error.message);
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch recipes'
      };
    }
  },

  getRecipeById: async (recipeId) => {
    try {
      const response = await api.get(`/recipes/${recipeId}`);
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to fetch recipe'
      };
    }
  },

  updateRecipe: async (recipeId, updateData, mediaFile = null, mediaType = null) => {
    try {
      console.log('Updating recipe...', recipeId);
      console.log('Update data:', updateData);
      console.log('Media file:', mediaFile ? mediaFile.name : 'none');
      console.log('Media Type:', mediaType);
      
      const formData = new FormData();
      
      formData.append('title', updateData.title || '');
      formData.append('description', updateData.description || '');
      formData.append('ingredients', updateData.ingredients || '');
      formData.append('instructions', updateData.instructions || '');
      formData.append('category', updateData.category || 'General');
      formData.append('meatType', updateData.meatType || 'Mixed');
      formData.append('prepTime', updateData.prepTime?.toString() || '0');
      formData.append('servings', updateData.servings?.toString() || '1');
      formData.append('userId', updateData.userId || '');
      formData.append('mediaType', updateData.mediaType || 'none');

      if (updateData.videoDuration && (updateData.mediaType === 'video' || mediaType === 'video')) {
        formData.append('videoDuration', updateData.videoDuration.toString());
      }

      if (mediaFile instanceof File) {
        if (mediaType === 'video' || mediaFile.type.startsWith('video/')) {
          console.log('Adding new video to update');
          formData.append('video', mediaFile);
        } else {
          console.log('Adding new image to update');
          formData.append('image', mediaFile);
        }
      } else {
        if (updateData.image) {
          console.log('Keeping existing image');
          formData.append('existingImage', updateData.image);
        }
        if (updateData.video) {
          console.log('Keeping existing video');
          formData.append('existingVideo', updateData.video);
        }
      }

      const response = await api.put(`/recipes/${recipeId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000,
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`Update progress: ${progress}%`);
          
          if (updateData.onUploadProgress) {
            updateData.onUploadProgress(progress);
          }
        }
      });

      console.log('Recipe updated successfully');
      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      let errorMessage = 'Failed to update recipe';
      
      if (error.response) {
        errorMessage = error.response.data?.message || `Server error: ${error.response.status}`;
      } else if (error.request) {
        errorMessage = 'No response from server. Check your connection.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Update took too long. Please try again.';
      } else {
        errorMessage = error.message || 'Unknown error occurred';
      }
      
      return {
        success: false,
        message: errorMessage,
        details: error.response?.data
      };
    }
  },

  deleteRecipe: async (recipeId, postData = null) => {
    try {
      console.log('Deleting recipe from server:', recipeId);
      console.log('Post data:', postData);
      
      if (postData && postData.groupId) {
        console.log('Deleting group post via groupService...');
        
        const { groupService } = await import('./groupService');
        
        const result = await groupService.deleteGroupPost(
          postData.groupId, 
          recipeId, 
          postData.userId || postData.authorId
        );
        
        if (result.success) {
          console.log('Group post deleted successfully');
          return { success: true };
        } else {
          return {
            success: false,
            message: result.message || 'Failed to delete group post'
          };
        }
      }
      
      if (postData && (postData.isGroupPost || postData.group)) {
        const groupId = postData.group?._id || postData.group?.id || postData.groupId;
        
        if (groupId) {
          console.log('Detected group post, using group endpoint...');
          
          try {
            await api.delete(`/groups/${groupId}/posts/${recipeId}`);
            console.log('Group post deleted via direct API call');
            return { success: true };
          } catch (groupError) {
            console.warn('Group endpoint failed, trying regular endpoint...', groupError.message);
          }
        }
      }
      
      console.log('Deleting regular post...');
      await api.delete(`/recipes/${recipeId}`);
      console.log('Regular post deleted successfully');
      return { success: true };
      
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        const errorMessage = error.response.data?.message || '';
        
        if (status === 403) {
          return {
            success: false,
            message: 'You are not authorized to delete this post'
          };
        }
        
        if (status === 404) {
          return {
            success: false,
            message: 'Post not found or already deleted'
          };
        }
        
        return {
          success: false,
          message: errorMessage || 'Failed to delete post'
        };
      }
      
      return {
        success: false,
        message: 'Network error. Please check your connection and try again.'
      };
    }
  },

  deletePost: async (postId, postData) => {
    try {
      console.log('Auto-detecting post type for deletion:', postId);
      
      const isGroupPost = postData && (
        postData.groupId || 
        postData.group || 
        postData.isGroupPost ||
        postData.type === 'group' ||
        postData.postType === 'group'
      );
      
      if (isGroupPost) {
        console.log('Identified as group post');
        const groupId = postData.groupId || postData.group?._id || postData.group?.id;
        const userId = postData.userId || postData.authorId || postData.author?._id;
        
        if (!groupId) {
          return {
            success: false,
            message: 'Unable to delete group post. Missing group information.'
          };
        }
        
        const { groupService } = await import('./groupService');
        const result = await groupService.deleteGroupPost(groupId, postId, userId);
        return result;
      } else {
        console.log('Identified as regular post');
        await api.delete(`/recipes/${postId}`);
        return { success: true };
      }
      
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to delete post'
      };
    }
  },

  likeRecipe: async (recipeId, userId) => {
    try {
      console.log('Liking recipe on server:', recipeId, 'by user:', userId);
      const response = await api.post(`/recipes/${recipeId}/like`, {
        userId: userId 
      });
      console.log('Like response:', response.data);
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to like recipe'
      };
    }
  },

  unlikeRecipe: async (recipeId, userId) => {
    try {
      console.log('Unliking recipe on server:', recipeId, 'by user:', userId);
      const response = await api.delete(`/recipes/${recipeId}/like`, {
        data: { userId: userId } 
      });
      console.log('Unlike response:', response.data);
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to unlike recipe'
      };
    }
  },

  addComment: async (recipeId, commentData) => {
    try {
      console.log('Adding comment to server:', recipeId);
      const response = await api.post(`/recipes/${recipeId}/comments`, {
        text: commentData.text,
        userId: commentData.userId,
        userName: commentData.userName,
        userAvatar: commentData.userAvatar
      });
      
      return { 
        success: true, 
        data: response.data.data || response.data 
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to add comment'
      };
    }
  },
  

  deleteComment: async (recipeId, commentId) => {
    try {
      console.log('Deleting comment from server:', commentId);
      await api.delete(`/recipes/${recipeId}/comments/${commentId}`);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to delete comment'
      };
    }
  },
 saveRecipe: async (recipeId) => {
  try {
    const response = await api.post(`/recipes/${recipeId}/save`);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to save recipe'
    };
  }
},

unsaveRecipe: async (recipeId) => {
  try {
    const response = await api.delete(`/recipes/${recipeId}/save`);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to unsave recipe'
    };
  }
},

getSavedRecipes: async () => {
  try {
    const response = await api.get('/recipes/saved/all');
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || 'Failed to get saved recipes'
    };
  }
},
  
  validateMediaFile: (file) => {
    if (!file) return { valid: false, message: 'No file selected' };
    
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
    const allowedVideoTypes = ['video/mp4', 'video/mov', 'video/avi'];
    const allAllowedTypes = [...allowedImageTypes, ...allowedVideoTypes];
    
    if (!allAllowedTypes.includes(file.type)) {
      return { 
        valid: false, 
        message: 'Please select a valid image (JPEG, PNG, GIF) or video (MP4, MOV, AVI) file' 
      };
    }
    
    const maxImageSize = 10 * 1024 * 1024; 
    const maxVideoSize = 100 * 1024 * 1024; 
    
    const isVideo = allowedVideoTypes.includes(file.type);
    const maxSize = isVideo ? maxVideoSize : maxImageSize;
    
    if (file.size > maxSize) {
      const sizeLimit = isVideo ? '100MB' : '10MB';
      return { 
        valid: false, 
        message: `File size should be less than ${sizeLimit}` 
      };
    }
    
    return { 
      valid: true, 
      isVideo,
      mediaType: isVideo ? 'video' : 'image'
    };
  },

  createMediaPreview: (file) => {
    return new Promise((resolve) => {
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          url: e.target.result,
          type: file.type.startsWith('video/') ? 'video' : 'image',
          name: file.name,
          size: file.size
        });
      };
      reader.readAsDataURL(file);
    });
  },

  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  compressImage: (file, maxWidth = 1920, quality = 0.8) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
        const width = img.width * ratio;
        const height = img.height * ratio;

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(resolve, 'image/jpeg', quality);
      };

      img.src = URL.createObjectURL(file);
    });
  },

  getTrendingRecipes: async () => {
    try {
      const response = await api.get('/recipes/trending/top');
      return response.data;
    } catch (error) {
      console.error('Error fetching trending recipes:', error);
      return { success: false, data: [] };
    }
  }
  
};