# WhatsApp Webhook Setup Guide

This guide explains how to set up incoming WhatsApp message handling in your WhatsApp marketing application.

## Features Implemented

✅ **Webhook Verification**: Secure endpoint verification for WhatsApp Business API  
✅ **Incoming Message Processing**: Automatic handling of text, image, video, document, and audio messages  
✅ **Contact Management**: Auto-creation of contacts from incoming messages  
✅ **Chat Association**: Links incoming messages to existing chat threads  
✅ **Message Storage**: Saves all incoming messages to the database with proper status tracking  

## Webhook Endpoints

- **GET** `/webhook/whatsapp` - Webhook verification endpoint
- **POST** `/webhook/whatsapp` - Incoming message processing endpoint

## Environment Variables Required

Add the following environment variable to your `.env` file:

```env
WHATSAPP_VERIFY_TOKEN=your_secure_verify_token_here
```

## WhatsApp Business API Configuration

1. **Set up your webhook URL** in the WhatsApp Business API dashboard:
   - Webhook URL: `https://yourdomain.com/webhook/whatsapp`
   - Verify Token: Use the same token as `WHATSAPP_VERIFY_TOKEN`

2. **Subscribe to webhook fields**:
   - `messages` - Required for receiving incoming messages
   - `message_deliveries` - Optional for delivery status updates

3. **Ensure your business phone number** is properly configured in user profiles:
   - Users must have `whatsapp_business_phone` field set
   - This field is used to identify which business user should receive the incoming message

## How It Works

### 1. Webhook Verification
When you configure the webhook in WhatsApp Business API, it will send a GET request to verify your endpoint. The system automatically handles this verification using your verify token.

### 2. Incoming Message Flow
1. WhatsApp sends a POST request to `/webhook/whatsapp` with message data
2. System extracts sender phone number and message content
3. Creates or finds existing contact based on phone number
4. Identifies the business user based on the receiving phone number
5. Creates or finds existing chat between contact and business user
6. Saves the incoming message with status "received"
7. Updates contact's `last_contacted` timestamp

### 3. Supported Message Types
- **Text messages**: Content stored in `content` field
- **Images**: Media ID stored in `media_url`, caption in `content`
- **Videos**: Media ID stored in `media_url`, caption in `content`
- **Documents**: Media ID stored in `media_url`, filename/caption in `content`
- **Audio**: Media ID stored in `media_url` (treated as document type)

## Database Changes

No database migrations are required. The existing schema supports incoming messages:
- Messages are stored with `status: 'received'`
- Contact information is stored in the `User` entity
- Chat relationships link contacts and business users

## Testing the Webhook

1. **Verify webhook setup**: Check WhatsApp Business API dashboard for successful verification
2. **Send a test message**: Have someone send a WhatsApp message to your business number
3. **Check the database**: Verify the message appears in your `messages` table
4. **Check logs**: Monitor console output for webhook processing messages

## Troubleshooting

### Common Issues

1. **Webhook verification fails**:
   - Check that `WHATSAPP_VERIFY_TOKEN` matches the token in WhatsApp Business API
   - Ensure your server is accessible from the internet

2. **Messages not being received**:
   - Verify webhook subscription includes "messages" field
   - Check that business phone number is correctly configured in user profile
   - Monitor server logs for error messages

3. **Contact not found errors**:
   - Ensure the business user has `whatsapp_business_phone` field set
   - Check that the phone number format matches WhatsApp's format

### Debug Logs

The system logs important events:
- Webhook verification success/failure
- Incoming message processing
- Contact creation
- Error messages

Monitor your application logs to troubleshoot issues.

## Security Considerations

- Webhook endpoints are **not authenticated** (as required by WhatsApp)
- Verification token should be kept secure
- Consider implementing rate limiting for webhook endpoints
- Validate incoming webhook data structure

## Next Steps

With incoming message handling implemented, you can now:
- View complete conversation history in your chat interface
- Implement auto-reply functionality
- Set up message notifications
- Create chatbot responses
- Analyze incoming message patterns