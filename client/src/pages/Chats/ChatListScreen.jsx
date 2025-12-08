import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageCircle,
  ArrowLeft,
  Search,
  X,
  Plus,
  Users,
  User,
  Loader2,
  ChevronRight
} from 'lucide-react';
import './ChatListScreen.css';
import { useAuth } from '../../services/AuthContext';
import UserAvatar from '../../components/common/UserAvatar';
import { chatService } from '../../services/chatServices';

const ChatListScreen = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showChatTypeModal, setShowChatTypeModal] = useState(false);

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    try {
      setLoading(true);
      const result = await chatService.getAllChats(); 
      
      if (result.success) {
        setChats(result.data || []);
      } else {
        alert(result.message || 'Failed to load chats');
      }
    } catch (error) {
      console.error('Load chats error:', error);
      alert('There was a problem loading the chats');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const updateChatWithNewMessage = (message) => {
    setChats(prevChats => {
      return prevChats.map(chat => {
        if (chat.chatType === 'private' && chat._id === message.chatId) {
          return {
            ...chat,
            lastMessage: message,
            unreadCount: chat.unreadCount + 1,
            updatedAt: message.createdAt
          };
        }
        
        if (chat.chatType === 'group' && chat._id === message.groupChatId) {
          return {
            ...chat,
            lastMessage: message,
            unreadCount: chat.unreadCount + 1,
            updatedAt: message.createdAt
          };
        }
        
        return chat;
      }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadChats();
  }, []);

  const formatTime = (dateString) => {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffInHours < 1) {
      return 'now';
    } else if (diffInHours < 24) {
      return `${diffInHours}h`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      if (diffInDays === 1) return 'yesterday';
      if (diffInDays < 7) return `${diffInDays}d`;
      return date.toLocaleDateString('en-US');
    }
  };

  const formatMessagePreview = (message) => {
    if (!message || !message.content) return '';
    
    const content = message.content;
    
    if (content.startsWith('[RECIPE_SHARE]')) {
      try {
        const lines = content.split('\n');
        const recipeTitle = lines[4]; 
        return ` Shared a recipe: ${recipeTitle}`;
      } catch (error) {
        return ' Shared a recipe';
      }
    }
    
    return content.length > 50 ? content.substring(0, 50) + '...' : content;
  };

  const getOtherUser = (chat) => {
    if (chat.chatType !== 'private' || !chat.participants || chat.participants.length < 2) {
      return null;
    }
    
    const otherUser = chat.participants.find(p => 
      p.userId !== (currentUser?.id || currentUser?._id)
    );
    
    return otherUser || null;
  };

  const handleChatPress = (chat) => {
    if (chat.chatType === 'group') {
      navigate(`/group-chat/${chat._id}`, {
        state: { groupChat: chat }
      });
    } else {
      const otherUser = getOtherUser(chat);
      if (otherUser) {
        navigate(`/chat/${chat._id}`, {
          state: { otherUser }
        });
      }
    }
  };

  const handleCreateChat = () => {
    setShowChatTypeModal(true);
  };

  const handleCreateGroupChat = () => {
    setShowChatTypeModal(false);
    navigate('/group-chat/create');
  };

  const handleCreatePrivateChat = () => {
    setShowChatTypeModal(false);
    navigate('/chat/search');
  };

  const filteredChats = chats.filter(chat => {
    if (!searchQuery.trim()) return true;
    
    if (chat.chatType === 'group') {
      return chat.name?.toLowerCase().includes(searchQuery.toLowerCase());
    }
    
    const otherUser = getOtherUser(chat);
    if (!otherUser) return false;
    
    return otherUser.userName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (loading && !refreshing) {
    return (
      <div className="chat-list-screen">
        <header className="chat-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
          </button>
          <h1>Chats</h1>
          <div className="header-placeholder" />
        </header>
        
        <div className="loading-container">
          <Loader2 className="spinner" size={40} />
          <p>Loading chats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-list-screen">
      {/* Header */}
      <header className="chat-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
        </button>
        
        <h1>Chats</h1>
        
        <div className="header-right">
          <button className="create-btn" onClick={handleCreateChat}>
            <Plus size={24} />
          </button>
          <span className="chat-count">{chats.length}</span>
        </div>
      </header>

      {/* Search */}
      <div className="search-container">
        <div className="search-bar">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search Chats"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery.length > 0 && (
            <button onClick={() => setSearchQuery('')}>
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* Chats List */}
      <div className="chats-list">
        {filteredChats.length === 0 ? (
          <div className="empty-state">
            <MessageCircle size={80} />
            <h2>No Chats Yet</h2>
            <p>Start chatting with friends or create a group chat!</p>
            <button className="start-chat-btn" onClick={handleCreateChat}>
              <Plus size={16} />
              <span>Start Chat</span>
            </button>
          </div>
        ) : (
          filteredChats.map((chat) => {
            const isGroupChat = chat.chatType === 'group';
            const hasUnread = chat.unreadCount > 0;
            const lastMessage = chat.lastMessage;
            const otherUser = !isGroupChat ? getOtherUser(chat) : null;

            return (
              <div
                key={chat._id}
                className="chat-item"
                onClick={() => handleChatPress(chat)}
              >
                {/* Avatar */}
                <div className="chat-avatar">
                  {isGroupChat ? (
                    chat.image ? (
                      <UserAvatar
                        uri={chat.image}
                        name={chat.name}
                        size={50}
                      />
                    ) : (
                      <div className="default-group-avatar">
                        <Users size={24} />
                      </div>
                    )
                  ) : otherUser ? (
                    <UserAvatar
                      uri={otherUser.userAvatar}
                      name={otherUser.userName}
                      size={50}
                    />
                  ) : null}
                </div>

                {/* Info */}
                <div className="chat-info">
                  <div className="chat-header-row">
                    <div className="chat-title">
                      <h3 className={hasUnread ? 'unread' : ''}>
                        {isGroupChat ? chat.name : otherUser?.userName}
                      </h3>
                      {isGroupChat && <Users size={14} />}
                    </div>
                    <span className="chat-time">
                      {formatTime(chat.updatedAt)}
                    </span>
                  </div>

                  <div className="chat-message-row">
                    <p className={`last-message ${hasUnread ? 'unread' : ''}`}>
                      {lastMessage ? (
                        lastMessage.senderName && isGroupChat ? 
                          `${lastMessage.senderName}: ${formatMessagePreview(lastMessage)}` : 
                          formatMessagePreview(lastMessage)
                      ) : (
                        isGroupChat ? 'No messages yet...' : 'Start a conversation...'
                      )}
                    </p>
                    
                    <div className="chat-metadata">
                      {isGroupChat && (
                        <span className="participants-count">
                          {chat.participantsCount}
                        </span>
                      )}
                      
                      {hasUnread && (
                        <div className="unread-badge">
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Refresh Button */}
      {!loading && (
        <button 
          className="refresh-fab" 
          onClick={onRefresh}
          disabled={refreshing}
        >
          <Loader2 className={refreshing ? 'spinner' : ''} size={24} />
        </button>
      )}

      {/* Chat Type Modal */}
      {showChatTypeModal && (
        <div className="modal-overlay" onClick={() => setShowChatTypeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Chat</h3>
            
            <button className="modal-option" onClick={handleCreatePrivateChat}>
              <User size={24} />
              <div className="modal-option-text">
                <h4>Private Chat</h4>
                <p>Chat with one person</p>
              </div>
              <ChevronRight size={20} />
            </button>

            <button className="modal-option" onClick={handleCreateGroupChat}>
              <Users size={24} />
              <div className="modal-option-text">
                <h4>Group Chat</h4>
                <p>Chat with multiple people</p>
              </div>
              <ChevronRight size={20} />
            </button>

            <button 
              className="modal-cancel-btn"
              onClick={() => setShowChatTypeModal(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatListScreen;