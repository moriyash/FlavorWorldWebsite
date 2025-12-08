import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  X,
  Loader2,
  UserMinus,
  UserPlus,
  Users,
  MessageCircle
} from 'lucide-react';
import './FollowersScreen.css';
import { useAuth } from '../../services/AuthContext';
import { followService } from '../../services/followService';
import { chatService } from '../../services/chatServices';
import UserAvatar from '../../components/common/UserAvatar';

const FollowersScreen = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const userId = searchParams.get('userId');
  const tabParam = searchParams.get('tab') || 'followers';
  const { currentUser } = useAuth();
  
  const [activeTab, setActiveTab] = useState(tabParam);
  const [followers, setFollowers] = useState([]);
  const [following, setFollowing] = useState([]);
  const [filteredList, setFilteredList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [removingUserId, setRemovingUserId] = useState(null);

  const isOwnProfile = !userId || userId === (currentUser?.id || currentUser?._id);

  const handleBackClick = () => {
    if (userId) {
      navigate(`/profile?userId=${userId}`);
    } else {
      navigate('/profile');
    }
  };

  useEffect(() => {
    setActiveTab(tabParam);
  }, [tabParam]);

  useEffect(() => {
    loadData();
  }, [userId, activeTab]);

  useEffect(() => {
    filterList();
  }, [searchQuery, followers, following, activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      const targetUserId = userId || currentUser?.id || currentUser?._id;
      
      if (activeTab === 'followers') {
        const result = await followService.getFollowers(targetUserId);
        console.log('Followers result:', result);
        if (result.success) {
          console.log('Followers data:', result.data);
          setFollowers(result.data || []);
        } else {
          console.error('Failed to load followers:', result.message);
        }
      } else {
        const result = await followService.getFollowing(targetUserId);
        console.log('Following result:', result);
        if (result.success) {
          console.log('Following data:', result.data);
          setFollowing(result.data || []);
        } else {
          console.error('Failed to load following:', result.message);
        }
      }
    } catch (error) {
      console.error('Load data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterList = () => {
    const currentList = activeTab === 'followers' ? followers : following;
    
    if (!searchQuery.trim()) {
      setFilteredList(currentList);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = currentList.filter(user => {
      const name = (user.name || user.fullName || '').toLowerCase();
      const bio = (user.bio || '').toLowerCase();
      return name.includes(query) || bio.includes(query);
    });

    setFilteredList(filtered);
  };

  const handleRemoveFollower = async (followerId, followerName) => {
    if (!isOwnProfile || activeTab !== 'followers') return;

    if (window.confirm(`Remove ${followerName} from your followers?`)) {
      setRemovingUserId(followerId);
      try {
        const result = await followService.removeFollower(
          currentUser?.id || currentUser?._id,
          followerId
        );
        
        if (result.success) {
          alert(`${followerName} has been removed from your followers`);
          loadData();
        } else {
          alert(result.message || 'Failed to remove follower');
        }
      } catch (error) {
        console.error('Remove follower error:', error);
        alert('Failed to remove follower');
      } finally {
        setRemovingUserId(null);
      }
    }
  };

  const handleStartChat = async (user) => {
    try {
      const result = await chatService.getOrCreatePrivateChat(user._id || user.id);
      
      if (result.success) {
        navigate(`/chat/${result.data._id}`, {
          state: {
            otherUser: {
              userId: user._id || user.id,
              userName: user.name || user.fullName,
              userAvatar: user.avatar || user.profileImage
            }
          }
        });
      } else {
        alert(result.message || 'Failed to create chat');
      }
    } catch (error) {
      console.error('Create chat error:', error);
      alert('Failed to create chat');
    }
  };

  if (loading) {
    return (
      <div className="followers-screen">
        <header className="followers-header">
          <button className="back-btn" onClick={handleBackClick}>
            <ArrowLeft size={24} />
          </button>
          <h1>{activeTab === 'followers' ? 'Followers' : 'Following'}</h1>
          <div className="header-placeholder" />
        </header>
        
        <div className="loading-container">
          <Loader2 className="spinner" size={40} />
          <p>Loading {activeTab}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="followers-screen">
      {/* Header */}
      <header className="followers-header">
        <button className="back-btn" onClick={handleBackClick}>
          <ArrowLeft size={24} />
        </button>
        <h1>{activeTab === 'followers' ? 'Followers' : 'Following'} ({filteredList.length})</h1>
        <div className="header-placeholder" />
      </header>

      <div className="followers-content">
        {/* Search */}
        <div className="search-container">
          <Search size={20} />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}>
              <X size={20} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="tabs-container">
          <button 
            className={`tab-button ${activeTab === 'followers' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('followers');
              navigate(`/profile/followers?userId=${userId || ''}&tab=followers`);
            }}
          >
            <Users size={18} />
            <span>Followers</span>
          </button>
          <button 
            className={`tab-button ${activeTab === 'following' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('following');
              navigate(`/profile/followers?userId=${userId || ''}&tab=following`);
            }}
          >
            <UserPlus size={18} />
            <span>Following</span>
          </button>
        </div>

        {/* Followers List */}
        <div className="followers-list">
        {filteredList.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <h3>{searchQuery ? `No ${activeTab} found` : `No ${activeTab} yet`}</h3>
            <p>
              {searchQuery 
                ? `No ${activeTab} match "${searchQuery}"`
                : isOwnProfile 
                  ? `When you ${activeTab === 'followers' ? 'get followers' : 'follow people'}, they will appear here`
                  : `This user has no ${activeTab} yet`
              }
            </p>
          </div>
        ) : (
          filteredList.map((user) => {
            const userId = user._id || user.id;
            const userName = user.name || user.fullName || 'Unknown User';
            const userBio = user.bio || '';
            const isCurrentUser = userId === (currentUser?.id || currentUser?._id);

            return (
              <div key={userId} className="follower-item">
                <div 
                  className="follower-main"
                  onClick={() => !isCurrentUser && navigate(`/profile?userId=${userId}`)}
                  style={{ cursor: isCurrentUser ? 'default' : 'pointer' }}
                >
                  <UserAvatar
                    uri={user.avatar || user.profileImage}
                    name={userName}
                    size={50}
                  />
                  
                  <div className="follower-info">
                    <h3>
                      {userName}
                      {isCurrentUser && ' (You)'}
                    </h3>
                    {userBio && <p className="follower-bio">{userBio}</p>}
                  </div>
                </div>

                {!isCurrentUser && (
                  <div className="follower-actions">
                    <button
                      className="message-btn"
                      onClick={() => handleStartChat(user)}
                      title="Send Message"
                    >
                      <MessageCircle size={18} />
                    </button>
                    
                    {isOwnProfile && activeTab === 'followers' && (
                      <button
                        className="remove-btn"
                        onClick={() => handleRemoveFollower(userId, userName)}
                        disabled={removingUserId === userId}
                        title="Remove Follower"
                      >
                        {removingUserId === userId ? (
                          <Loader2 className="spinner" size={18} />
                        ) : (
                          <UserMinus size={18} />
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
        </div>
      </div>
    </div>
  );
};

export default FollowersScreen;