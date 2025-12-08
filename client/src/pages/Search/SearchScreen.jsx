import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ArrowLeft,
  X,
  Clock,
  Loader2,
  Users,
  ChevronRight
} from 'lucide-react';
import './SearchScreen.css';
import { useAuth } from '../../services/AuthContext';
import { recipeService } from '../../services/recipeService';
import { groupService } from '../../services/groupService';
import { userService } from '../../services/userService';
import PostComponent from '../../components/common/PostComponent';
import UserAvatar from '../../components/common/UserAvatar';

const SearchScreen = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTab, setSelectedTab] = useState('all');
  const [searchResults, setSearchResults] = useState({
    posts: [],
    users: [],
    groups: []
  });
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);

  useEffect(() => {
    const saved = localStorage.getItem('recentSearches');
    if (saved) {
      setRecentSearches(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        performSearch();
      } else {
        setSearchResults({ posts: [], users: [], groups: [] });
      }
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [searchQuery]);

  const performSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      const [postsResult, usersResult, groupsResult] = await Promise.all([
        searchPosts(),
        searchUsers(),
        searchGroups()
      ]);

      setSearchResults({
        posts: postsResult || [],
        users: usersResult || [],
        groups: groupsResult || []
      });

      addToRecentSearches(searchQuery);
      
    } catch (error) {
      console.error('Search error:', error);
      alert('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const searchPosts = async () => {
    try {
      const result = await recipeService.getAllRecipes();
      if (result.success) {
        const query = searchQuery.toLowerCase();
        return result.data.filter(post => 
          post.title?.toLowerCase().includes(query) ||
          post.description?.toLowerCase().includes(query) ||
          post.ingredients?.toLowerCase().includes(query) ||
          post.category?.toLowerCase().includes(query) ||
          post.userName?.toLowerCase().includes(query)
        );
      }
    } catch (error) {
      console.error('Search posts error:', error);
    }
    return [];
  };

  const searchUsers = async () => {
    try {
      const users = await userService.searchUsers(searchQuery, currentUser?.id || currentUser?._id);
      
      if (users && users.length > 0) {
        return users.map(user => ({
          _id: user.userId,
          id: user.userId,
          fullName: user.userName,
          name: user.userName,
          email: user.userEmail,
          avatar: user.userAvatar,
          bio: user.userBio
        }));
      }
    } catch (error) {
      console.error('Search users error:', error);
    }
    return [];
  };

  const searchGroups = async () => {
    try {
      const result = await groupService.searchGroups(searchQuery, currentUser?.id || currentUser?._id);
      
      if (result.success) {
        return result.data;
      }
    } catch (error) {
      console.error('Search groups error:', error);
    }
    return [];
  };

  const addToRecentSearches = (query) => {
    setRecentSearches(prev => {
      const updated = [query, ...prev.filter(item => item !== query)].slice(0, 5);
      localStorage.setItem('recentSearches', JSON.stringify(updated));
      return updated;
    });
  };

  const handleRecentSearch = (query) => {
    setSearchQuery(query);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults({ posts: [], users: [], groups: [] });
  };

  const getFilteredResults = () => {
    switch (selectedTab) {
      case 'posts':
        return searchResults.posts;
      case 'users':
        return searchResults.users;
      case 'groups':
        return searchResults.groups;
      default:
        return [
          ...searchResults.posts.map(item => ({ ...item, type: 'post' })),
          ...searchResults.users.map(item => ({ ...item, type: 'user' })),
          ...searchResults.groups.map(item => ({ ...item, type: 'group' }))
        ];
    }
  };

  const totalResults = searchResults.posts.length + searchResults.users.length + searchResults.groups.length;

  return (
    <div className="search-screen">
      {/* Header */}
      <header className="search-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
        </button>
        
        <div className="search-input-container">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search recipes, users, groups..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <button onClick={clearSearch} className="clear-btn">
              <X size={20} />
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      {searchQuery.trim().length === 0 ? (
        <div className="search-content">
          {recentSearches.length > 0 && (
            <div className="recent-searches">
              <h3>Recent Searches</h3>
              {recentSearches.map((search, index) => (
                <button
                  key={index}
                  className="recent-item"
                  onClick={() => handleRecentSearch(search)}
                >
                  <Clock size={16} />
                  <span>{search}</span>
                </button>
              ))}
            </div>
          )}
          
          <div className="empty-state">
            <Search size={80} />
            <h2>Start Searching</h2>
            <p>Search for recipes, users, or cooking groups</p>
          </div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="search-tabs">
            <button
              className={`search-tab ${selectedTab === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedTab('all')}
            >
              All {totalResults > 0 && `(${totalResults})`}
            </button>
            <button
              className={`search-tab ${selectedTab === 'posts' ? 'active' : ''}`}
              onClick={() => setSelectedTab('posts')}
            >
              Recipes {searchResults.posts.length > 0 && `(${searchResults.posts.length})`}
            </button>
            <button
              className={`search-tab ${selectedTab === 'users' ? 'active' : ''}`}
              onClick={() => setSelectedTab('users')}
            >
              Users {searchResults.users.length > 0 && `(${searchResults.users.length})`}
            </button>
            <button
              className={`search-tab ${selectedTab === 'groups' ? 'active' : ''}`}
              onClick={() => setSelectedTab('groups')}
            >
              Groups {searchResults.groups.length > 0 && `(${searchResults.groups.length})`}
            </button>
          </div>

          {/* Results */}
          {loading ? (
            <div className="loading-container">
              <Loader2 className="spinner" size={40} />
              <p>Searching...</p>
            </div>
          ) : (
            <div className="search-results">
              {getFilteredResults().length === 0 ? (
                <div className="empty-state">
                  <Search size={80} />
                  <h2>No Results Found</h2>
                  <p>No results found for "{searchQuery}". Try different keywords.</p>
                </div>
              ) : (
                <div className={`results-list ${
                  (selectedTab === 'posts' || (selectedTab === 'all' && getFilteredResults().length > 0 && getFilteredResults().every(item => item.type === 'post'))) 
                    ? 'posts-grid' 
                    : (selectedTab === 'groups' || (selectedTab === 'all' && getFilteredResults().length > 0 && getFilteredResults().every(item => item.type === 'group'))) 
                      ? 'groups-grid' 
                      : ''
                }`}>
                  {getFilteredResults().map((item, index) => {
                    const itemType = selectedTab === 'all' ? item.type : selectedTab.slice(0, -1);
                    
                    if (itemType === 'post') {
                      return (
                        <div 
                          key={item._id || index} 
                          className="result-post-card"
                          onClick={() => navigate(`/post/${item._id}`)}
                        >
                          {item.image ? (
                            <img 
                              src={item.image} 
                              alt={item.title}
                              className="result-post-image"
                            />
                          ) : (
                            <div className="result-post-placeholder">
                              🍳
                            </div>
                          )}
                          <div className="result-post-overlay">
                            <h4 className="result-post-title">{item.title}</h4>
                            <div className="result-post-meta">
                              <span>❤️ {item.likes?.length || 0}</span>
                              <span>💬 {item.comments?.length || 0}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    if (itemType === 'user') {
                      return (
                        <div
                          key={item._id || index}
                          className="result-user"
                          onClick={() => navigate(`/profile?userId=${item.id || item._id}`)}
                        >
                          <UserAvatar
                            uri={item.avatar}
                            name={item.fullName || item.name}
                            size={50}
                          />
                          <div className="user-info">
                            <h4>{item.fullName || item.name}</h4>
                            <p>{item.email}</p>
                            {item.bio && <span>{item.bio}</span>}
                          </div>
                          <ChevronRight size={20} />
                        </div>
                      );
                    }
                    
                    if (itemType === 'group') {
                      return (
                        <div
                          key={item._id || index}
                          className="result-group"
                          onClick={() => navigate(`/group/${item._id}`)}
                        >
                          <div className="group-image-container">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="group-image" />
                            ) : (
                              <div className="group-placeholder">
                                <Users size={48} />
                              </div>
                            )}
                          </div>
                          
                          <div className="group-info">
                            <h4>{item.name}</h4>
                            <p>{item.description || 'No description'}</p>
                            <div className="group-meta">
                              <span>👥 {item.membersCount || 0} members</span>
                              <span>•</span>
                              <span>{item.category}</span>
                              {item.isPrivate && (
                                <>
                                  <span>•</span>
                                  <span> Private</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    return null;
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SearchScreen;