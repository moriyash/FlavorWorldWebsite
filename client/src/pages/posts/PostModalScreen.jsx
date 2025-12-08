import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  X,
  Clock,
  Users as UsersIcon,
  Loader2,
  Heart,
  MessageCircle,
  Share2
} from 'lucide-react';
import './PostModalScreen.css';
import { useAuth } from '../../services/AuthContext';
import { recipeService } from '../../services/recipeService';
import { groupService } from '../../services/groupService';
import { userService } from '../../services/userService';
import UserAvatar from '../../components/common/UserAvatar';

const PostModalScreen = () => {
  const navigate = useNavigate();
  const { postId } = useParams();
  const location = useLocation();
  const { currentUser } = useAuth();
  
  const { groupId, isGroupPost = false } = location.state || {};

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');
  const [likesWithUsers, setLikesWithUsers] = useState([]); 
  const [loadingLikes, setLoadingLikes] = useState(false); 

  const formatTime = (minutes) => {
    if (!minutes || isNaN(minutes)) return '0m';
    const numMinutes = parseInt(minutes);
    if (numMinutes < 60) {
      return `${numMinutes}m`;
    } else {
      const hours = Math.floor(numMinutes / 60);
      const remainingMinutes = numMinutes % 60;
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
  };

  useEffect(() => {
    loadPost();
  }, [postId]);

  useEffect(() => {
    if (activeTab === 'likes' && post && post.likes?.length > 0 && likesWithUsers.length === 0) {
      loadLikesWithUsers();
    }
  }, [activeTab, post]);

  const loadPost = async () => {
    try {
      setLoading(true);
      let result;

      if (isGroupPost && groupId) {
        const groupPostsResult = await groupService.getGroupPosts(groupId, currentUser?.id);
        if (groupPostsResult.success) {
          const foundPost = groupPostsResult.data.find(p => 
            (p._id || p.id) === postId
          );
          if (foundPost) {
            result = { success: true, data: foundPost };
          } else {
            result = { success: false, message: 'Post not found' };
          }
        } else {
          result = groupPostsResult;
        }
      } else {
        result = await recipeService.getRecipeById(postId);
      }

      if (result.success) {
        setPost(result.data);
      } else {
        alert(result.message || 'Failed to load post');
        navigate(-1);
      }
    } catch (error) {
      console.error('Load post error:', error);
      alert('Failed to load post');
      navigate(-1);
    } finally {
      setLoading(false);
    }
  };

  const loadLikesWithUsers = async () => {
    if (!post?.likes || post.likes.length === 0) return;

    setLoadingLikes(true);
    try {
      const usersPromises = post.likes.map(async (userId) => {
        try {
          const result = await userService.getUserProfile(userId);
          if (result.success) {
            return {
              userId: userId,
              userName: result.data.fullName || 'Unknown User',
              userAvatar: result.data.avatar || null,
              userBio: result.data.bio || null
            };
          }
        } catch (error) {
          console.error(`Failed to load user ${userId}:`, error);
        }
        return {
          userId: userId,
          userName: 'Unknown User',
          userAvatar: null,
          userBio: null
        };
      });

      const users = await Promise.all(usersPromises);
      setLikesWithUsers(users);
    } catch (error) {
      console.error('Load likes with users error:', error);
    } finally {
      setLoadingLikes(false);
    }
  };

  const handleUserClick = (userId) => {
    navigate(`/profile?userId=${userId}`);
  };

  if (loading) {
    return (
      <div className="post-modal-screen">
        <div className="modal-overlay">
          <div className="modal-container loading">
            <Loader2 className="spinner" size={40} />
            <p>Loading recipe...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="post-modal-screen">
        <div className="modal-overlay">
          <div className="modal-container error">
            <h2>Recipe Not Found</h2>
            <button className="close-btn" onClick={() => navigate(-1)}>
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="post-modal-screen">
      <div className="modal-overlay" onClick={() => navigate(-1)}>
        <div className="modal-container" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="modal-header">
            <button className="close-icon-btn" onClick={() => navigate(-1)}>
              <X size={28} />
            </button>
            <h2>{post.title || 'Recipe'}</h2>
          </div>

          {/* Tabs */}
          <div className="modal-tabs">
            <button
              className={`tab ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              Details
            </button>
            <button
              className={`tab ${activeTab === 'likes' ? 'active' : ''}`}
              onClick={() => setActiveTab('likes')}
            >
              Likes ({post.likes?.length || 0})
            </button>
            <button
              className={`tab ${activeTab === 'comments' ? 'active' : ''}`}
              onClick={() => setActiveTab('comments')}
            >
              Comments ({post.comments?.length || 0})
            </button>
          </div>

          {/* Content */}
          <div className="modal-body">
            {activeTab === 'details' && (
              <div className="details-tab">
                {/* Image */}
                {post.image && (
                  <div className="recipe-image-container">
                    <img src={post.image} alt={post.title} />
                  </div>
                )}

                {/* Video */}
                {post.video && !post.image && (
                  <div className="recipe-video-container">
                    <video src={post.video} controls />
                  </div>
                )}

                {/* Meta Info */}
                <div className="recipe-meta">
                  <div className="meta-item">
                    <Clock size={18} />
                    <span>{formatTime(post.prepTime)}</span>
                  </div>
                  <div className="meta-item">
                    <UsersIcon size={18} />
                    <span>{post.servings || 0} servings</span>
                  </div>
                  <div className="meta-tag">{post.category || 'General'}</div>
                  <div className="meta-tag">{post.meatType || 'Mixed'}</div>
                </div>

                {/* Author */}
                <div 
                  className="recipe-author"
                  onClick={() => handleUserClick(post.userId)}
                >
                  <UserAvatar
                    uri={post.userAvatar}
                    name={post.userName || 'Chef'}
                    size={40}
                  />
                  <div className="author-details">
                    <h4>{post.userName || 'Anonymous Chef'}</h4>
                    {isGroupPost && (
                      <span className="group-badge">Group Recipe</span>
                    )}
                  </div>
                </div>

                {/* Description */}
                {post.description && (
                  <div className="recipe-section">
                    <h3>Description</h3>
                    <p>{post.description}</p>
                  </div>
                )}

                {/* Ingredients */}
                {post.ingredients && (
                  <div className="recipe-section">
                    <h3>Ingredients</h3>
                    <p className="recipe-text">{post.ingredients}</p>
                  </div>
                )}

                {/* Instructions */}
                {post.instructions && (
                  <div className="recipe-section">
                    <h3>Instructions</h3>
                    <p className="recipe-text">{post.instructions}</p>
                  </div>
                )}

                {/* Stats */}
                <div className="recipe-stats">
                  <div className="stat-item">
                    <Heart size={20} />
                    <span>{post.likes?.length || 0} likes</span>
                  </div>
                  <div className="stat-item">
                    <MessageCircle size={20} />
                    <span>{post.comments?.length || 0} comments</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'likes' && (
              <div className="likes-tab">
                {loadingLikes ? (
                  <div className="loading-state">
                    <Loader2 className="spinner" size={30} />
                    <p>Loading likes...</p>
                  </div>
                ) : likesWithUsers.length > 0 ? (
                  <div className="likes-list">
                    {likesWithUsers.map((user) => (
                      <div
                        key={user.userId}
                        className="like-item"
                        onClick={() => handleUserClick(user.userId)}
                      >
                        <UserAvatar
                          uri={user.userAvatar}
                          name={user.userName}
                          size={40}
                        />
                        <div className="like-user-info">
                          <span className="like-user-name">{user.userName}</span>
                          {user.userBio && (
                            <span className="like-user-bio">{user.userBio}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Heart size={60} />
                    <p>No likes yet</p>
                    <span>Be the first to like this recipe!</span>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'comments' && (
              <div className="comments-tab">
                {post.comments?.length > 0 ? (
                  <div className="comments-list">
                    {post.comments.map((comment) => (
                      <div key={comment._id} className="comment-item">
                        <div
                          className="comment-header"
                          onClick={() => handleUserClick(comment.userId)}
                        >
                          <UserAvatar
                            uri={comment.userAvatar}
                            name={comment.userName}
                            size={36}
                          />
                          <div className="comment-author">
                            <h5>{comment.userName}</h5>
                            <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <p className="comment-text">{comment.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <MessageCircle size={60} />
                    <p>No comments yet</p>
                    <span>Be the first to comment!</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostModalScreen;