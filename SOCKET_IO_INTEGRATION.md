# Socket.IO Real-Time Integration Guide

This document explains how to use the Socket.IO integration for real-time WhatsApp messaging features.

## 🚀 Features Implemented

### ✅ Real-time Bidirectional Communication
- **Instant message delivery** without page refresh
- **Live typing indicators** when users are typing
- **Read receipts** and message status updates
- **Online/offline user presence** tracking

### ✅ Performance Benefits
- **Eliminates constant HTTP polling** - no more refreshing
- **Reduces server load** and bandwidth usage
- **Lower latency** - sub-second message delivery
- **Better user experience** with instant updates

### ✅ WhatsApp Business Integration
- **Real-time webhook processing** for incoming messages
- **Instant notification** of incoming WhatsApp messages
- **Live chat agent notifications** for new conversations
- **Multi-agent chat support** with presence indicators

## 🏗️ Architecture Overview

```
WhatsApp API ──► Webhook ──► MessageController ──► Socket.IO Server
                                    │
                                    ▼
Frontend Client ◄──────────── Socket.IO Events
```

## 📁 File Structure

```
src/
├── app/
│   ├── socket/
│   │   ├── SocketServer.ts     # Server-side Socket.IO implementation
│   │   └── SocketClient.ts     # Client-side integration example
│   └── controllers/
│       └── MessageController.ts # Updated with Socket.IO events
├── index.ts                    # Main server with Socket.IO integration
```

## 🔧 Server Setup

### 1. Socket.IO Server Configuration

The `SocketServer.ts` handles:
- **Authentication** via JWT tokens
- **Room management** for chats and businesses
- **Event handling** for typing, presence, and messages
- **Real-time message broadcasting**

### 2. Integration with Express Server

In `index.ts`, Socket.IO is integrated with the HTTP server:

```typescript
import { createServer } from "http";
import SocketServer from "./src/app/socket/SocketServer";

const app = express();
const server = createServer(app);
const socketServer = new SocketServer(server);

// Make socket server globally available
global.socketServer = socketServer;
```

### 3. WhatsApp Webhook Integration

The `MessageController.ts` now emits real-time events when WhatsApp messages are received:

```typescript
// Emit to specific chat room
global.socketServer.emitNewMessage(chat.id, messageData);

// Emit WhatsApp notification to business agents
global.socketServer.emitWhatsAppMessage(businessUser.id, chat.id, messageData);
```

## 🖥️ Client Integration

### 1. Installation

```bash
npm install socket.io-client
```

### 2. Basic Usage

```typescript
import socketClient from './path/to/SocketClient';

// Initialize connection
const token = localStorage.getItem('authToken');
const userId = getCurrentUserId();
const businessId = getCurrentBusinessId();

socketClient.connect(token, userId, businessId);
```

### 3. Event Handlers

```typescript
// Handle new messages
socketClient.onNewMessage = (message) => {
  setMessages(prev => [...prev, message]);
};

// Handle WhatsApp messages
socketClient.onWhatsAppMessage = (chatId, message) => {
  if (currentChatId === chatId) {
    setMessages(prev => [...prev, message]);
  } else {
    showNotification(`New message from ${message.contact.first_name}`);
  }
};

// Handle typing indicators
socketClient.onUserTyping = (userId, chatId) => {
  if (currentChatId === chatId) {
    setTypingUsers(prev => [...prev, userId]);
  }
};
```

## 📡 Socket.IO Events

### Client → Server Events

| Event | Description | Payload |
|-------|-------------|----------|
| `join_chat` | Join a chat room | `chatId: number` |
| `leave_chat` | Leave a chat room | `chatId: number` |
| `typing_start` | Start typing indicator | `{ chatId: number }` |
| `typing_stop` | Stop typing indicator | `{ chatId: number }` |
| `message_read` | Mark message as read | `{ messageId: number, chatId: number }` |
| `agent_status_update` | Update agent availability | `status: 'available'\|'busy'\|'away'` |

### Server → Client Events

| Event | Description | Payload |
|-------|-------------|----------|
| `new_message` | New message in chat | `{ message: MessageData, timestamp: Date }` |
| `whatsapp_message_received` | New WhatsApp message | `{ chatId: number, message: WhatsAppMessageData, timestamp: Date }` |
| `user_typing` | User started typing | `{ userId: number, chatId: number, timestamp: Date }` |
| `user_stop_typing` | User stopped typing | `{ userId: number, chatId: number, timestamp: Date }` |
| `message_read_receipt` | Message read confirmation | `{ messageId: number, chatId: number, readBy: number, timestamp: Date }` |
| `message_status_update` | Message status change | `{ messageId: number, status: string, timestamp: Date }` |
| `user_online` | User came online | `{ userId: number, timestamp: Date }` |
| `user_offline` | User went offline | `{ userId: number, timestamp: Date }` |
| `chat_assigned` | Chat assigned to agent | `{ chatId: number, customerInfo: any, timestamp: Date }` |
| `agent_status_changed` | Agent status update | `{ agentId: number, status: string, timestamp: Date }` |

## 🔐 Authentication

Socket.IO connections are authenticated using JWT tokens:

```typescript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

The token should contain:
- `userId`: User ID
- `businessId`: Business ID for room management

## 🏠 Room Management

### Chat Rooms
- Format: `chat_{chatId}`
- Purpose: Real-time messaging within specific chats
- Members: All participants in the chat

### Business Rooms
- Format: `business_{businessId}`
- Purpose: Agent notifications and business-wide events
- Members: All agents/users in the business

## 🔔 Notification System

The system provides multiple notification types:

1. **New Message Notifications**: When messages arrive in inactive chats
2. **WhatsApp Message Alerts**: Special notifications for WhatsApp messages
3. **Chat Assignment Notifications**: When chats are assigned to agents
4. **Agent Status Updates**: When team members change availability

## 🚀 Getting Started

### 1. Start the Server

```bash
npm run dev
```

The server will start with Socket.IO enabled:
```
🚀 Application is listening at port 3000
🔌 Socket.IO server is ready for real-time connections
```

### 2. Test WhatsApp Integration

1. Send a message to your WhatsApp Business number
2. Check server logs for real-time event emissions:
   ```
   🔌 Step 4a: Emitting real-time events via Socket.IO
   🔌 Real-time events emitted for chat 123
   📨 New message emitted to chat 123
   📱 WhatsApp message emitted to business 456, chat 123
   ```

### 3. Connect Frontend Client

```typescript
// Initialize connection
socketClient.connect(authToken, userId, businessId);

// Join a chat
socketClient.joinChat(chatId);

// Listen for messages
socketClient.onNewMessage = (message) => {
  console.log('New message:', message);
};
```

## 🐛 Debugging

### Server-Side Debugging

```typescript
// Enable Socket.IO debug logs
process.env.DEBUG = 'socket.io:*';
```

### Client-Side Debugging

```typescript
// Check connection status
console.log('Connected:', socketClient.isConnected());
console.log('Current chat:', socketClient.getCurrentChatId());
```

### Common Issues

1. **Authentication Errors**: Ensure JWT token is valid and contains required fields
2. **Connection Issues**: Check CORS settings and server URL
3. **Missing Events**: Verify room joining and event handler setup
4. **Performance Issues**: Monitor connection count and room management

## 📊 Performance Considerations

1. **Connection Limits**: Monitor concurrent connections
2. **Room Management**: Clean up unused rooms
3. **Event Throttling**: Implement rate limiting for typing events
4. **Memory Usage**: Monitor connected users map size

## 🔮 Future Enhancements

- [ ] **Message Queuing**: Offline message delivery
- [ ] **File Sharing**: Real-time file upload progress
- [ ] **Voice Messages**: Real-time audio message streaming
- [ ] **Video Calls**: WebRTC integration for video calls
- [ ] **Screen Sharing**: Agent screen sharing capabilities
- [ ] **Chat Analytics**: Real-time chat metrics and insights

## 🤝 Contributing

To add new Socket.IO features:

1. Add event handlers to `SocketServer.ts`
2. Update client integration in `SocketClient.ts`
3. Emit events from relevant controllers
4. Update this documentation

---

**🎉 Your WhatsApp marketing platform now supports real-time communication!**

Users will experience instant message delivery, live typing indicators, and seamless real-time interactions without any page refreshes.