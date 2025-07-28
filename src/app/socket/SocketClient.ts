// Frontend Socket.IO Client Integration Example
// This file demonstrates how to integrate Socket.IO on the client side

import { io, Socket } from 'socket.io-client';

interface MessageData {
  id: number;
  content: string;
  media_url?: string;
  media_type?: 'image' | 'video' | 'document';
  sender: {
    id: number;
    first_name: string;
    last_name: string;
    phone: string;
  };
  chat_id: number;
  status: string;
  created_at: Date;
}

interface WhatsAppMessageData {
  id: number;
  content: string;
  media_url?: string;
  media_type?: 'image' | 'video' | 'document';
  from: string;
  contact: {
    id: number;
    first_name: string;
    last_name: string;
    phone: string;
  };
  wa_message_id: string;
  timestamp: Date;
}

class SocketClient {
  private socket: Socket | null = null;
  private currentChatId: number | null = null;
  private userId: number | null = null;
  private businessId: number | null = null;

  constructor() {
    this.setupEventListeners();
  }

  // Initialize connection with authentication
  connect(token: string, userId: number, businessId: number) {
    this.userId = userId;
    this.businessId = businessId;
    
    this.socket = io(process.env.REACT_APP_SERVER_URL || 'http://localhost:3000', {
      auth: {
        token: token
      },
      transports: ['websocket', 'polling']
    });

    this.setupSocketEvents();
  }

  // Disconnect from server
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Join a specific chat room
  joinChat(chatId: number) {
    if (this.socket && chatId !== this.currentChatId) {
      // Leave current chat if any
      if (this.currentChatId) {
        this.socket.emit('leave_chat', this.currentChatId);
      }
      
      // Join new chat
      this.socket.emit('join_chat', chatId);
      this.currentChatId = chatId;
      console.log(`Joined chat ${chatId}`);
    }
  }

  // Leave current chat
  leaveChat() {
    if (this.socket && this.currentChatId) {
      this.socket.emit('leave_chat', this.currentChatId);
      this.currentChatId = null;
    }
  }

  // Send typing indicator
  startTyping(chatId: number) {
    if (this.socket) {
      this.socket.emit('typing_start', { chatId });
    }
  }

  // Stop typing indicator
  stopTyping(chatId: number) {
    if (this.socket) {
      this.socket.emit('typing_stop', { chatId });
    }
  }

  // Mark message as read
  markMessageAsRead(messageId: number, chatId: number) {
    if (this.socket) {
      this.socket.emit('message_read', { messageId, chatId });
    }
  }

  // Update agent status
  updateAgentStatus(status: 'available' | 'busy' | 'away') {
    if (this.socket) {
      this.socket.emit('agent_status_update', status);
    }
  }

  // Setup socket event listeners
  private setupSocketEvents() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('🔌 Connected to Socket.IO server');
      this.onConnectionStatusChange?.(true);
    });

    this.socket.on('disconnect', () => {
      console.log('🔌 Disconnected from Socket.IO server');
      this.onConnectionStatusChange?.(false);
    });

    // Message events
    this.socket.on('new_message', (data: { message: MessageData; timestamp: Date }) => {
      console.log('📨 New message received:', data);
      this.onNewMessage?.(data.message);
    });

    this.socket.on('whatsapp_message_received', (data: { chatId: number; message: WhatsAppMessageData; timestamp: Date }) => {
      console.log('📱 WhatsApp message received:', data);
      this.onWhatsAppMessage?.(data.chatId, data.message);
      
      // Show notification for new WhatsApp messages
      this.showNotification?.(
        `New message from ${data.message.contact.first_name} ${data.message.contact.last_name}`,
        data.message.content || 'Media message',
        data.chatId
      );
    });

    // Typing indicators
    this.socket.on('user_typing', (data: { userId: number; chatId: number; timestamp: Date }) => {
      console.log('✍️ User typing:', data);
      this.onUserTyping?.(data.userId, data.chatId);
    });

    this.socket.on('user_stop_typing', (data: { userId: number; chatId: number; timestamp: Date }) => {
      console.log('✍️ User stopped typing:', data);
      this.onUserStopTyping?.(data.userId, data.chatId);
    });

    // Read receipts
    this.socket.on('message_read_receipt', (data: { messageId: number; chatId: number; readBy: number; timestamp: Date }) => {
      console.log('👁️ Message read receipt:', data);
      this.onMessageRead?.(data.messageId, data.chatId, data.readBy);
    });

    // Message status updates
    this.socket.on('message_status_update', (data: { messageId: number; status: string; timestamp: Date }) => {
      console.log('📊 Message status update:', data);
      this.onMessageStatusUpdate?.(data.messageId, data.status);
    });

    // User presence
    this.socket.on('user_online', (data: { userId: number; timestamp: Date }) => {
      console.log('🟢 User online:', data);
      this.onUserOnline?.(data.userId);
    });

    this.socket.on('user_offline', (data: { userId: number; timestamp: Date }) => {
      console.log('🔴 User offline:', data);
      this.onUserOffline?.(data.userId);
    });

    // Agent events
    this.socket.on('chat_assigned', (data: { chatId: number; customerInfo: any; timestamp: Date }) => {
      console.log('👤 Chat assigned:', data);
      this.onChatAssigned?.(data.chatId, data.customerInfo);
    });

    this.socket.on('agent_status_changed', (data: { agentId: number; status: string; timestamp: Date }) => {
      console.log('👨‍💼 Agent status changed:', data);
      this.onAgentStatusChanged?.(data.agentId, data.status);
    });
  }

  // Event handler setup methods
  private setupEventListeners() {
    // These will be overridden by the implementing application
  }

  // Event handlers (to be implemented by the application)
  public onConnectionStatusChange?: (connected: boolean) => void;
  public onNewMessage?: (message: MessageData) => void;
  public onWhatsAppMessage?: (chatId: number, message: WhatsAppMessageData) => void;
  public onUserTyping?: (userId: number, chatId: number) => void;
  public onUserStopTyping?: (userId: number, chatId: number) => void;
  public onMessageRead?: (messageId: number, chatId: number, readBy: number) => void;
  public onMessageStatusUpdate?: (messageId: number, status: string) => void;
  public onUserOnline?: (userId: number) => void;
  public onUserOffline?: (userId: number) => void;
  public onChatAssigned?: (chatId: number, customerInfo: any) => void;
  public onAgentStatusChanged?: (agentId: number, status: string) => void;
  public showNotification?: (title: string, message: string, chatId: number) => void;

  // Utility methods
  public isConnected(): boolean {
    return this.socket?.connected || false;
  }

  public getCurrentChatId(): number | null {
    return this.currentChatId;
  }

  public getUserId(): number | null {
    return this.userId;
  }

  public getBusinessId(): number | null {
    return this.businessId;
  }
}

// Export singleton instance
const socketClient = new SocketClient();
export default socketClient;

// Usage Example:
/*
// In your React component or main app file:

import socketClient from './path/to/SocketClient';

// Initialize connection
const token = localStorage.getItem('authToken');
const userId = getCurrentUserId();
const businessId = getCurrentBusinessId();

socketClient.connect(token, userId, businessId);

// Setup event handlers
socketClient.onNewMessage = (message) => {
  // Update your message list in state
  setMessages(prev => [...prev, message]);
};

socketClient.onWhatsAppMessage = (chatId, message) => {
  // Handle incoming WhatsApp message
  // Maybe switch to that chat or show notification
  if (currentChatId === chatId) {
    setMessages(prev => [...prev, message]);
  } else {
    showNotification(`New message from ${message.contact.first_name}`);
  }
};

socketClient.onUserTyping = (userId, chatId) => {
  if (currentChatId === chatId) {
    setTypingUsers(prev => [...prev, userId]);
  }
};

socketClient.onUserStopTyping = (userId, chatId) => {
  if (currentChatId === chatId) {
    setTypingUsers(prev => prev.filter(id => id !== userId));
  }
};

// When user opens a chat
const openChat = (chatId) => {
  socketClient.joinChat(chatId);
  setCurrentChatId(chatId);
};

// When user starts typing
const handleTyping = () => {
  if (currentChatId) {
    socketClient.startTyping(currentChatId);
    
    // Stop typing after 3 seconds of inactivity
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socketClient.stopTyping(currentChatId);
    }, 3000);
  }
};

// When user reads a message
const markAsRead = (messageId) => {
  if (currentChatId) {
    socketClient.markMessageAsRead(messageId, currentChatId);
  }
};

// Cleanup on component unmount
useEffect(() => {
  return () => {
    socketClient.disconnect();
  };
}, []);

*/