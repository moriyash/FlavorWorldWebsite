import React, { createContext, useContext, useEffect, useRef } from 'react';
import { chatService } from '../services/chatServices';
import { useAuth } from '../services/AuthContext';

const ChatSocketContext = createContext(null);

export const useChatSocket = () => {
  const context = useContext(ChatSocketContext);
  if (!context) {
    throw new Error('useChatSocket must be used within ChatSocketProvider');
  }
  return context;
};

export const ChatSocketProvider = ({ children }) => {
  const { currentUser } = useAuth();
  const initializedRef = useRef(false);
  const userIdRef = useRef(null);

  useEffect(() => {
    const userId = currentUser?._id ?? currentUser?.id;
    
    if (!userId) {
      if (initializedRef.current) {
        chatService.disconnect();
        initializedRef.current = false;
        userIdRef.current = null;
      }
      return;
    }

    if (userId !== userIdRef.current) {
      if (initializedRef.current) {
        chatService.disconnect();
      }
      
      chatService.initializeSocket(userId);
      initializedRef.current = true;
      userIdRef.current = userId;
    }

    return () => {
      chatService.disconnect();
      initializedRef.current = false;
      userIdRef.current = null;
    };
  }, [currentUser?._id, currentUser?.id]);

  return (
    <ChatSocketContext.Provider value={{ chatService }}>
      {children}
    </ChatSocketContext.Provider>
  );
};