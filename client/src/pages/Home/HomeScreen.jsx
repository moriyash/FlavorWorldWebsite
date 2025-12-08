import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart,
  MessageCircle,
  Search,
  SlidersHorizontal,
  Bell,
  X,
  RefreshCw,
  ChefHat,
  LogOut,
  Globe,
  Users as UsersIcon,
  Loader2,
  Home as HomeIcon,
  Plus
} from 'lucide-react';
import './HomeScreen.css';
import '../../index.css';
import { useAuth } from '../../services/AuthContext';
import { recipeService } from '../../services/recipeService';
import { feedService } from '../../services/feedService';
import { chatService } from '../../services/chatServices';
import { userService } from '../../services/userService';
import PostComponent from '../../components/common/PostComponent';
import CreatePostComponent from '../../components/common/CreatePostComponent';
import SharePostComponent from '../../components/common/SharePostComponent';
import UserAvatar from '../../components/common/UserAvatar';
import { useNotifications } from '../../contexts/NotificationContext';

const FLAVORWORLD_COLORS = {
  primary: '#F5A623',
  secondary: '#4ECDC4',
  accent: '#1F3A93',
  background: '#FFF8F0',
  white: '#FFFFFF',
  text: '#2C3E50',
  textLight: '#7F8C8D',
  border: '#E8E8E8',
  success: '#27AE60',
  danger: '#E74C3C',
};

const RECIPE_CATEGORIES = [
  'all', 'Asian', 'Italian', 'Mexican', 'Indian', 'Mediterranean', 
  'American', 'French', 'Chinese', 'Japanese', 'Thai', 
  'Middle Eastern', 'Greek', 'Spanish', 'Korean', 'Vietnamese', 'Dessert'
];

const MEAT_TYPES = [
  'all', 'Vegetarian', 'Vegan', 'Chicken', 'Beef', 'Pork', 
  'Fish', 'Seafood', 'Lamb', 'Turkey', 'Mixed'
];

const COOKING_TIMES = [
  { key: 'all', label: 'All Times' },
  { key: 'quick', label: 'Under 30 min', max: 30 },
  { key: 'medium', label: '30-60 min', min: 30, max: 60 },
  { key: 'long', label: '1-2 hours', min: 60, max: 120 },
  { key: 'very_long', label: 'Over 2 hours', min: 120 }
];

const FEED_TYPES = [
  { key: 'personalized', label: 'Following & Groups', icon: UsersIcon },
  { key: 'all', label: 'All Posts', icon: Globe },
  { key: 'following', label: 'Following Only', icon: Heart }
];

