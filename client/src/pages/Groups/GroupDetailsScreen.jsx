import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  MoreVertical,
  Users,
  Lock,
  Globe,
  UtensilsCrossed,
  Plus,
  CheckCircle,
  Clock,
  LogOut,
  Settings as SettingsIcon,
  AlertCircle,
  Loader2,
  Camera,
  X,
  ChevronRight
} from 'lucide-react';
import './GroupDetailsScreen.css';
import { useAuth } from '../../services/AuthContext';
import { groupService } from '../../services/groupService';
import { recipeService } from '../../services/recipeService';
import PostComponent from '../../components/common/PostComponent';
import CreatePostComponent from '../../components/common/CreatePostComponent';
import UserAvatar from '../../components/common/UserAvatar';

const GroupDetailsScreen = () => {
  const navigate = useNavigate();
  const { groupId } = useParams();
  const { currentUser } = useAuth();
  
  const [group, setGroup] = useState(null);
  const [groupPosts, setGroupPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  const isMember = group ? groupService.isMember(group, currentUser?.id || currentUser?._id) : false;
  const isAdmin = group ? groupService.isAdmin(group, currentUser?.id || currentUser?._id) : false;
  const isCreator = group ? groupService.isCreator(group, currentUser?.id || currentUser?._id) : false;
  const hasPendingRequest = group ? groupService.hasPendingRequest(group, currentUser?.id || currentUser?._id) : false;
  const pendingRequestsCount = group?.pendingRequests?.length || 0;

  useEffect(() => {
    loadGroupData();
  }, [groupId]);

  const loadGroupData = useCallback(async () => {
    try {
      setLoading(true);
      
      const groupResult = await groupService.getGroupWithMembers(groupId);
      if (groupResult.success) {
        setGroup(groupResult.data);
      } else {
        // Try fallback without showing error yet
        const fallbackResult = await groupService.getGroup(groupId);
        
        if (fallbackResult.success) {
          setGroup(fallbackResult.data);
        } else {
          // Only log error, don't show alert for network issues
          console.error('Failed to load group:', fallbackResult.message);
          setLoading(false);
          return;
        }
      }

      await loadGroupPosts();

    } catch (error) {
      console.error('Load group data error:', error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const loadGroupPosts = useCallback(async () => {
    try {
      const result = await groupService.getGroupPosts(groupId, currentUser?.id || currentUser?._id);
      
      if (result.success) {
        const sortedPosts = (result.data || []).sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        );
        
        setGroupPosts(sortedPosts);
      } else {
        setGroupPosts([]);
      }
    } catch (error) {
      console.error('Load group posts error:', error);
      setGroupPosts([]);
    }
  }, [groupId, currentUser]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadGroupData().finally(() => setRefreshing(false));
  }, [loadGroupData]);

  const handleJoinGroup = async () => {
    if (!group) return;
    
    setIsJoining(true);
    try {
      if (hasPendingRequest) {
        const result = await groupService.cancelJoinRequest(groupId, currentUser?.id || currentUser?._id);
        
        if (result.success) {
          alert('Your join request has been canceled');
          loadGroupData();
        } else {
          alert(result.message || 'Failed to cancel join request');
        }
      } else {
        const result = await groupService.joinGroup(groupId, currentUser?.id || currentUser?._id);
        
        if (result.success) {
          if (result.data.status === 'pending') {
            alert('Your join request has been sent to the group admin');
          } else {
            alert('You have joined the group successfully!');
          }
          loadGroupData();
        } else {
          alert(result.message || 'Failed to join group');
        }
      }
    } catch (error) {
      console.error('Join/Cancel group error:', error);
      alert('Failed to process request');
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveGroup = async () => {
  if (!group) return;

  if (isCreator) {
    if (!group.members || group.members.length <= 1) {
      alert('You are the only member. Please delete the group instead of leaving.');
      return;
    }

    const currentUserId = currentUser?.id || currentUser?._id;
    const otherMembers = group.members.filter(m => 
      (m.userId || m._id || m.id) !== currentUserId
    );

    if (otherMembers.length === 0) {
      alert('Cannot leave: No other members to transfer ownership to.');
      return;
    }

    const randomIndex = Math.floor(Math.random() * otherMembers.length);
    const newAdmin = otherMembers[randomIndex];
    const newAdminId = newAdmin.userId || newAdmin._id || newAdmin.id;
    const newAdminName = newAdmin.userName || newAdmin.name || newAdmin.fullName || 'member';

    const confirmMessage = `You are the group owner. If you leave, ${newAdminName} will become the new admin. Are you sure?`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const transferResult = await groupService.transferOwnership(
        groupId, 
        currentUserId, 
        newAdminId
      );

      if (!transferResult.success) {
        alert(transferResult.message || 'Failed to transfer ownership');
        return;
      }

      const leaveResult = await groupService.leaveGroup(groupId, currentUserId);

      if (leaveResult.success) {
        alert(`You have left the group. ${newAdminName} is now the admin.`);
        navigate(-1);
      } else {
        alert(leaveResult.message || 'Failed to leave group');
      }
    } catch (error) {
      console.error('Leave group error:', error);
      alert('Failed to leave group');
    }
  } else {
    if (window.confirm('Are you sure you want to leave this group?')) {
      try {
        const result = await groupService.leaveGroup(groupId, currentUser?.id || currentUser?._id);

        if (result.success) {
          alert('You have left the group');
          navigate(-1);
        } else {
          alert(result.message || 'Failed to leave group');
        }
      } catch (error) {
        alert('Failed to leave group');
      }
    }
  }
};


  const handlePostCreated = useCallback((newPost) => {
    setShowCreateModal(false);
    if (newPost) {
      setGroupPosts(prevPosts => [newPost, ...prevPosts]);
    }
    loadGroupPosts();
  }, [loadGroupPosts]);

  const handlePostDelete = useCallback(async (postId) => {
    try {
      const result = await groupService.deleteGroupPost(groupId, postId, currentUser?.id || currentUser?._id);
      
      if (result.success) {
        loadGroupPosts();
        alert('Recipe deleted successfully');
      } else {
        alert(result.message || 'Failed to delete recipe');
      }
    } catch (error) {
      alert('Failed to delete recipe');
    }
  }, [loadGroupPosts, groupId, currentUser]);

  if (loading) {
    return (
      <div className="group-details-screen">
        <header className="group-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
          </button>
          <h1>Loading...</h1>
          <div className="header-placeholder" />
        </header>
        
        <div className="loading-container">
          <Loader2 className="spinner" size={40} />
          <p>Loading group...</p>
        </div>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="group-details-screen">
        <header className="group-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
          </button>
          <h1>Group Not Found</h1>
          <div className="header-placeholder" />
        </header>
        
        <div className="error-container">
          <AlertCircle size={80} />
          <h2>Group Not Found</h2>
          <p>This group may have been deleted or you don't have access to it.</p>
          <button onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="group-details-screen">
      {/* Header */}
      <header className="group-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
        </button>
        
        <h1>{group.name}</h1>
        
        <div className="header-actions">
          <button 
            className="options-btn"
            onClick={() => setShowOptionsMenu(!showOptionsMenu)}
          >
            <MoreVertical size={24} />
            {(isAdmin || isCreator) && pendingRequestsCount > 0 && (
              <span className="requests-badge">{pendingRequestsCount}</span>
            )}
          </button>
        </div>
      </header>

      {/* Options Menu */}
      {showOptionsMenu && (
        <div className="options-menu">
          {(isAdmin || isCreator) ? (
            <>
              <button onClick={() => {
                setShowOptionsMenu(false);
                navigate(`/group/${groupId}/requests`);
              }}>
                Manage Requests {pendingRequestsCount > 0 && `(${pendingRequestsCount})`}
              </button>
              <button onClick={() => {
                setShowOptionsMenu(false);
                navigate(`/group/${groupId}/settings`);
              }}>
                <SettingsIcon size={18} />
                <span>Group Settings</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => {
                setShowOptionsMenu(false);
                alert(`Name: ${group.name}\nCategory: ${group.category}\nPrivacy: ${group.isPrivate ? 'Private' : 'Public'}\nMembers: ${group.membersCount || group.members?.length || 0}\nCreated by: ${group.creatorName}`);
              }}>
                Group Info
              </button>
              <button onClick={() => {
                setShowOptionsMenu(false);
                alert('Report functionality coming soon!');
              }}>
                Report Group
              </button>
            </>
          )}
          <button onClick={() => setShowOptionsMenu(false)}>
            Cancel
          </button>
        </div>
      )}

      <div className="group-content">
        {/* Group Info Section */}
        <div className="group-info-section">
          <div className="cover-image-container">
            {group.image ? (
              <img src={group.image} alt={group.name} className="cover-image" />
            ) : (
              <div className="placeholder-cover">
                <Users size={60} />
              </div>
            )}
            
            <div className={`privacy-badge ${group.isPrivate ? 'private' : ''}`}>
              {group.isPrivate ? <Lock size={16} /> : <Globe size={16} />}
              <span>{group.isPrivate ? 'Private' : 'Public'}</span>
            </div>
          </div>

          <div className="group-details">
            <h2>{group.name}</h2>
            
            <div className="category-container">
              <span className="category-tag">{group.category}</span>
            </div>

            {group.description && (
              <p className="group-description">{group.description}</p>
            )}

            <div className="stats-container">
              <div className="stat-item">
                <Users size={20} />
                <span>{group.membersCount} members</span>
              </div>
              
              <div className="stat-item">
                <UtensilsCrossed size={20} />
                <span>{groupPosts.length} recipes</span>
              </div>
            </div>

            <div className="creator-info">
              <UserAvatar
                uri={group.creatorAvatar}
                name={group.creatorName}
                size={24}
              />
              <span>Created by {group.creatorName}</span>
            </div>

            <div className="action-buttons-container">
              {!isMember ? (
                hasPendingRequest ? (
                  <button 
                    className="pending-button"
                    onClick={handleJoinGroup}
                    disabled={isJoining}
                  >
                    {isJoining ? (
                      <Loader2 className="spinner" size={18} />
                    ) : (
                      <>
                        <X size={18} />
                        <span>Cancel Request</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button 
                    className="join-button"
                    onClick={handleJoinGroup}
                    disabled={isJoining}
                  >
                    {isJoining ? (
                      <Loader2 className="spinner" size={18} />
                    ) : (
                      <>
                        <Plus size={18} />
                        <span>Join Group</span>
                      </>
                    )}
                  </button>
                )
              ) : (
                <div className="member-actions">
                  <button className="member-button">
                    <CheckCircle size={18} />
                    <span>{isCreator ? 'Group Owner' : isAdmin ? 'Admin' : 'Member'}</span>
                  </button>
                  
                  { (
                    <button 
                      className="leave-button"
                      onClick={handleLeaveGroup}
                    >
                      <LogOut size={18} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Members Section */}
        {group.members && group.members.length > 0 && (
          <div className="members-section">
            <div className="members-header">
              <h3>Members ({group.members.length})</h3>
              <button onClick={() => navigate(`/group/${groupId}/members`)}>
                <span>View All</span>
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="members-preview">
              {/* Use membersDetails if available, otherwise fall back to members */}
              {(group.membersDetails || group.members).slice(0, 4).map((member, index) => {
                const memberId = member.userId || member._id || member.id;
                const memberName = member.userName || member.name || member.fullName || 'Unknown User';
                const memberRole = member.role || 'member';
                const isCurrentUser = memberId === (currentUser?.id || currentUser?._id);

                return (
                  <div key={index} className="member-preview-item">
                    <UserAvatar
                      uri={member.userAvatar || member.avatar}
                      name={memberName}
                      size={32}
                    />
                    <div className="member-preview-info">
                      <span className="member-name">
                        {memberName}
                        {isCurrentUser && ' (You)'}
                      </span>
                      <span className="member-role">
                        {memberRole === 'owner' ? 'Owner' : 
                         memberRole === 'admin' ? 'Admin' : 'Member'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button 
              className="view-all-members-button"
              onClick={() => navigate(`/group/${groupId}/members`)}
            >
              <Users size={20} />
              <span>View All {group.members.length} Members</span>
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Create Post Section */}
        {isMember && (group?.settings?.allowMemberPosts ?? group?.allowMemberPosts ?? true) && (
          <div className="create-post-section">
            <div className="create-post-header">
              <UserAvatar
                uri={currentUser?.avatar}
                name={currentUser?.fullName || currentUser?.name}
                size={40}
              />
              <button 
                className="create-post-input"
                onClick={() => setShowCreateModal(true)}
              >
                Share a recipe with {group.name}...
              </button>
            </div>
            
            <div className="create-post-actions">
              <button onClick={() => setShowCreateModal(true)}>
                <UtensilsCrossed size={20} />
                <span>Recipe</span>
              </button>
              
              <button onClick={() => setShowCreateModal(true)}>
                <Camera size={20} />
                <span>Photo</span>
              </button>
            </div>
          </div>
        )}

        {/* Posts Section */}
        <div className="posts-section">
          {groupPosts.length === 0 ? (
            <div className="empty-posts">
              <UtensilsCrossed size={80} />
              <h3>No Recipes Yet!</h3>
              <p>
                {isMember 
                  ? 'Be the first to share a delicious recipe with this group'
                  : 'Join the group to see and share amazing recipes'
                }
              </p>
              {isMember && (group?.settings?.allowMemberPosts ?? group?.allowMemberPosts ?? true) && (
                <button onClick={() => setShowCreateModal(true)}>
                  Share Recipe
                </button>
              )}
            </div>
          ) : (
            groupPosts.map((post) => (
              <div key={post._id || post.id} className="post-container">
                <PostComponent
                  post={post}
                  navigation={navigate}
                  onDelete={handlePostDelete}
                  onRefreshData={handlePostCreated}
                  isGroupPost={true}
                  groupId={groupId}
                  groupName={group?.name}
                />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Post Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Share Recipe to {group?.name}</h2>
              <button onClick={() => setShowCreateModal(false)}>
                <X size={24} />
              </button>
            </div>
            <div className="modal-body">
              <CreatePostComponent
                currentUser={currentUser}
                groupId={groupId}
                groupName={group?.name}
                onPostCreated={handlePostCreated}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GroupDetailsScreen;