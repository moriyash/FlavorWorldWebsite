import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Send,
  Users,
  User,
  Loader2,
  Check
} from 'lucide-react';
import './SharePostComponent.css';
import { chatService } from '../../services/chatServices';
import UserAvatar from './UserAvatar';

const SharePostComponent = ({
  visible,
  onClose,
  post,
  onShare,
  currentUserId,
  navigation
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [chats, setChats] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedChats, setSelectedChats] = useState([]);
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [activeTab, setActiveTab] = useState('chats');

  useEffect(() => {
    if (visible && currentUserId) {
      loadData();
    }
  }, [visible, currentUserId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get all chats (private and group)
      const chatsResult = await chatService.getAllChats();
      
      if (chatsResult?.success) {
        // Separate private chats and group chats
        const privateChats = (chatsResult.data || [])
          .filter(chat => chat.chatType === 'private')
          .map(chat => ({
            _id: chat._id || chat.id,
            id: chat._id || chat.id,
            name: chat.displayName || chat.otherUser?.userName || 'Unknown User',
            fullName: chat.displayName || chat.otherUser?.userName || 'Unknown User',
            avatar: chat.displayAvatar || chat.otherUser?.userAvatar,
            userAvatar: chat.displayAvatar || chat.otherUser?.userAvatar,
            userId: chat.otherUser?.userId,
            chatType: 'private'
          }));
        
        const groupChats = (chatsResult.data || [])
          .filter(chat => chat.chatType === 'group')
          .map(chat => ({
            _id: chat._id || chat.id,
            id: chat._id || chat.id,
            name: chat.displayName || chat.name || 'Unknown Group',
            avatar: chat.displayAvatar || chat.image,
            participantsCount: chat.participantsCount || 0,
            chatType: 'group',
            chatId: chat._id || chat.id // Store the chat ID directly
          }));
        
        setChats(privateChats);
        setGroups(groupChats);
      }
    } catch (error) {
      console.error('Error loading share data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleChat = (chatId) => {
    setSelectedChats(prev =>
      prev.includes(chatId)
        ? prev.filter(id => id !== chatId)
        : [...prev, chatId]
    );
  };

  const handleToggleGroup = (groupId) => {
    setSelectedGroups(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleShare = async () => {
    if (selectedChats.length === 0 && selectedGroups.length === 0) {
      alert('Please select at least one chat or group');
      return;
    }

    setSharing(true);

    try {
      // Create a clickable link to the post
      const postUrl = `${window.location.origin}/post/${post._id || post.id}`;
      
      // Include image/video URL in the message for preview
      const mediaUrl = post.image || post.video || null;
      const mediaType = post.video ? 'video' : post.image ? 'image' : null;
      
      // Truncate description to prevent huge messages
      const description = post.description || '';
      const truncatedDescription = description.length > 200 
        ? description.substring(0, 200) + '...' 
        : description;
      
      // Create a structured message that includes post preview data
      // Format: [RECIPE_SHARE]|url|mediaUrl|mediaType|title|description|prepTime|servings|category
      const shareMessage = `[RECIPE_SHARE]
${postUrl}
${mediaUrl || 'NO_MEDIA'}
${mediaType || 'NO_MEDIA'}
${post.title}
${truncatedDescription}
${post.prepTime || 'N/A'} min
${post.servings || 'N/A'}
${post.category || ''}`;

      console.log('Share message length:', shareMessage.length);
      console.log('Share message:', shareMessage);

      let successCount = 0;
      let failCount = 0;

      // Share to selected private chats
      for (const chatId of selectedChats) {
        try {
          // Use HTTP endpoint for private messages (more reliable for sharing)
          const result = await chatService.sendPrivateChatMessage(
            chatId,
            shareMessage,
            'text'
          );
          
          if (result.success) {
            successCount++;
          } else {
            failCount++;
            console.error('Failed to share to chat:', chatId, result.message);
          }
        } catch (error) {
          failCount++;
          console.error('Error sharing to chat:', chatId, error);
        }
      }

      // Share to selected groups
      for (const groupId of selectedGroups) {
        try {
          console.log('Attempting to share to group:', groupId);
          
          // Use HTTP endpoint for group messages instead of socket
          const result = await chatService.sendGroupChatMessage(
            groupId,
            shareMessage,
            'text'
          );
          
          console.log('Group share result:', result);
          
          if (result.success) {
            successCount++;
          } else {
            failCount++;
            console.error('Failed to share to group:', groupId, result.message);
          }
        } catch (error) {
          failCount++;
          console.error('Error sharing to group:', groupId, error);
        }
      }

      if (successCount > 0 && failCount === 0) {
        alert(`Recipe shared successfully to ${successCount} chat${successCount > 1 ? 's' : ''}!`);
      } else if (successCount > 0 && failCount > 0) {
        alert(`Recipe shared to ${successCount} chat${successCount > 1 ? 's' : ''}, but failed for ${failCount} chat${failCount > 1 ? 's' : ''}.`);
      } else {
        alert('Failed to share recipe. Please try again.');
      }

      if (successCount > 0) {
        onShare?.({
          postId: post._id || post.id,
          chats: selectedChats,
          groups: selectedGroups,
          userId: currentUserId,
          successCount,
          failCount
        });
      }
      
      onClose();
    } catch (error) {
      console.error('Share error:', error);
      alert('Failed to share recipe. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const filteredChats = chats.filter(chat =>
    chat.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chat.fullName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredGroups = groups.filter(group =>
    group.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!visible) return null;

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="share-modal-header">
          <h2>Share Recipe</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {/* Post Preview */}
        <div className="share-post-preview">
          {post.image && (
            <img src={post.image} alt={post.title} />
          )}
          <div className="share-post-info">
            <h3>{post.title}</h3>
            <p>{post.description?.substring(0, 100)}...</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="share-tabs">
          <button
            className={`share-tab ${activeTab === 'chats' ? 'active' : ''}`}
            onClick={() => setActiveTab('chats')}
          >
            <User size={18} />
            <span>Chats</span>
            {selectedChats.length > 0 && (
              <span className="tab-badge">{selectedChats.length}</span>
            )}
          </button>
          <button
            className={`share-tab ${activeTab === 'groups' ? 'active' : ''}`}
            onClick={() => setActiveTab('groups')}
          >
            <Users size={18} />
            <span>Groups</span>
            {selectedGroups.length > 0 && (
              <span className="tab-badge">{selectedGroups.length}</span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="share-search">
          <Search size={18} />
          <input
            type="text"
            placeholder={`Search ${activeTab}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Content */}
        <div className="share-content">
          {loading ? (
            <div className="share-loading">
              <Loader2 className="spinner" size={32} />
              <p>Loading...</p>
            </div>
          ) : (
            <>
              {activeTab === 'chats' && (
                <div className="share-list">
                  {filteredChats.length === 0 ? (
                    <div className="share-empty">
                      <User size={48} />
                      <p>No chats found</p>
                      <small>Start a conversation with someone to share recipes!</small>
                    </div>
                  ) : (
                    filteredChats.map(chat => (
                      <div
                        key={chat._id || chat.id}
                        className={`share-item ${
                          selectedChats.includes(chat._id || chat.id) ? 'selected' : ''
                        }`}
                        onClick={() => handleToggleChat(chat._id || chat.id)}
                      >
                        <UserAvatar
                          uri={chat.avatar || chat.userAvatar}
                          name={chat.name || chat.fullName}
                          size={40}
                        />
                        <div className="share-item-info">
                          <h4>{chat.name || chat.fullName}</h4>
                        </div>
                        {selectedChats.includes(chat._id || chat.id) && (
                          <div className="share-check">
                            <Check size={20} />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'groups' && (
                <div className="share-list">
                  {filteredGroups.length === 0 ? (
                    <div className="share-empty">
                      <Users size={48} />
                      <p>No group chats found</p>
                      <small>Create or join a group chat to share recipes!</small>
                    </div>
                  ) : (
                    filteredGroups.map(group => (
                      <div
                        key={group._id || group.id}
                        className={`share-item ${
                          selectedGroups.includes(group._id || group.id) ? 'selected' : ''
                        }`}
                        onClick={() => handleToggleGroup(group._id || group.id)}
                      >
                        <div className="group-avatar">
                          <Users size={24} />
                        </div>
                        <div className="share-item-info">
                          <h4>{group.name}</h4>
                          <span>{group.participantsCount || 0} members</span>
                        </div>
                        {selectedGroups.includes(group._id || group.id) && (
                          <div className="share-check">
                            <Check size={20} />
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="share-modal-footer">
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="share-btn"
            onClick={handleShare}
            disabled={
              sharing ||
              (selectedChats.length === 0 && selectedGroups.length === 0)
            }
          >
            {sharing ? (
              <>
                <Loader2 className="spinner" size={18} />
                <span>Sharing...</span>
              </>
            ) : (
              <>
                <Send size={18} />
                <span>
                  Share ({selectedChats.length + selectedGroups.length})
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SharePostComponent;