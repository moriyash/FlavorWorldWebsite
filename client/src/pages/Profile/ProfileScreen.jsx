import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Settings,
  MessageCircle,
  Calendar,
  MoreVertical,
  UserPlus,
  UserMinus,
  Flag,
  Ban,
  Loader2,
  Users,
  Heart,
  Grid,
  User,
  BarChart3,
  Trash2,
  HelpCircle,
  Info,
  Shield,
  X,
  Bookmark
} from 'lucide-react';
import './ProfileScreen.css';
import { useAuth } from '../../services/AuthContext';
import UserAvatar from '../../components/common/UserAvatar';
import PostComponent from '../../components/common/PostComponent';
import { recipeService } from '../../services/recipeService';
import { userService } from '../../services/userService';
import { chatService } from '../../services/chatServices';
import { statisticsService } from '../../services/statisticsService';
import { groupService } from '../../services/groupService';
import { followService } from '../../services/followService';
const ProfileScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser, logout } = useAuth();
  
  const userId = useMemo(
    () => searchParams.get('userId') || currentUser?.id || currentUser?._id,
    [searchParams, currentUser?.id, currentUser?._id]
  );
  
  const isOwnProfile = useMemo(
    () => userId === (currentUser?.id || currentUser?._id),
    [userId, currentUser?.id, currentUser?._id]
  );
  
  const [profileUser, setProfileUser] = useState(null);
  const [userPosts, setUserPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('posts');
  const [stats, setStats] = useState({
    postsCount: 0,
    likesCount: 0,
    followersCount: 0,
    followingCount: 0
  });

  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [startingChat, setStartingChat] = useState(false);
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  useEffect(() => {
    let canceled = false;

    const loadAllData = async () => {
      setLoading(true);
      
      try {
        if (isOwnProfile) {
          if (canceled) return;
          setProfileUser(currentUser);
        } else {
          const userResult = await userService.getUserProfile(userId);
          if (canceled) return;
          
          if (userResult.success) {
            setProfileUser(userResult.data);
            
            try {
              const followResult = await chatService.getFollowStatus(
                userId, 
                currentUser.id || currentUser._id
              );
              if (canceled) return;
              
              if (followResult.success) {
                setIsFollowing(followResult.data.isFollowing);
                setStats(prev => ({
                  ...prev,
                  followersCount: followResult.data.followersCount || 0,
                  followingCount: userResult.data?.following?.length || 0
                }));
              }
            } catch (error) {
              console.error('Failed to load follow status:', error);
            }
          } else {
            alert('Failed to load user profile');
            navigate('/home');
            return;
          }
        }

        const regularPostsResult = await recipeService.getAllRecipes();
        if (canceled) return;
        
        let allPosts = [];
        
        if (regularPostsResult.success) {
          const regularPosts = Array.isArray(regularPostsResult.data) 
            ? regularPostsResult.data 
            : [];
          const userRegularPosts = regularPosts.filter(post => 
            post.userId === userId || 
            post.user?.id === userId || 
            post.user?._id === userId
          );
          
          const markedRegularPosts = userRegularPosts.map(post => ({
            ...post,
            postSource: 'personal'
          }));
          
          allPosts = [...markedRegularPosts];
        }

        try {
          const groupsResult = await groupService.getAllGroups(userId);
          if (canceled) return;
          
          if (groupsResult.success) {
            const userGroups = groupsResult.data.filter(group => 
              groupService.isMember(group, userId)
            );

            let allGroupPosts = [];
            
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
                  
                  const postsWithGroupInfo = userPostsInGroup.map(post => ({
                    ...post,
                    groupName: group.name,
                    groupId: group._id,
                    group: {
                      _id: group._id,
                      name: group.name
                    },
                    postSource: 'group'
                  }));
                  
                  allGroupPosts = [...allGroupPosts, ...postsWithGroupInfo];
                }
              } catch (groupPostError) {
                console.error('Error loading group posts:', groupPostError);
                continue;
              }
            }

            allPosts = [...allPosts, ...allGroupPosts];
          }
        } catch (groupError) {
          console.error('Could not load group posts:', groupError);
        }

        const sortedPosts = allPosts.sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        );

        if (canceled) return;
        setUserPosts(sortedPosts);

        try {
          const statsData = statisticsService.processRealUserData(sortedPosts, userId);
          
          let followersCount = 0;
          let followingCount = 0;
          
          try {
            const [followersResult, followingResult] = await Promise.all([
              followService.getFollowers(userId),
              followService.getFollowing(userId)
            ]);
            
            if (canceled) return;
            
            if (followersResult.success && Array.isArray(followersResult.data)) {
              followersCount = followersResult.data.length;
            }
            
            if (followingResult.success && Array.isArray(followingResult.data)) {
              followingCount = followingResult.data.length;
            }
          } catch (followersError) {
            console.error('Error loading follow counts:', followersError);
            followersCount = 0;
            followingCount = 0;
          }

          if (canceled) return;
          setStats({
            postsCount: statsData.totalPosts,
            likesCount: statsData.totalLikes,
            followersCount: followersCount,
            followingCount: followingCount
          });

        } catch (error) {
          const totalLikes = sortedPosts.reduce((sum, post) => 
            sum + (post.likes ? post.likes.length : 0), 0
          );

          if (canceled) return;
          setStats(prev => ({
            ...prev,
            postsCount: sortedPosts.length,
            likesCount: totalLikes
          }));
        }
        
      } catch (error) {
        if (canceled) return;
        console.error('Failed to load profile:', error);
        alert('Failed to load profile');
      } finally {
        if (canceled) return;
        setLoading(false);
      }
    };

    loadAllData();

    return () => {
      canceled = true;
    };
  }, [userId, isOwnProfile, currentUser, navigate]);

  const handleFollowToggle = async () => {
    if (isFollowLoading || !currentUser?.id) return;
    
    setIsFollowLoading(true);
    try {
      const currentUserId = currentUser.id || currentUser._id;
      let result;
      
      if (isFollowing) {
         
        result = await followService.unfollowUser(userId, currentUserId);
      } else {
        result = await followService.followUser(userId, currentUserId);
      }
      
      if (result.success) {
        setIsFollowing(!isFollowing);
        
        try {
          const followersResult = await followService.getFollowers(userId);
          if (followersResult.success && Array.isArray(followersResult.data)) {
            setStats(prev => ({
              ...prev,
              followersCount: followersResult.data.length
            }));
          } else {
            setStats(prev => ({
              ...prev,
              followersCount: isFollowing ? prev.followersCount - 1 : prev.followersCount + 1
            }));
          }
        } catch (error) {
          console.error('Error getting updated count:', error);
          setStats(prev => ({
            ...prev,
            followersCount: isFollowing ? prev.followersCount - 1 : prev.followersCount + 1
          }));
        }
        
        alert(isFollowing ? 'Unfollowed successfully' : 'Following successfully!');
      } else {
        alert(result.message || 'Failed to update follow status');
      }
    } catch (error) {
      alert('Failed to update follow status');
    } finally {
      setIsFollowLoading(false);
    }
  };

  const handleStartChat = async () => {
    if (isOwnProfile) {
      alert('You cannot chat with yourself!');
      return;
    }

    if (!profileUser) {
      alert('User information not available');
      return;
    }

    setStartingChat(true);

    try {
      const result = await chatService.getOrCreatePrivateChat(userId);
      
      if (result.success) {
        navigate(`/chat/${result.data._id}`, {
          state: {
            otherUser: {
              userId: userId,
              userName: profileUser.fullName || profileUser.name || 'Unknown User',
              userAvatar: profileUser.avatar,
              isOnline: false
            }
          }
        });
      } else {
        alert(result.message || 'Failed to start chat');
      }
    } catch (error) {
      alert('Failed to start chat');
    } finally {
      setStartingChat(false);
    }
  };

  const handleDeleteAccount = () => {
    setShowSettingsModal(false);
    
    if (window.confirm('Are you absolutely sure you want to delete your account? This action cannot be undone and will permanently remove all your recipes, chats, and data.')) {
      setShowDeleteModal(true);
    }
  };

  const confirmDeleteAccount = async () => {
    if (!deletePassword.trim()) {
      alert('Please enter your password to confirm deletion');
      return;
    }

    setIsDeleting(true);

    try {
      const result = await userService.deleteUserAccount(userId, deletePassword);
      
      if (result.success) {
        alert('Your account has been permanently deleted. Thank you for using FlavorWorld.');
        setShowDeleteModal(false);
        
        try {
          const { chatService } = await import('../../services/chatServices');
          chatService.disconnect();
        } catch (error) {
          console.error('Error disconnecting chat service:', error);
        }
        
        await logout();
        
        navigate('/login', { replace: true });
      } else {
        alert(result.message || 'Failed to delete account. Please try again or contact support.');
      }
      
    } catch (error) {
      alert('An error occurred while deleting your account. Please try again or contact support.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRefreshData = () => {
    window.location.reload();
  };

  const handlePostDelete = async (postId) => {
    try {
      const postToDelete = userPosts.find(p => (p._id || p.id) === postId);
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
      alert('Failed to delete recipe. Please try again.');
    }
  };

  const getFilteredPosts = () => {
    switch (selectedTab) {
      case 'personal':
        return userPosts.filter(post => post.postSource === 'personal');
      case 'groups':
        return userPosts.filter(post => post.postSource === 'group');
      case 'posts':
      default:
        return userPosts;
    }
  };

  if (loading) {
    return (
      <div className="profile-screen">
        <header className="profile-header">
          <button className="back-btn" onClick={() => navigate('/home')}>
            <ArrowLeft size={24} />
          </button>
          <h1>Profile</h1>
          <div className="header-placeholder" />
        </header>
        
        <div className="loading-container">
          <Loader2 className="spinner" size={40} />
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  const filteredPosts = getFilteredPosts();

  return (
    <div className="profile-screen">
      {/* Header */}
      <header className="profile-header">
        <button className="back-btn" onClick={() => navigate('/home')}>
          <ArrowLeft size={24} />
        </button>
        
        <h1>{isOwnProfile ? 'My Profile' : profileUser?.fullName || 'Profile'}</h1>
        
        <div className="header-actions">
          {isOwnProfile ? (
            <button className="settings-btn" onClick={() => setShowSettingsModal(true)}>
              <Settings size={20} />
            </button>
          ) : (
            <button className="options-btn" onClick={() => setShowOptionsMenu(!showOptionsMenu)}>
              <MoreVertical size={20} />
            </button>
          )}
        </div>
      </header>

      {/* Options Menu for Other Users */}
      {showOptionsMenu && (
        <div className="options-menu">
          <button onClick={() => { alert('Report submitted'); setShowOptionsMenu(false); }}>
            <Flag size={18} />
            <span>Report User</span>
          </button>
          <button onClick={() => { alert('User blocked'); setShowOptionsMenu(false); }} className="danger">
            <Ban size={18} />
            <span>Block User</span>
          </button>
          <button onClick={() => setShowOptionsMenu(false)}>
            Cancel
          </button>
        </div>
      )}

      <div className="profile-content">
        {/* Profile Header */}
        <div className="profile-info-section">
          <div className="profile-top">
            <UserAvatar
              uri={profileUser?.avatar || profileUser?.userAvatar}
              name={profileUser?.fullName || profileUser?.name}
              size={120}
            />
          </div>

          <div className="profile-details">
            <h2>{profileUser?.fullName || profileUser?.name || 'Anonymous Chef'}</h2>
            <p className="email">{profileUser?.email || 'No email'}</p>
            <p className="bio">{profileUser?.bio || 'Passionate about cooking and sharing delicious recipes!'}</p>
            
            <div className="profile-meta">
              <div className="meta-item">
                <Calendar size={16} />
                <span>Joined {new Date(profileUser?.createdAt || Date.now()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="stats-container">
            <div className="stat-item">
              <strong>{stats.postsCount}</strong>
              <span>Recipes</span>
            </div>
            <div className="stat-item">
              <strong>{stats.likesCount}</strong>
              <span>Total Likes</span>
            </div>
            <button 
              className="stat-item"
              onClick={() => navigate(`/profile/followers?userId=${userId}&tab=followers`)}
            >
              <strong>{stats.followersCount}</strong>
              <span>Followers</span>
            </button>
            <button 
              className="stat-item"
              onClick={() => navigate(`/profile/followers?userId=${userId}&tab=following`)}
            >
              <strong>{stats.followingCount}</strong>
              <span>Following</span>
            </button>
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            {isOwnProfile ? (
              <button className="edit-btn" onClick={() => navigate('/profile/edit')}>
                <User size={18} />
                <span>Edit Profile</span>
              </button>
            ) : (
              <>
                <button
                  className={`follow-btn ${isFollowing ? 'following' : ''}`}
                  onClick={handleFollowToggle}
                  disabled={isFollowLoading}
                >
                  {isFollowLoading ? (
                    <Loader2 className="spinner" size={18} />
                  ) : isFollowing ? (
                    <><UserMinus size={18} /><span>Unfollow</span></>
                  ) : (
                    <><UserPlus size={18} /><span>Follow</span></>
                  )}
                </button>
                
                <button 
                  className="message-btn" 
                  onClick={handleStartChat}
                  disabled={startingChat}
                >
                  {startingChat ? (
                    <Loader2 className="spinner" size={18} />
                  ) : (
                    <><MessageCircle size={18} /><span>Message</span></>
                  )}
                </button>
              </>
            )}
          </div>

          {/* Quick Actions (Own Profile Only) */}
          {isOwnProfile && (
            <div className="quick-actions">
              <button onClick={() => navigate('/groups')}>
                <Users size={20} />
                <span>My Groups</span>
                <span className="arrow">→</span>
              </button>
              
              <button onClick={() => navigate('/chats')}>
                <MessageCircle size={20} />
                <span>My Chats</span>
                <span className="arrow">→</span>
              </button>
              
              <button onClick={() => navigate(`/profile/statistics?userId=${userId}`)}>
                <BarChart3 size={20} />
                <span>My Statistics</span>
                <span className="arrow">→</span>
              </button>
              <button onClick={() => navigate('/saved')}>
                <Bookmark size={20} />
                <span>Saved</span>
                <span className="arrow">→</span>
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="profile-tabs">
          <button
            className={selectedTab === 'posts' ? 'active' : ''}
            onClick={() => setSelectedTab('posts')}
          >
            <Grid size={20} />
            <span>All Recipes</span>
          </button>
          <button
            className={selectedTab === 'personal' ? 'active' : ''}
            onClick={() => setSelectedTab('personal')}
          >
            <User size={20} />
            <span>Personal</span>
          </button>
          <button
            className={selectedTab === 'groups' ? 'active' : ''}
            onClick={() => setSelectedTab('groups')}
          >
            <Users size={20} />
            <span>Groups</span>
          </button>
        </div>

        {/* Posts */}
        <div className="posts-section">
          {filteredPosts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🍳</div>
              <h3>
                {selectedTab === 'posts' ? 'No Recipes Yet' : 
                 selectedTab === 'personal' ? 'No Personal Recipes' : 'No Group Recipes'}
              </h3>
              <p>
                {selectedTab === 'posts' && isOwnProfile ? 
                 'Share your first delicious recipe!' : 
                 selectedTab === 'personal' ? 'Create your first personal recipe!' :
                 'Join groups and start sharing recipes!'}
              </p>
            </div>
          ) : (
            filteredPosts.map((post) => (
              <div key={post._id || post.id}>
                {post.postSource === 'group' && (
                  <div className="group-badge">
                    <Users size={14} />
                    <span>Posted in {post.groupName || 'Group'}</span>
                  </div>
                )}
                <PostComponent
                  post={post}
                  navigation={navigate}
                  onRefreshData={handleRefreshData}
                  onDelete={handlePostDelete}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="modal-overlay" onClick={() => setShowSettingsModal(false)}>
          <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Settings</h3>
              <button onClick={() => setShowSettingsModal(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="settings-list">
              <button className="setting-item">
                <Shield size={20} />
                <span>Privacy</span>
                <span className="arrow">→</span>
              </button>

              <button className="setting-item">
                <HelpCircle size={20} />
                <span>Help & Support</span>
                <span className="arrow">→</span>
              </button>

              <button className="setting-item">
                <Info size={20} />
                <span>About</span>
                <span className="arrow">→</span>
              </button>

              <div className="divider" />

              <button className="setting-item danger" onClick={handleDeleteAccount}>
                <Trash2 size={20} />
                <span>Delete Account</span>
                <span className="arrow">→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="delete-modal">
            <div className="delete-header">
              <div className="warning-icon">⚠️</div>
              <h3>Delete Account</h3>
              <p>This action cannot be undone. All your recipes, chats, and data will be permanently removed.</p>
            </div>

            <div className="delete-content">
              <label>Enter your password to confirm:</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                disabled={isDeleting}
              />
            </div>

            <div className="delete-actions">
              <button 
                className="cancel-btn"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                }}
                disabled={isDeleting}
              >
                Cancel
              </button>

              <button 
                className="delete-btn"
                onClick={confirmDeleteAccount}
                disabled={isDeleting}
              >
                {isDeleting ? <Loader2 className="spinner" size={20} /> : 'Delete Forever'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileScreen;