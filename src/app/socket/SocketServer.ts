import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';

interface AuthenticatedSocket extends Socket {
  userId?: number;
  businessId?: number;
}

class SocketServer {
  private io: SocketIOServer;
  private connectedUsers: Map<number, string> = new Map(); // userId -> socketId
  private connectedAgents: Map<number, string> = new Map(); // agentId -> socketId

  constructor(server: HTTPServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
      }
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use((socket: any, next) => {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;
        socket.userId = decoded.id || decoded.userId; // Support both 'id' and 'userId'
        socket.businessId = decoded.businessId;
        console.log('🔐 JWT decoded successfully:', { userId: socket.userId, email: decoded.email, role: decoded.role });
        next();
      } catch (err: any) {
        console.error('❌ JWT verification failed:', err.message);
        next(new Error('Authentication error'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      console.log(`🔌 User ${socket.userId} connected with socket ${socket.id}`);
      
      // Store user connection
      if (socket.userId) {
        this.connectedUsers.set(socket.userId, socket.id);
        
        // Notify others about user online status
        socket.broadcast.emit('user_online', {
          userId: socket.userId,
          timestamp: new Date()
        });
      }

      // Join user to their business room
      if (socket.businessId) {
        socket.join(`business_${socket.businessId}`);
      }

      // Handle typing indicators
      socket.on('typing_start', (data) => {
        socket.to(`chat_${data.chatId}`).emit('user_typing', {
          userId: socket.userId,
          chatId: data.chatId,
          timestamp: new Date()
        });
      });

      socket.on('typing_stop', (data) => {
        socket.to(`chat_${data.chatId}`).emit('user_stop_typing', {
          userId: socket.userId,
          chatId: data.chatId,
          timestamp: new Date()
        });
      });

      // Handle joining chat rooms
      socket.on('join_chat', (chatId) => {
        socket.join(`chat_${chatId}`);
        console.log(`👥 User ${socket.userId} joined chat ${chatId}`);
      });

      // Handle leaving chat rooms
      socket.on('leave_chat', (chatId) => {
        socket.leave(`chat_${chatId}`);
        console.log(`👋 User ${socket.userId} left chat ${chatId}`);
      });

      // Handle message read receipts
      socket.on('message_read', (data) => {
        socket.to(`chat_${data.chatId}`).emit('message_read_receipt', {
          messageId: data.messageId,
          chatId: data.chatId,
          readBy: socket.userId,
          timestamp: new Date()
        });
      });

      // Handle agent status updates
      socket.on('agent_status_update', (status) => {
        if (socket.businessId) {
          socket.to(`business_${socket.businessId}`).emit('agent_status_changed', {
            agentId: socket.userId,
            status: status, // 'available', 'busy', 'away'
            timestamp: new Date()
          });
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`🔌 User ${socket.userId} disconnected`);
        
        if (socket.userId) {
          this.connectedUsers.delete(socket.userId);
          
          // Notify others about user offline status
          socket.broadcast.emit('user_offline', {
            userId: socket.userId,
            timestamp: new Date()
          });
        }
      });
    });
  }

  // Method to emit new message to specific chat
  public emitNewMessage(chatId: number, message: any) {
    this.io.to(`chat_${chatId}`).emit('new_message', {
      message,
      timestamp: new Date()
    });
    console.log(`📨 New message emitted to chat ${chatId}`);
  }

  // Method to emit WhatsApp webhook notification
  public emitWhatsAppMessage(businessId: number, chatId: number, message: any) {
    // Emit to all agents in the business
    this.io.to(`business_${businessId}`).emit('whatsapp_message_received', {
      chatId,
      message,
      timestamp: new Date()
    });
    
    // Also emit to specific chat room
    this.io.to(`chat_${chatId}`).emit('new_message', {
      message,
      timestamp: new Date()
    });
    
    console.log(`📱 WhatsApp message emitted to business ${businessId}, chat ${chatId}`);
  }

  // Method to emit message status updates
  public emitMessageStatus(chatId: number, messageId: number, status: string) {
    this.io.to(`chat_${chatId}`).emit('message_status_update', {
      messageId,
      status, // 'sent', 'delivered', 'read', 'failed'
      timestamp: new Date()
    });
  }

  // Method to notify agents about new chat assignment
  public notifyAgentAssignment(agentId: number, chatId: number, customerInfo: any) {
    const agentSocketId = this.connectedUsers.get(agentId);
    if (agentSocketId) {
      this.io.to(agentSocketId).emit('chat_assigned', {
        chatId,
        customerInfo,
        timestamp: new Date()
      });
    }
  }

  // Method to get online users count
  public getOnlineUsersCount(): number {
    return this.connectedUsers.size;
  }

  // Method to check if user is online
  public isUserOnline(userId: number): boolean {
    return this.connectedUsers.has(userId);
  }

  // Get Socket.IO instance for external use
  public getIO(): SocketIOServer {
    return this.io;
  }
}

export default SocketServer;
export { AuthenticatedSocket };