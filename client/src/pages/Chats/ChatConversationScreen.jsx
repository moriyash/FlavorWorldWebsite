import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  Plus,
  X,
  Camera,
  Image as ImageIcon,
  FileText,
  MapPin,
  Loader2,
  Video,
  Phone
} from 'lucide-react';
import './ChatConversationScreen.css';
import { useAuth } from '../../services/AuthContext';
import UserAvatar from '../../components/common/UserAvatar';
import { chatService } from '../../services/chatServices';

const ChatConversationScreen = () => {
  const navigate = useNavigate();
  const { chatId } = useParams();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { otherUser } = location.state || {};
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImage, setModalImage] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    chatService.joinChat(chatId, 'private');
    
    const unsubscribeMessage = chatService.onMessage((newMessage) => {
      if (newMessage.chatId === chatId) {
        setMessages(prev => [...prev, newMessage]);
        scrollToBottom();
      }
    });

    const unsubscribeTyping = chatService.onTyping((data) => {
      if (data.chatId === chatId && data.userId !== (currentUser?.id || currentUser?._id)) {
        setOtherUserTyping(data.type === 'start');
      }
    });

    const socket = chatService.getSocket();
    if (socket) {
      socket.on('messages_loaded', (messagesData) => {
        if (messagesData.chatId === chatId) {
          setMessages(messagesData.messages || []);
          setLoading(false);
          setTimeout(scrollToBottom, 100);
        }
      });

      socket.on('message_received', (newMessage) => {
        if (newMessage.chatId === chatId) {
          setMessages(prev => [...prev, newMessage]);
          setTimeout(scrollToBottom, 100);
        }
      });
    }

    loadMessages();

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      chatService.leaveChat(chatId, 'private');
      unsubscribeMessage();
      unsubscribeTyping();
      
      if (socket) {
        socket.off('messages_loaded');
        socket.off('message_received');
      }
    };
  }, [chatId, currentUser]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async () => {
    try {
      setLoading(true);
      chatService.loadChatMessages(chatId, 'private');
      
      const result = await chatService.getChatMessages(chatId);
      if (result.success) {
        setMessages(result.data || []);
        await chatService.markAsRead(chatId, 'private');
        setTimeout(scrollToBottom, 100);
      }
    } catch (error) {
      console.error('Load messages error:', error);
      alert('Problem loading messages');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (messageType = 'text', content = null) => {
    const messageContent = content || inputText.trim();
    if (!messageContent || sending) return;

    setInputText('');
    setSending(true);
    setSelectedImage(null);
    setShowAttachments(false);

    try {
      const result = await chatService.sendMessage(chatId, messageContent, messageType, 'private');
      
      if (!result.success) {
        alert(result.message || 'Failed to send message');
        if (messageType === 'text') {
          setInputText(messageContent);
        }
      }

      stopTyping();
    } catch (error) {
      console.error('Send message error:', error);
      alert('Problem sending message');
      if (messageType === 'text') {
        setInputText(messageContent);
      }
    } finally {
      setSending(false);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result);
        if (window.confirm('Send this image?')) {
          handleSendMessage('image', reader.result);
        } else {
          setSelectedImage(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const startTyping = () => {
    chatService.startTyping(chatId, 'private');
  };

  const stopTyping = () => {
    chatService.stopTyping(chatId, 'private');
  };

  const handleInputChange = (e) => {
    setInputText(e.target.value);
    
    if (!isTyping) {
      setIsTyping(true);
      startTyping();
    }
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      stopTyping();
    }, 3000);
  };

  const formatMessageTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now - date) / (1000 * 60 * 60));
    
    if (diffInHours < 24) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } else {
      return date.toLocaleDateString('en-US', {
        day: '2-digit',
        month: '2-digit',
      });
    }
  };

  const isRecipeShare = (content) => {
    return content && content.startsWith('[RECIPE_SHARE]');
  };

  const parseRecipeShare = (content) => {
    if (!content || !content.startsWith('[RECIPE_SHARE]')) {
      return null;
    }

    const lines = content.split('\n');
    if (lines.length < 5) return null;

    const url = lines[1]?.trim() || '';
    const mediaUrl = lines[2]?.trim() === 'NO_MEDIA' ? null : lines[2]?.trim();
    const mediaType = lines[3]?.trim() === 'NO_MEDIA' ? null : lines[3]?.trim();
    const title = lines[4]?.trim() || '';
    const description = lines[5]?.trim() || '';
    const prepTime = lines[6]?.trim() || '';
    const servings = lines[7]?.trim() || '';
    const category = lines[8]?.trim() || '';

    return {
      url,
      mediaUrl,
      mediaType,
      title,
      description,
      prepTime,
      servings,
      category
    };
  };

  const handleRecipeClick = (url) => {
    if (url) {
      const postIdMatch = url.match(/\/post\/([^/?]+)/);
      if (postIdMatch) {
        const postId = postIdMatch[1];
        navigate(`/post/${postId}`);
      }
    }
  };

  const isMyMessage = (message) => {
    return message.senderId === (currentUser?.id || currentUser?._id);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading) {
    return (
      <div className="chat-conversation-screen">
        <header className="chat-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            <ArrowLeft size={24} />
          </button>
          
          <div className="user-info">
            <UserAvatar
              uri={otherUser?.userAvatar}
              name={otherUser?.userName || 'User'}
              size={32}
            />
            <span>{otherUser?.userName || 'User'}</span>
          </div>
          
          <div className="header-actions" />
        </header>
        
        <div className="loading-container">
          <Loader2 className="spinner" size={40} />
          <p>Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-conversation-screen">
      {/* Header */}
      <header className="chat-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <ArrowLeft size={24} />
        </button>
        
        <div 
          className="user-info"
          onClick={() => navigate(`/profile?userId=${otherUser?.userId}`)}
        >
          <UserAvatar
            uri={otherUser?.userAvatar}
            name={otherUser?.userName}
            size={32}
          />
          <div className="user-details">
            <h3>{otherUser?.userName}</h3>
          </div>
        </div>
        
        <div className="header-actions">
          <button className="header-action-btn">
            <Video size={20} />
          </button>
          <button className="header-action-btn">
            <Phone size={20} />
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-messages">
            <div className="empty-icon">💬</div>
            <h2>Start a conversation!</h2>
            <p>This is your private chat with {otherUser?.userName}</p>
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              const isMine = isMyMessage(message);
              const prevMessage = index > 0 ? messages[index - 1] : null;
              const showAvatar = !isMine && (!prevMessage || isMyMessage(prevMessage));

              return (
                <div
                  key={message._id}
                  className={`message-wrapper ${isMine ? 'mine' : 'theirs'}`}
                >
                  {!isMine && showAvatar && (
                    <UserAvatar
                      uri={otherUser?.userAvatar}
                      name={otherUser?.userName}
                      size={28}
                    />
                  )}
                  {!isMine && !showAvatar && <div className="avatar-spacer" />}
                  
                  <div className={`message-bubble ${isMine ? 'my-message' : 'other-message'}`}>
                    {message.messageType === 'image' ? (
                      <img
                        src={message.content}
                        alt="Shared"
                        className="message-image"
                        onClick={() => {
                          setModalImage(message.content);
                          setShowImageModal(true);
                        }}
                      />
                    ) : isRecipeShare(message.content) ? (
                      (() => {
                        const recipeData = parseRecipeShare(message.content);
                        if (!recipeData) return <p className="message-text">{message.content}</p>;
                        
                        return (
                          <div className="recipe-share-card" onClick={() => handleRecipeClick(recipeData.url)}>
                            {recipeData.mediaUrl && (
                              <div className="recipe-media">
                                {recipeData.mediaType === 'video' ? (
                                  <video 
                                    src={recipeData.mediaUrl} 
                                    className="recipe-image"
                                    controls={false}
                                    muted
                                    playsInline
                                    preload="metadata"
                                    style={{ pointerEvents: 'none' }}
                                  />
                                ) : (
                                  <img src={recipeData.mediaUrl} alt={recipeData.title} className="recipe-image" />
                                )}
                              </div>
                            )}
                            <div className="recipe-share-content">
                              <h4 className="recipe-title">{recipeData.title}</h4>
                              {recipeData.description && (
                                <p className="recipe-description">{recipeData.description}</p>
                              )}
                              <div className="recipe-meta">
                                {recipeData.prepTime && (
                                  <span className="recipe-meta-item">
                                    ⏱️ {recipeData.prepTime}
                                  </span>
                                )}
                                {recipeData.servings && (
                                  <span className="recipe-meta-item">
                                    👥 {recipeData.servings}
                                  </span>
                                )}
                                {recipeData.category && (
                                  <span className="recipe-meta-item">
                                    📂 {recipeData.category}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <p className="message-text">{message.content}</p>
                    )}
                    <span className="message-time">
                      {formatMessageTime(message.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
            
            {otherUserTyping && (
              <div className="typing-indicator">
                <div className="typing-bubble">
                  <span>{otherUser?.userName} is typing</span>
                  <div className="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Attachments Menu */}
      {showAttachments && (
        <div className="attachments-menu">
          <label className="attachment-option">
            <Camera size={24} />
            <span>Camera</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
          </label>
          
          <label className="attachment-option">
            <ImageIcon size={24} />
            <span>Gallery</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
          </label>
          
          <button className="attachment-option" onClick={() => alert('Coming soon')}>
            <FileText size={24} />
            <span>File</span>
          </button>
          
          <button className="attachment-option" onClick={() => alert('Coming soon')}>
            <MapPin size={24} />
            <span>Location</span>
          </button>
        </div>
      )}

      {/* Input */}
      <div className="input-container">
        <button
          className={`attach-btn ${showAttachments ? 'active' : ''}`}
          onClick={() => setShowAttachments(!showAttachments)}
        >
          {showAttachments ? <X size={24} /> : <Plus size={24} />}
        </button>
        
        <textarea
          className="message-input"
          value={inputText}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          placeholder="Type a message..."
          rows={1}
          disabled={sending}
        />
        
        <button
          className="send-btn"
          onClick={() => handleSendMessage()}
          disabled={!inputText.trim() || sending}
        >
          {sending ? <Loader2 className="spinner" size={20} /> : <Send size={20} />}
        </button>
      </div>

      {/* Image Modal */}
      {showImageModal && (
        <div className="image-modal" onClick={() => setShowImageModal(false)}>
          <button className="modal-close-btn">
            <X size={24} />
          </button>
          <img src={modalImage} alt="Full size" />
        </div>
      )}
    </div>
  );
};

export default ChatConversationScreen;