const HomeScreen = () => {
  const navigate = useNavigate();
  const { logout, currentUser, isLoading: authLoading } = useAuth();
  const { unreadCount: unreadNotificationsCount } = useNotifications();
  
  const [posts, setPosts] = useState([]);
  const [filteredPosts, setFilteredPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharePost, setSharePost] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [feedType, setFeedType] = useState('personalized');
  const [suggestedUsers, setSuggestedUsers] = useState([]);
  const [trendingRecipes, setTrendingRecipes] = useState([]);
  const [savedRecipeIds, setSavedRecipeIds] = useState([]);
  
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedMeatType, setSelectedMeatType] = useState('all');
  const [selectedCookingTime, setSelectedCookingTime] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const applyFiltersAndSort = useCallback((postsArray) => {
    let filtered = [...postsArray];

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(post => 
        post.category?.toLowerCase() === selectedCategory.toLowerCase()
      );
    }

    if (selectedMeatType !== 'all') {
      filtered = filtered.filter(post => 
        post.meatType?.toLowerCase() === selectedMeatType.toLowerCase()
      );
    }

    if (selectedCookingTime !== 'all') {
      const timeFilter = COOKING_TIMES.find(t => t.key === selectedCookingTime);
      if (timeFilter) {
        filtered = filtered.filter(post => {
          const cookTime = parseInt(post.prepTime) || 0;
          if (timeFilter.max && timeFilter.min) {
            return cookTime >= timeFilter.min && cookTime <= timeFilter.max;
          } else if (timeFilter.max) {
            return cookTime <= timeFilter.max;
          } else if (timeFilter.min) {
            return cookTime >= timeFilter.min;
          }
          return true;
        });
      }
    }

    switch (sortBy) {
      case 'oldest':
        filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        break;
      case 'popular':
        filtered.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
        break;
      case 'newest':
      default:
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        break;
    }

    return filtered;
  }, [selectedCategory, selectedMeatType, selectedCookingTime, sortBy]);

  useEffect(() => {
    console.log('Applying filters to posts:', posts.length);
    const filtered = applyFiltersAndSort(posts);
    console.log('Filtered posts:', filtered.length);
    setFilteredPosts(filtered);
  }, [posts, applyFiltersAndSort]);

  const loadPosts = useCallback(async () => {
    try {
      const userId = currentUser?.id || currentUser?._id;
      
      console.log('Loading posts - userId:', userId, 'feedType:', feedType);
      
      if (!userId) {
        console.warn('No userId found, skipping load');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      let result;
      
      switch (feedType) {
        case 'personalized':
          console.log('Fetching personalized feed...');
          result = await feedService.getPersonalizedFeed(userId, 'all');
          break;
        case 'following':
          console.log('Fetching following feed...');
          result = await feedService.getPersonalizedFeed(userId, 'following');
          break;
        case 'all':
        default:
          console.log('Fetching all recipes...');
          result = await recipeService.getAllRecipes();
          break;
      }
      
      console.log('Feed result:', result);
      
      if (result.success) {
        const postsArray = Array.isArray(result.data) ? result.data : [];
        console.log('Posts loaded from API:', postsArray.length);
        
        const formattedPosts = postsArray.map(post => ({
          ...post,
          _id: post._id || post.id,
          userName: post.userName || post.user?.name || 'Anonymous',
          userAvatar: post.userAvatar || post.user?.avatar || null,
          likes: Array.isArray(post.likes) ? post.likes : [],
          comments: Array.isArray(post.comments) ? post.comments : [],
          createdAt: post.createdAt || new Date().toISOString(),
          postSource: post.groupId ? 'group' : 'personal',
          groupName: post.groupName || null,
          group: post.groupId ? {
            _id: post.groupId,
            name: post.groupName || 'Group'
          } : null,
        }));
        
        console.log('Setting posts in state:', formattedPosts.length);
        setPosts(formattedPosts);
      } else {
        console.error('Feed fetch failed:', result.message);
        setPosts([]);
      }
    } catch (error) {
      console.error('Load posts error:', error);
      setPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [feedType, currentUser?.id, currentUser?._id]);

  const loadUnreadChatCount = useCallback(async () => {
    try {
      const result = await chatService.getUnreadChatsCount();
      if (result.success) {
        setUnreadChatCount(result.count);
      }
    } catch (error) {
      console.error('Load unread count error:', error);
    }
  }, []);

  const loadSavedRecipes = useCallback(async () => {
    try {
      const result = await recipeService.getSavedRecipes();
      if (result.success && Array.isArray(result.data)) {
        const savedIds = result.data.map(r => r._id || r.id);
        setSavedRecipeIds(savedIds);
      }
    } catch (error) {
      console.error('Load saved recipes error:', error);
    }
  }, []);

  const loadSuggestedUsers = useCallback(async () => {
    try {
      const result = await userService.getSuggestedUsers(3);
      if (result.success) {
        setSuggestedUsers(result.data);
      }
    } catch (error) {
      console.error('Load suggested users error:', error);
    }
  }, []);

  const loadTrendingRecipes = useCallback(async () => {
    try {
      const result = await recipeService.getTrendingRecipes();
      if (result.success) {
        setTrendingRecipes(result.data);
      }
    } catch (error) {
      console.error('Load trending recipes error:', error);
    }
  }, []);

  const initializeChatService = useCallback(async () => {
    const userId = currentUser?.id || currentUser?._id;
    if (userId) {
      await chatService.initializeSocket(userId);
      loadUnreadChatCount();
    }
  }, [currentUser?.id, currentUser?._id, loadUnreadChatCount]);

  useEffect(() => {
    const userId = currentUser?.id || currentUser?._id;
    if (userId) {
      console.log('User or feedType changed, loading posts...');
      loadPosts();
    }
  }, [currentUser?.id, currentUser?._id, feedType, loadPosts]);

  useEffect(() => {
    const userId = currentUser?.id || currentUser?._id;
    if (userId) {
      console.log('Initializing chat service...');
      initializeChatService();
      loadSuggestedUsers();
      loadTrendingRecipes();
      loadSavedRecipes();
    }
  }, [currentUser?.id, currentUser?._id, initializeChatService, loadSuggestedUsers, loadTrendingRecipes, loadSavedRecipes]);

  const handleRefreshData = useCallback(async () => {
    setRefreshing(true);
    await loadPosts();
    await loadSavedRecipes();
  }, [loadPosts, loadSavedRecipes]);

  const handleLogout = useCallback(() => {
    if (window.confirm('Are you sure you want to logout?')) {
      chatService.disconnect();
      logout();
      navigate('/login');
    }
  }, [logout, navigate]);

  const clearAllFilters = () => {
    setSelectedCategory('all');
    setSelectedMeatType('all');
    setSelectedCookingTime('all');
    setSortBy('newest');
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    if (selectedCategory !== 'all') count++;
    if (selectedMeatType !== 'all') count++;
    if (selectedCookingTime !== 'all') count++;
    if (sortBy !== 'newest') count++;
    return count;
  };

  const handlePostCreated = useCallback((newPost) => {
    handleRefreshData();
    setShowCreateModal(false);
  }, [handleRefreshData]);

  const handlePostDelete = useCallback(async (postId) => {
    try {
      const postToDelete = posts.find(p => (p._id || p.id) === postId);
      if (!postToDelete) return;
      
      const result = await recipeService.deleteRecipe(postId, {
        groupId: postToDelete.groupId,
        userId: currentUser?.id || currentUser?._id,
        isGroupPost: !!postToDelete.groupId,
        authorId: postToDelete.userId
      });
      
      if (result.success) {
        handleRefreshData();
        alert('Recipe deleted successfully');
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  }, [posts, currentUser, handleRefreshData]);

  const handleShare = useCallback((post) => {
    setSharePost(post);
    setShowShareModal(true);
  }, []);

  const handleShareSuccess = useCallback((shareData) => {
    console.log('Recipe shared successfully:', shareData);
  }, []);

  const handleSystemShare = useCallback(async (post) => {
    try {
      const shareContent = `Check out this amazing recipe: ${post.title}\n\n${post.description}`;
      if (navigator.share) {
        await navigator.share({
          title: post.title,
          text: shareContent,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(shareContent);
        alert('Recipe link copied to clipboard!');
      }
    } catch (error) {
      console.error('Share error:', error);
    }
  }, []);

  if (authLoading) {
    return (
      <div className="home-screen-loading">
        <Loader2 className="spinner" size={48} style={{ color: FLAVORWORLD_COLORS.primary }} />
        <p>Loading FlavorWorld...</p>
      </div>
    );
  }

  return (
    <div className="home-screen-container">
      {/* Top Navigation Bar */}
      <header className="top-nav">
        <div className="top-nav-content">
          <div className="top-nav-left">
            <h1 className="logo">FlavorWorld</h1>
            <div className="search-box">
              <Search size={20} />
              <input 
                type="text" 
                placeholder="Search recipes, chefs..." 
                onClick={() => navigate('/search')}
                readOnly
              />
            </div>
          </div>
          
          <div className="top-nav-right">
            <button className="nav-icon-btn" onClick={() => navigate('/home')}>
              <HomeIcon size={24} />
            </button>
            
            <button 
              className="nav-icon-btn"
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal size={24} />
              {getActiveFiltersCount() > 0 && (
                <span className="badge">{getActiveFiltersCount()}</span>
              )}
            </button>
            
            <button 
              className="nav-icon-btn" 
              onClick={() => navigate('/notifications')}
            >
              <Bell size={24} />
              {unreadNotificationsCount > 0 && (
                <span className="badge">{unreadNotificationsCount}</span>
              )}
            </button>
            
            <button 
              className="nav-icon-btn" 
              onClick={() => navigate('/chats')}
            >
              <MessageCircle size={24} />
              {unreadChatCount > 0 && (
                <span className="badge">{unreadChatCount}</span>
              )}
            </button>
            
            <button 
              className="nav-icon-btn profile-btn"
              onClick={() => navigate('/profile')}
            >
              <UserAvatar
                uri={currentUser?.avatar || currentUser?.userAvatar}
                name={currentUser?.fullName || currentUser?.name}
                size={32}
              />
            </button>

            <button className="logout-btn" onClick={handleLogout}>
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="main-content-wrapper">
        {/* Left Sidebar - Hidden on mobile */}
        <aside className="left-sidebar">
          <div className="sidebar-section">
            <button 
              className="sidebar-item"
              onClick={() => navigate('/profile')}
            >
              <UserAvatar
                uri={currentUser?.avatar || currentUser?.userAvatar}
                name={currentUser?.fullName || currentUser?.name}
                size={36}
              />
              <span>{currentUser?.fullName || currentUser?.name}</span>
            </button>
            
            <button 
              className="sidebar-item"
              onClick={() => navigate('/profile')}
            >
              <div className="sidebar-icon">
                <ChefHat size={20} style={{ color: FLAVORWORLD_COLORS.primary }} />
              </div>
              <span>My Recipes</span>
            </button>
            
            <button 
              className="sidebar-item"
              onClick={() => navigate('/groups')}
            >
              <div className="sidebar-icon">
                <UsersIcon size={20} style={{ color: FLAVORWORLD_COLORS.secondary }} />
              </div>
              <span>Groups</span>
            </button>
            
            <button 
              className="sidebar-item"
              onClick={() => navigate('/saved')}
            >
              <div className="sidebar-icon">
                <Heart size={20} style={{ color: FLAVORWORLD_COLORS.danger }} />
              </div>
              <span>Favorites</span>
            </button>
          </div>
        </aside>

        {/* Center Feed */}
        <main className="center-feed">
          {/* Feed Type Selector */}
          <div className="feed-type-selector">
            {FEED_TYPES.map(type => {
              const Icon = type.icon;
              return (
                <button
                  key={type.key}
                  className={`feed-type-btn ${feedType === type.key ? 'active' : ''}`}
                  onClick={() => setFeedType(type.key)}
                >
                  <Icon size={20} />
                  <span>{type.label}</span>
                </button>
              );
            })}
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="filters-panel">
              <div className="filters-header">
                <h3>Filters</h3>
                <button onClick={() => setShowFilters(false)}>
                  <X size={20} />
                </button>
              </div>
              
              <div className="filter-section">
                <label>Sort By:</label>
                <div className="filter-options">
                  {['newest', 'oldest', 'popular'].map(sort => (
                    <button
                      key={sort}
                      className={`filter-btn ${sortBy === sort ? 'active' : ''}`}
                      onClick={() => setSortBy(sort)}
                    >
                      {sort.charAt(0).toUpperCase() + sort.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-section">
                <label>Category:</label>
                <div className="filter-options">
                  {RECIPE_CATEGORIES.slice(0, 8).map(cat => (
                    <button
                      key={cat}
                      className={`filter-btn ${selectedCategory === cat ? 'active' : ''}`}
                      onClick={() => setSelectedCategory(cat)}
                    >
                      {cat === 'all' ? 'All' : cat}
                    </button>
                  ))}
                </div>
              </div>

              {getActiveFiltersCount() > 0 && (
                <button className="clear-filters" onClick={clearAllFilters}>
                  <RefreshCw size={16} />
                  Clear All
                </button>
              )}
            </div>
          )}

          {/* Create Post Card */}
          <div className="create-post-card">
            <UserAvatar
              uri={currentUser?.avatar || currentUser?.userAvatar}
              name={currentUser?.fullName || currentUser?.name}
              size={40}
            />
            <button 
              className="create-post-input"
              onClick={() => setShowCreateModal(true)}
            >
              What's cooking today?
            </button>
            <button 
              className="create-post-icon-btn"
              onClick={() => setShowCreateModal(true)}
            >
              <Plus size={24} style={{ color: FLAVORWORLD_COLORS.primary }} />
            </button>
          </div>

          {/* Posts Feed */}
          {loading ? (
            <div className="feed-loading">
              <Loader2 className="spinner" size={40} />
              <p>Loading delicious recipes...</p>
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="feed-empty">
              <ChefHat size={64} style={{ color: FLAVORWORLD_COLORS.textLight }} />
              <h2>No Recipes Found</h2>
              <p>Be the first to share your amazing recipe!</p>
              <button 
                className="primary-btn"
                onClick={() => setShowCreateModal(true)}
              >
                Share Recipe
              </button>
            </div>
          ) : (
            <div className="posts-feed">
              {filteredPosts.map((post) => (
                <div key={post._id || post.id} className="post-card">
                  <PostComponent
                    post={post}
                    navigation={{ navigate }}
                    onDelete={handlePostDelete}
                    onShare={() => handleShare(post)}
                    onRefreshData={handleRefreshData}
                    savedRecipeIds={savedRecipeIds}
                  />
                </div>
              ))}
            </div>
          )}
        </main>

        {/* Right Sidebar - Hidden on mobile */}
        <aside className="right-sidebar">
          <div className="sidebar-card">
            <h3>Trending Recipes</h3>
            <div className="trending-list">
              {trendingRecipes.length === 0 ? (
                <div className="no-suggestions">
                  <p>No trending recipes yet</p>
                </div>
              ) : (
                trendingRecipes.map((recipe, index) => (
                  <div 
                    key={recipe._id} 
                    className="trending-item"
                    onClick={() => navigate(`/post/${recipe._id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="trend-number">{index + 1}</span>
                    <span className="trend-name">{recipe.title}</span>
                    <span className="trend-likes">
                      <Heart size={14} /> {recipe.likesCount}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="sidebar-card">
            <h3>Suggested Chefs</h3>
            <div className="suggestions-list">
              {suggestedUsers.length === 0 ? (
                <div className="no-suggestions">
                  <p>No suggestions available</p>
                </div>
              ) : (
                suggestedUsers.map((user) => (
                  <div 
                    key={user.userId} 
                    className="suggestion-item"
                    onClick={() => navigate(`/profile?userId=${user.userId}`)}
                  >
                    <UserAvatar 
                      uri={user.userAvatar} 
                      name={user.userName} 
                      size={40} 
                    />
                    <div className="suggestion-info">
                      <span className="suggestion-name">{user.userName}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Create Post Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Share Recipe</h2>
              <button onClick={() => setShowCreateModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <CreatePostComponent
                currentUser={currentUser}
                onPostCreated={handlePostCreated}
              />
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && sharePost && (
        <SharePostComponent
          visible={showShareModal}
          onClose={() => setShowShareModal(false)}
          post={sharePost}
          onShare={handleShareSuccess}
          currentUserId={currentUser?.id || currentUser?._id}
          navigation={{ navigate }}
        />
      )}
    </div>
  );
};

export default HomeScreen;