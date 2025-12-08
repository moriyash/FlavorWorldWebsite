import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  X,
  Loader2,
  Users,
  FileText,
  Check
} from 'lucide-react';
import './GroupChatCreationScreen.css';
import { useAuth } from '../../services/AuthContext';
import UserAvatar from '../../components/common/UserAvatar';
import { chatService } from '../../services/chatServices';

const GroupChatCreationScreen = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadAvailableUsers();
  }, []);

  const loadAvailableUsers = async () => {
    try {
      setLoading(true);
      const result = await getAvailableUsersForCreation();
      
      if (result.success) {
        setAvailableUsers(result.data || []);
      } else {
        alert(result.message || 'Failed to load available users');
      }
    } catch (error) {
      console.error('Load available users error:', error);
      alert('There was a problem loading available users');
    } finally {
      setLoading(false);
    }
  };

  const getAvailableUsersForCreation = async () => {
    try {
      const currentUserId = currentUser?._id || currentUser?.id || currentUser?.userId;
      
      if (!currentUserId) {
        return {
          success: false,
          message: 'User ID not found',
          data: []
        };
      }

      const availableUsers = [];
      
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
        const response = await fetch(`${API_BASE_URL}/api/users/${currentUserId}/following`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('userToken')}`
          }
        });

        if (response.ok) {
          const followingData = await response.json();
          followingData.forEach(user => {
            availableUsers.push({
              userId: user.userId || user._id,
              userName: user.userName || user.fullName || 'Unknown User',
              userAvatar: user.userAvatar || user.avatar,
              userEmail: user.userEmail || user.email || 'No email',
              userBio: user.userBio || user.bio || '',
              hasPrivateChat: false,
              isFollowing: true
            });
          });
        }
      } catch (error) {
        console.error('Error loading following users:', error);
      }
      
      try {
        const chatsResult = await chatService.getMyChats();
        
        if (chatsResult.success && chatsResult.data && chatsResult.data.length > 0) {
          chatsResult.data.forEach((chat) => {
            if (chat.otherUser && chat.otherUser.userId !== currentUserId) {
              const existingIndex = availableUsers.findIndex(u => u.userId === chat.otherUser.userId);
              
              if (existingIndex >= 0) {
                availableUsers[existingIndex].hasPrivateChat = true;
              } else {
                availableUsers.push({
                  userId: chat.otherUser.userId,
                  userName: chat.otherUser.userName || 'Unknown User',
                  userAvatar: chat.otherUser.userAvatar,
                  userEmail: chat.otherUser.userEmail || 'No email',
                  userBio: chat.otherUser.userBio || '',
                  hasPrivateChat: true,
                  isFollowing: false
                });
              }
            }
          });
        }
      } catch (error) {
        console.error('Error loading chat users:', error);
      }
      
      const uniqueUsers = availableUsers.filter((user, index, self) => 
        index === self.findIndex(u => u.userId === user.userId)
      );
      
      return { success: true, data: uniqueUsers };

    } catch (error) {
      console.error('Get available users for creation error:', error);
      return { 
        success: false, 
        message: 'Failed to get available users',
        data: []
      };
    }
  };

  const toggleUserSelection = (user) => {
    setSelectedUsers(prevSelected => {
      const isSelected = prevSelected.some(u => u.userId === user.userId);
      
      if (isSelected) {
        return prevSelected.filter(u => u.userId !== user.userId);
      } else {
        return [...prevSelected, user];
      }
    });
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      alert('Please enter a group name');
      return;
    }

    if (selectedUsers.length === 0) {
      alert('Please select at least one participant');
      return;
    }

    setCreating(true);

    try {
      const participantIds = selectedUsers.map(user => user.userId);
      
      const result = await chatService.createGroupChat(
        groupName.trim(),
        groupDescription.trim(),
        participantIds
      );

      if (result.success) {
        alert('Group chat created successfully!');
        navigate(`/group-chat/${result.data._id}`, {
          state: { groupChat: result.data }
        });
      } else {
        alert(result.message || 'Failed to create group chat');
      }
    } catch (error) {
      console.error('Create group chat error:', error);
      alert('There was a problem creating the group chat');
    } finally {
      setCreating(false);
    }
  };

  const filteredUsers = availableUsers.filter(user => {
    if (!searchQuery.trim()) return true;
    return user.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
           user.userEmail.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (loading) {
    return (
      <div className="group-creation-screen">
        <header className="creation-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
          </button>
          <h1>Create Group Chat</h1>
          <div className="header-placeholder" />
        </header>
        
        <div className="loading-container">
          <Loader2 className="spinner" size={40} />
          <p>Loading available users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="group-creation-screen">
      {/* Header */}
      <header className="creation-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
        </button>
        <h1>Create Group Chat</h1>
        <button
          className="create-btn"
          onClick={handleCreateGroup}
          disabled={!groupName.trim() || selectedUsers.length === 0 || creating}
        >
          {creating ? <Loader2 className="spinner" size={20} /> : 'Create'}
        </button>
      </header>

      {/* Group Info */}
      <div className="group-info-section">
        <h3>Group Information</h3>
        
        <div className="input-group">
          <Users size={20} />
          <input
            type="text"
            placeholder="Group Name (Required)"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="input-group">
          <FileText size={20} />
          <textarea
            placeholder="Group Description (Optional)"
            value={groupDescription}
            onChange={(e) => setGroupDescription(e.target.value)}
            maxLength={500}
            rows={2}
          />
        </div>
      </div>

      {/* Selected Users */}
      {selectedUsers.length > 0 && (
        <div className="selected-users-section">
          <h3>Selected Participants ({selectedUsers.length})</h3>
          <div className="selected-users-list">
            {selectedUsers.map((user) => (
              <div key={user.userId} className="selected-user-chip">
                <UserAvatar
                  uri={user.userAvatar}
                  name={user.userName}
                  size={32}
                />
                <span>{user.userName}</span>
                <button onClick={() => toggleUserSelection(user)}>
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Users */}
      <div className="users-section">
        <h3>Available Users</h3>
        
        <div className="search-bar">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery.length > 0 && (
            <button onClick={() => setSearchQuery('')}>
              <X size={20} />
            </button>
          )}
        </div>

        <div className="users-list">
          {filteredUsers.length === 0 ? (
            <div className="empty-users">
              <Users size={60} />
              <h2>{searchQuery ? 'No users found matching your search' : 'No available users to invite'}</h2>
              <p>You can only invite people you follow or have chatted with before</p>
            </div>
          ) : (
            filteredUsers.map((user) => {
              const isSelected = selectedUsers.some(u => u.userId === user.userId);
              return (
                <div
                  key={user.userId}
                  className={`user-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => toggleUserSelection(user)}
                >
                  <UserAvatar
                    uri={user.userAvatar}
                    name={user.userName}
                    size={40}
                  />

                  <div className="user-info">
                    <h4>{user.userName}</h4>
                    <div className="user-badges">
                      {user.isFollowing && (
                        <span className="badge following-badge">Following</span>
                      )}
                      {user.hasPrivateChat && (
                        <span className="badge chat-badge">Chatted</span>
                      )}
                    </div>
                  </div>

                  <div className={`selection-circle ${isSelected ? 'selected' : ''}`}>
                    {isSelected && <Check size={16} />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default GroupChatCreationScreen;