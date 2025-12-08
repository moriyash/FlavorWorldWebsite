import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  TrendingUp,
  Users,
  PieChart,
  Heart,
  BookOpen,
  Star,
  Loader2
} from 'lucide-react';
import './UserStatisticsScreen.css';
import { statisticsService } from '../../services/statisticsService';
import { recipeService } from '../../services/recipeService';
import { groupService } from '../../services/groupService';
import { followService } from '../../services/followService';
import { userService } from '../../services/userService';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const COLORS = {
  primary: '#F5A623',
  secondary: '#4ECDC4',
  accent: '#1F3A93',
  success: '#27AE60',
  danger: '#E74C3C',
  warning: '#F39C12',
  info: '#3498DB',
  purple: '#9B59B6',
  pink: '#E91E63'
};

const generateFollowersGrowthData = (followersData, userCreatedAt) => {
  const now = new Date();
  const accountCreationDate = userCreatedAt ? new Date(userCreatedAt) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
  
  const startDate = new Date(Math.max(
    accountCreationDate.getTime(),
    new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime()
  ));
  
  const monthsSinceCreation = Math.floor((now - startDate) / (1000 * 60 * 60 * 24 * 30));
  const monthsToShow = Math.min(monthsSinceCreation + 1, 6); 
  const followersByMonth = {};
  
  followersData.forEach(follower => {
    if (follower.followedAt) {
      const followDate = new Date(follower.followedAt);
      const monthKey = `${followDate.getFullYear()}-${followDate.getMonth()}`;
      if (!followersByMonth[monthKey]) {
        followersByMonth[monthKey] = 0;
      }
      followersByMonth[monthKey]++;
    }
  });
  
  const months = [];
  let cumulativeCount = 0;
  
  for (let i = monthsToShow - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    
    if (date >= new Date(accountCreationDate.getFullYear(), accountCreationDate.getMonth(), 1)) {
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      const monthName = date.toLocaleString('en-US', { month: 'short' });
      const monthYear = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      
      if (followersByMonth[monthKey]) {
        cumulativeCount += followersByMonth[monthKey];
      }
      
      const followers = (i === 0) ? followersData.length : cumulativeCount;
      
      months.push({
        month: monthName,
        monthYear: monthYear,
        date: date,
        followers: Math.max(0, followers)
      });
    }
  }
  
  return months;
};

const UserStatisticsScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId');
  
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('likes');
  const [statsData, setStatsData] = useState({
    totalLikes: 0,
    totalFollowers: 0,
    totalPosts: 0,
    averageLikes: 0,
    likesProgression: [],
    followersGrowth: [],
    categoriesDistribution: []
  });

  useEffect(() => {
    let canceled = false;

    const loadData = async () => {
      setLoading(true);
      
      try {
        const regularPostsResult = await recipeService.getAllRecipes();
        if (canceled) return;
        
        let userPosts = [];
        
        if (regularPostsResult.success) {
          const regularPosts = Array.isArray(regularPostsResult.data) 
            ? regularPostsResult.data 
            : [];
          userPosts = regularPosts.filter(post => 
            post.userId === userId || 
            post.user?.id === userId || 
            post.user?._id === userId
          );
        }

        try {
          const groupsResult = await groupService.getAllGroups(userId);
          if (canceled) return;
          
          if (groupsResult.success) {
            const userGroups = groupsResult.data.filter(group => 
              groupService.isMember(group, userId)
            );

            for (const group of userGroups) {
              try {
                const groupPostsResult = await groupService.getGroupPosts(group._id, userId);
                if (canceled) return;
                
                if (groupPostsResult.success && groupPostsResult.data) {
                  const userPostsInGroup = groupPostsResult.data.filter(post => 
                    post.userId === userId || 
                    post.user?.id === userId || 
                    post.user?._id === userId
                  );
                  
                  userPosts = [...userPosts, ...userPostsInGroup];
                }
              } catch (error) {
                console.error('Error loading group posts:', error);
              }
            }
          }
        } catch (error) {
          console.error('Error loading groups:', error);
        }

        if (canceled) return;
        
        const realUserData = statisticsService.processRealUserData(userPosts, userId);
        
        try {
          let userCreatedAt = null;
          try {
            const userProfileResult = await userService.getUserProfile(userId);
            if (userProfileResult.success && userProfileResult.data) {
              userCreatedAt = userProfileResult.data.createdAt;
            }
          } catch (error) {
            console.error('Error loading user profile:', error);
          }
          
          const followersResult = await followService.getFollowers(userId);
          if (canceled) return;
          
          let followersCount = 0;
          let followersData = [];
          
          if (followersResult.success && Array.isArray(followersResult.data)) {
            followersCount = followersResult.data.length;
            followersData = followersResult.data;
          }
          
          const followersGrowth = generateFollowersGrowthData(followersData, userCreatedAt);
          realUserData.followersGrowth = followersGrowth;
          realUserData.totalFollowers = followersCount;
          
        } catch (followersError) {
          console.error('Followers error:', followersError);
          realUserData.followersGrowth = [];
          realUserData.totalFollowers = 0;
        }
        
        if (canceled) return;
        setStatsData(realUserData);
        
      } catch (error) {
        console.error('Statistics loading failed:', error);
        
        if (canceled) return;
        const fallbackData = {
          totalLikes: 0,
          totalFollowers: 0,
          totalPosts: 0,
          averageLikes: 0,
          likesProgression: [],
          followersGrowth: [],
          categoriesDistribution: []
        };
        setStatsData(fallbackData);
      } finally {
        if (canceled) return;
        setLoading(false);
      }
    };

    loadData();

    return () => {
      canceled = true;
    };
  }, [userId]);

  const getLikesChartData = () => {
    if (!statsData.likesProgression || statsData.likesProgression.length === 0) {
      return null;
    }

    return {
      labels: statsData.likesProgression.map(d => {
        const title = d.postTitle || `Recipe ${d.postIndex}`;
        return title.length > 15 ? title.substring(0, 15) + '...' : title;
      }),
      datasets: [
        {
          label: 'Likes',
          data: statsData.likesProgression.map(d => d.likes),
          borderColor: COLORS.primary,
          backgroundColor: `${COLORS.primary}33`,
          fill: true,
          tension: 0.4,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: COLORS.primary,
          pointBorderColor: '#fff',
          pointBorderWidth: 2
        }
      ]
    };
  };

  const getFollowersChartData = () => {
    if (!statsData.followersGrowth || statsData.followersGrowth.length === 0) {
      return null;
    }

    return {
      labels: statsData.followersGrowth.map(d => d.monthYear),
      datasets: [
        {
          label: 'Followers',
          data: statsData.followersGrowth.map(d => d.followers),
          backgroundColor: COLORS.secondary,
          borderRadius: 8,
          hoverBackgroundColor: COLORS.accent
        }
      ]
    };
  };

  const getCategoriesChartData = () => {
    if (!statsData.categoriesDistribution || statsData.categoriesDistribution.length === 0) {
      return null;
    }

    const colors = [
      COLORS.primary,
      COLORS.secondary,
      COLORS.accent,
      COLORS.success,
      COLORS.warning,
      COLORS.info,
      COLORS.purple,
      COLORS.pink
    ];

    return {
      labels: statsData.categoriesDistribution.map(d => d.category),
      datasets: [
        {
          data: statsData.categoriesDistribution.map(d => d.count),
          backgroundColor: colors.slice(0, statsData.categoriesDistribution.length),
          borderWidth: 2,
          borderColor: '#fff',
          hoverBorderWidth: 3
        }
      ]
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        titleFont: {
          size: 14,
          weight: 'bold'
        },
        bodyFont: {
          size: 13
        },
        callbacks: {
          title: function(context) {
            const index = context[0].dataIndex;
            const post = statsData.likesProgression[index];
            return post?.postTitle || `Recipe ${index + 1}`;
          },
          label: function(context) {
            return `Likes: ${context.parsed.y}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 11
          },
          maxRotation: 45,
          minRotation: 45
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        },
        ticks: {
          font: {
            size: 12
          }
        }
      }
    }
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context) {
            return `Followers: ${context.parsed.y}`;
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 15,
          font: {
            size: 12
          },
          generateLabels: function(chart) {
            const data = chart.data;
            if (data.labels.length && data.datasets.length) {
              return data.labels.map((label, i) => {
                const value = data.datasets[0].data[i];
                const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return {
                  text: `${label} (${percentage}%)`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  hidden: false,
                  index: i
                };
              });
            }
            return [];
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: 12,
        cornerRadius: 8,
        callbacks: {
          label: function(context) {
            const label = context.label || '';
            const value = context.parsed;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: ${value} recipes (${percentage}%)`;
          }
        }
      }
    }
  };

  const renderStatsCards = () => (
    <div className="stats-cards">
      <div className="stat-card">
        <div className="stat-icon" style={{ color: COLORS.danger }}>
          <Heart size={24} />
        </div>
        <div className="stat-info">
          <h3>{statsData.totalLikes}</h3>
          <p>Total Likes</p>
        </div>
      </div>
      
      <div className="stat-card">
        <div className="stat-icon" style={{ color: COLORS.secondary }}>
          <Users size={24} />
        </div>
        <div className="stat-info">
          <h3>{statsData.totalFollowers}</h3>
          <p>Followers</p>
        </div>
      </div>
      
      <div className="stat-card">
        <div className="stat-icon" style={{ color: COLORS.primary }}>
          <BookOpen size={24} />
        </div>
        <div className="stat-info">
          <h3>{statsData.totalPosts}</h3>
          <p>Recipes</p>
        </div>
      </div>
      
      <div className="stat-card">
        <div className="stat-icon" style={{ color: COLORS.warning }}>
          <Star size={24} />
        </div>
        <div className="stat-info">
          <h3>{statsData.averageLikes}</h3>
          <p>Avg Likes</p>
        </div>
      </div>
    </div>
  );

  const renderLikesChart = () => {
    const chartData = getLikesChartData();

    if (!chartData) {
      return (
        <div className="empty-chart">
          <TrendingUp size={60} />
          <h3>No recipes yet</h3>
          <p>Start sharing recipes to see your likes progress!</p>
        </div>
      );
    }

    return (
      <div className="chart-container">
        <h3>Likes Progress per Recipe</h3>
        <p className="chart-subtitle">Track how each recipe performs</p>
        <div className="chart-wrapper">
          <Line data={chartData} options={chartOptions} />
        </div>
      </div>
    );
  };

  const renderFollowersChart = () => {
    const chartData = getFollowersChartData();

    if (!chartData) {
      return (
        <div className="empty-chart">
          <Users size={60} />
          <h3>No followers data yet</h3>
          <p>Followers growth data will appear here</p>
        </div>
      );
    }

    return (
      <div className="chart-container">
        <h3>Followers Growth Over Time</h3>
        <p className="chart-subtitle">Your community is growing!</p>
        <div className="chart-wrapper">
          <Bar data={chartData} options={barChartOptions} />
        </div>
      </div>
    );
  };

  const renderCategoriesChart = () => {
    const chartData = getCategoriesChartData();

    if (!chartData) {
      return (
        <div className="empty-chart">
          <PieChart size={60} />
          <h3>No categories yet</h3>
          <p>Share recipes with different categories to see distribution</p>
        </div>
      );
    }

    return (
      <div className="chart-container">
        <h3>Recipe Categories Distribution</h3>
        <p className="chart-subtitle">Diversity of your cooking style</p>
        <div className="chart-wrapper doughnut">
          <Doughnut data={chartData} options={doughnutOptions} />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="statistics-screen">
        <header className="stats-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
          </button>
          <h1>My Statistics</h1>
          <div className="header-placeholder" />
        </header>
        
        <div className="loading-container">
          <Loader2 className="spinner" size={40} />
          <p>Loading statistics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="statistics-screen">
      <header className="stats-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
        </button>
        <h1>My Statistics</h1>
        <div className="header-placeholder" />
      </header>

      <div className="stats-content">
        {renderStatsCards()}

        <div className="stats-tabs">
          <button
            className={selectedTab === 'likes' ? 'active' : ''}
            onClick={() => setSelectedTab('likes')}
          >
            <TrendingUp size={20} />
            <span>Likes Progress</span>
          </button>
          <button
            className={selectedTab === 'followers' ? 'active' : ''}
            onClick={() => setSelectedTab('followers')}
          >
            <Users size={20} />
            <span>Followers Growth</span>
          </button>
          <button
            className={selectedTab === 'categories' ? 'active' : ''}
            onClick={() => setSelectedTab('categories')}
          >
            <PieChart size={20} />
            <span>Categories</span>
          </button>
        </div>

        <div className="charts-section">
          {selectedTab === 'likes' && renderLikesChart()}
          {selectedTab === 'followers' && renderFollowersChart()}
          {selectedTab === 'categories' && renderCategoriesChart()}
        </div>
      </div>
    </div>
  );
};

export default UserStatisticsScreen;