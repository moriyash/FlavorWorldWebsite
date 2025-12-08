import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

class StatisticsService {
  constructor() {
    this.baseURL = `${API_BASE_URL}/api/statistics`;
    
    this.api = axios.create({
      baseURL: API_BASE_URL,
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
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status >= 500) {
          console.error('Server error:', error.response.status);
        }
        return Promise.reject(error);
      }
    );
  }

  setAuthToken(token) {
    if (token) {
      localStorage.setItem('authToken', token);
    } else {
      localStorage.removeItem('authToken');
    }
  }

  async getUserStatistics(userId) {
    try {
      console.log('Fetching user statistics');
      
      const response = await this.api.get(`/api/statistics/user/${userId}`);

      if (response.data && response.data.success) {
        console.log('Statistics fetched successfully');
        return {
          success: true,
          data: response.data.data
        };
      } else {
        console.log('No statistics data available');
        return {
          success: false,
          message: response.data?.message || 'Failed to fetch statistics'
        };
      }
    } catch (error) {
      if (error.response) {
        return {
          success: false,
          message: error.response.data?.message || `Server error: ${error.response.status}`,
          status: error.response.status
        };
      } else if (error.request) {
        return {
          success: false,
          message: 'Network error - server not responding'
        };
      } else {
        return {
          success: false,
          message: error.message || 'Request configuration error'
        };
      }
    }
  }

  async getLikesProgression(userId) {
    try {
      console.log('Fetching likes progression');
      
      const response = await this.api.get(`/api/statistics/likes-progression/${userId}`);
      
      if (response.data && response.data.success) {
        console.log('Likes progression fetched successfully');
        return {
          success: true,
          data: response.data.data
        };
      } else {
        console.log('No likes progression data available');
        return {
          success: false,
          message: response.data?.message || 'Failed to fetch likes progression'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Network error occurred'
      };
    }
  }

  async getFollowersGrowth(userId) {
    try {
      console.log('Fetching followers data');
      
      const response = await this.api.get(`/api/users/${userId}/follow-status/${userId}`);
      
      if (response.data && response.data.followersCount !== undefined) {
        console.log('Followers data retrieved successfully');
        
        const currentFollowers = response.data.followersCount;
        
        const followersGrowth = [{
          month: new Date().toLocaleString('default', { month: 'short' }),
          monthYear: new Date().toLocaleString('default', { month: 'short', year: 'numeric' }),
          date: new Date(),
          followers: currentFollowers
        }];
        
        return {
          success: true,
          data: followersGrowth,
          currentFollowersCount: currentFollowers
        };
      } else {
        console.log('No followers data available');
        return {
          success: false,
          message: 'No followers data available'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Network error occurred'
      };
    }
  }

  async getCategoriesDistribution(userId) {
    try {
      console.log('Fetching categories distribution');
      
      const response = await this.api.get(`/api/statistics/categories-distribution/${userId}`);
      
      if (response.data && response.data.success) {
        console.log('Categories distribution fetched successfully');
        return {
          success: true,
          data: response.data.data
        };
      } else {
        console.log('No categories distribution data available');
        return {
          success: false,
          message: response.data?.message || 'Failed to fetch categories distribution'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Network error occurred'
      };
    }
  }

  processRealUserData(userPosts, userId) {
    console.log('Processing user data');
    
    if (!userPosts || userPosts.length === 0) {
      console.log('No posts found for user');
      return {
        totalPosts: 0,
        totalLikes: 0,
        totalFollowers: 0,
        averageLikes: 0,
        likesProgression: [],
        categoriesDistribution: [],
        followersGrowth: []
      };
    }

    console.log('User data processed successfully');

    const totalPosts = userPosts.length;
    const totalLikes = userPosts.reduce((sum, post) => sum + (post.likes?.length || 0), 0);
    
    const likesProgression = userPosts
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map((post, index) => ({
        postIndex: index + 1,
        likes: post.likes?.length || 0,
        postTitle: post.title || post.recipeName || `Recipe ${index + 1}`,
        date: new Date(post.createdAt),
        postId: post._id || post.id,
        createdAt: post.createdAt
      }));

    const categoriesMap = {};
    userPosts.forEach(post => {
      const category = post.category || post.cuisine || 'Other';
      categoriesMap[category] = (categoriesMap[category] || 0) + 1;
    });

    const categoriesDistribution = Object.entries(categoriesMap).map(([category, count]) => ({
      category,
      count,
      percentage: totalPosts > 0 ? Math.round((count / totalPosts) * 100) : 0
    }));

    const followersGrowth = [];

    const processedData = {
      totalPosts,
      totalLikes,
      totalFollowers: 0,
      averageLikes: totalPosts > 0 ? Math.round(totalLikes / totalPosts) : 0,
      likesProgression,
      categoriesDistribution,
      followersGrowth
    };

    return processedData;
  }

  async testConnection() {
    try {
      console.log('Testing server connection');
      const response = await this.api.get('/api/statistics/health');
      console.log('Server connection successful');
      return {
        success: true,
        message: 'Server connection successful',
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        message: 'Server connection failed',
        error: error.message
      };
    }
  }

  async updateUserStatistics(userId, statsData) {
    try {
      console.log('Updating user statistics');
      
      const response = await this.api.put(`/api/statistics/user/${userId}`, statsData);
      
      if (response.data && response.data.success) {
        console.log('Statistics updated successfully');
        return {
          success: true,
          data: response.data.data,
          message: 'Statistics updated successfully'
        };
      } else {
        console.log('Statistics update failed');
        return {
          success: false,
          message: response.data?.message || 'Failed to update statistics'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Network error occurred'
      };
    }
  }


  cacheStatistics(userId, data) {
    try {
      const cacheKey = `statistics_${userId}`;
      const cacheData = {
        data,
        timestamp: Date.now()
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error caching statistics:', error);
    }
  }

  getCachedStatistics(userId, maxAge = 5 * 60 * 1000) { 
    try {
      const cacheKey = `statistics_${userId}`;
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
      console.error('Error reading cached statistics:', error);
    }
    
    return {
      success: false,
      data: null,
      fromCache: false
    };
  }

  async getUserStatisticsWithCache(userId, useCache = true) {
    if (useCache) {
      const cached = this.getCachedStatistics(userId);
      if (cached.success) {
        console.log('Using cached statistics');
        return cached;
      }
    }

    const result = await this.getUserStatistics(userId);
    
    if (result.success) {
      this.cacheStatistics(userId, result.data);
    }
    
    return result;
  }

  generateInsights(statisticsData) {
    if (!statisticsData) return null;

    const insights = {
      performance: this.analyzePerformance(statisticsData),
      trends: this.analyzeTrends(statisticsData),
      recommendations: this.generateRecommendations(statisticsData)
    };

    return insights;
  }

  analyzePerformance(data) {
    const { totalPosts, totalLikes, averageLikes, likesProgression } = data;
    
    let performance = 'average';
    let message = 'Your posts are performing well!';
    
    if (averageLikes > 50) {
      performance = 'excellent';
      message = 'Amazing! Your posts get lots of engagement!';
    } else if (averageLikes > 20) {
      performance = 'good';
      message = 'Great job! Your posts are well-received!';
    } else if (averageLikes < 5) {
      performance = 'needs_improvement';
      message = 'Consider improving your content strategy.';
    }

    let trend = 'stable';
    if (likesProgression.length >= 3) {
      const recent = likesProgression.slice(-3).map(p => p.likes);
      const earlier = likesProgression.slice(-6, -3).map(p => p.likes);
      
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
      
      if (recentAvg > earlierAvg * 1.2) {
        trend = 'improving';
      } else if (recentAvg < earlierAvg * 0.8) {
        trend = 'declining';
      }
    }

    return {
      level: performance,
      message,
      trend,
      score: Math.min(100, Math.round((averageLikes / 50) * 100))
    };
  }

  analyzeTrends(data) {
    const { categoriesDistribution, likesProgression } = data;
    
    const topCategory = categoriesDistribution.length > 0 
      ? categoriesDistribution.reduce((prev, current) => 
          prev.count > current.count ? prev : current
        )
      : null;

    const topPost = likesProgression.length > 0
      ? likesProgression.reduce((prev, current) => 
          prev.likes > current.likes ? prev : current
        )
      : null;

    return {
      topCategory,
      topPost,
      totalCategories: categoriesDistribution.length,
      diversityScore: this.calculateDiversityScore(categoriesDistribution)
    };
  }

  calculateDiversityScore(categoriesDistribution) {
    if (categoriesDistribution.length <= 1) return 0;
    
    const total = categoriesDistribution.reduce((sum, cat) => sum + cat.count, 0);
    const entropy = categoriesDistribution.reduce((entropy, cat) => {
      const probability = cat.count / total;
      return entropy - (probability * Math.log2(probability));
    }, 0);
    
    const maxEntropy = Math.log2(categoriesDistribution.length);
    return Math.round((entropy / maxEntropy) * 100);
  }

  generateRecommendations(data) {
    const recommendations = [];
    const { totalPosts, averageLikes, categoriesDistribution } = data;

    if (totalPosts < 5) {
      recommendations.push({
        type: 'content',
        priority: 'high',
        message: 'Post more content to improve your reach!',
        action: 'Create more posts'
      });
    }

    if (averageLikes < 10) {
      recommendations.push({
        type: 'engagement',
        priority: 'medium',
        message: 'Try using better images and descriptions',
        action: 'Improve content quality'
      });
    }

    if (categoriesDistribution.length < 3) {
      recommendations.push({
        type: 'diversity',
        priority: 'low',
        message: 'Experiment with different recipe categories',
        action: 'Diversify content'
      });
    }

    return recommendations;
  }

  prepareChartData(statisticsData, chartType) {
    switch (chartType) {
      case 'likesProgression':
        return this.prepareLikesProgressionChart(statisticsData.likesProgression);
      
      case 'categoriesDistribution':
        return this.prepareCategoriesChart(statisticsData.categoriesDistribution);
      
      case 'followersGrowth':
        return this.prepareFollowersChart(statisticsData.followersGrowth);
      
      default:
        return null;
    }
  }

  prepareLikesProgressionChart(likesProgression) {
    return likesProgression.map(item => ({
      name: `Post ${item.postIndex}`,
      likes: item.likes,
      date: new Date(item.date).toLocaleDateString('he-IL')
    }));
  }

  prepareCategoriesChart(categoriesDistribution) {
    return categoriesDistribution.map(item => ({
      name: item.category,
      value: item.count,
      percentage: item.percentage
    }));
  }

  prepareFollowersChart(followersGrowth) {
    return followersGrowth.map(item => ({
      name: item.monthYear,
      followers: item.followers,
      date: new Date(item.date).toLocaleDateString('he-IL')
    }));
  }

  subscribeToStatisticsUpdates(userId, callback) {
    const interval = setInterval(async () => {
      const result = await this.getUserStatistics(userId);
      if (result.success && callback) {
        callback(result.data);
      }
    }, 60000); 

    return () => clearInterval(interval);
  }

  exportStatistics(statisticsData, format = 'json') {
    const exportData = {
      ...statisticsData,
      exportDate: new Date().toISOString(),
      generatedBy: 'Recipe App Statistics Service'
    };

    switch (format) {
      case 'json':
        return JSON.stringify(exportData, null, 2);
      
      case 'csv':
        return this.convertToCSV(exportData);
      
      default:
        return exportData;
    }
  }

  convertToCSV(data) {
    const headers = ['Metric', 'Value'];
    const rows = [
      ['Total Posts', data.totalPosts],
      ['Total Likes', data.totalLikes],
      ['Average Likes', data.averageLikes],
      ['Total Followers', data.totalFollowers]
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    return csvContent;
  }
}

const statisticsServiceInstance = new StatisticsService();

export const statisticsService = statisticsServiceInstance;
export default statisticsServiceInstance;