import { Request, Response } from "express";
import { AppDataSource } from "../../database/connection/dataSource";
import { Message } from "../../database/entities/Message";
import { Template } from "../../database/entities/Template";
import { User, UserRole } from "../../database/entities/User";
import { Chat } from "../../database/entities/Chat";
import { LessThanOrEqual } from "typeorm";
import axios from "axios";
import { parse } from "csv-parse";
import fs from "fs";
import cron from "node-cron";
import SocketServer from "../socket/SocketServer";
import { LogActivityController } from "./LogActivityController";

// Global type declaration for socketServer
declare global {
  var socketServer: SocketServer;
}

// interface AuthenticatedRequest extends Request {
//   user: { id: number };
// }

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: UserRole;
  };
}

// Helper: Simple in-memory queue for bulk messaging
const bulkQueue: any[] = [];
let isProcessingQueue = false;
const RATE_LIMIT_MS = 1100; // WhatsApp recommends ~1 msg/sec
const MAX_RETRIES = 3;

async function processBulkQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;
  while (bulkQueue.length > 0) {
    const job = bulkQueue.shift();
    await sendBulkJob(job);
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));
  }
  isProcessingQueue = false;
}

// Process incoming WhatsApp messages
async function processIncomingMessage(messageData: any) {
  try {
    console.log("🔄 Step 2: Processing incoming message data");
    console.log("📊 Message data:", JSON.stringify(messageData, null, 2));

    const { messages, contacts, metadata } = messageData;

    if (!messages || messages.length === 0) {
      console.log("⚠️ No messages to process in webhook data");
      return; // No messages to process
    }

    console.log(`📨 Found ${messages.length} message(s) to process`);

    const userRepository = AppDataSource.getRepository(User);
    const chatRepository = AppDataSource.getRepository(Chat);
    const messageRepository = AppDataSource.getRepository(Message);

    for (const message of messages) {
      const { from, text, type, timestamp, id: wa_message_id } = message;
      console.log(
        `\n🔄 Processing message from ${from}, type: ${type}, ID: ${wa_message_id}`
      );

      console.log("🔍 Step 2a: Looking for existing contact by phone number");
      // Find the contact (sender) by phone number
      let contact = await userRepository.findOne({
        where: { phone: from },
      });

      // If contact doesn't exist, create a new one
      if (!contact) {
        console.log("➕ Step 2b: Contact not found - Creating new contact");
        
        // Extract name from contacts array if available
        let firstName = "";
        let lastName = "";
        
        if (contacts && contacts.length > 0) {
          // Try to find contact by wa_id matching the from number (without +)
          let contactInfo = contacts.find((c: any) => c.wa_id === from.replace("+", ""));
          
          // If not found, just use the first contact in the array (WhatsApp usually sends the sender's info)
          if (!contactInfo && contacts[0]) {
            contactInfo = contacts[0];
          }
          
          if (contactInfo && contactInfo.profile && contactInfo.profile.name) {
            const fullName = contactInfo.profile.name.trim();
            const nameParts = fullName.split(" ");
            firstName = nameParts[0] || "";
            lastName = nameParts.slice(1).join(" ") || "";
            console.log(`📝 Extracted name: ${firstName} ${lastName}`);
          }
        }
        
        contact = userRepository.create({
          phone: from,
          email: `${from}@whatsapp.temp`, // Temporary email
          password: "temp_password", // Will need to be hashed
          first_name: firstName,
          last_name: lastName,
          role: "USER" as any,
          opt_in: true,
          last_contacted: new Date(),
        });
        await userRepository.save(contact);
        console.log(`✅ Step 2b: New contact created with ID: ${contact.id}`);
      } else {
        console.log(
          `✅ Step 2b: Existing contact found with ID: ${contact.id}`
        );
      }

      console.log("🔍 Step 2c: Looking for business user by phone number ID");
      // Find the business user (receiver) - this should be the user who has WhatsApp API configured
      const businessUser = await userRepository.findOne({
        where: {
          whatsapp_business_phone: metadata?.phone_number_id,
        },
      });

      if (!businessUser) {
        console.error(
          "❌ Business user not found for phone number ID:",
          metadata?.phone_number_id
        );
        continue;
      }

      console.log(
        `✅ Step 2c: Business user found with ID: ${businessUser.id}`
      );

      console.log(
        "🔍 Step 3: Looking for existing chat between contact and business user"
      );
      // Find or create chat between contact and business user
      let chat = await chatRepository.findOne({
        where: [
          { sender_id: contact.id, receiver_id: businessUser.id },
          { sender_id: businessUser.id, receiver_id: contact.id },
        ],
      });

      if (!chat) {
        console.log("➕ Step 3: Chat not found - Creating new chat");
        chat = chatRepository.create({
          sender_id: contact.id,
          receiver_id: businessUser.id,
        });
        await chatRepository.save(chat);
        console.log(`✅ Step 3: New chat created with ID: ${chat.id}`);
      } else {
        console.log(`✅ Step 3: Existing chat found with ID: ${chat.id}`);
      }

      console.log(`🔄 Step 4: Processing message content for type: ${type}`);
      // Extract message content based on type
      let content = "";
      let media_url: string | undefined = undefined;
      let media_type: "image" | "video" | "document" | undefined = undefined;

      if (type === "text" && text) {
        content = text.body;
        console.log(`📝 Text message content: ${content}`);
      } else if (type === "image" && message.image) {
        media_url = message.image.id; // WhatsApp media ID
        media_type = "image";
        content = message.image.caption || "";
        console.log(
          `🖼️ Image message - Caption: ${content}, Media ID: ${media_url}`
        );
      } else if (type === "video" && message.video) {
        media_url = message.video.id;
        media_type = "video";
        content = message.video.caption || "";
        console.log(
          `🎥 Video message - Caption: ${content}, Media ID: ${media_url}`
        );
      } else if (type === "document" && message.document) {
        media_url = message.document.id;
        media_type = "document";
        content = message.document.caption || message.document.filename || "";
        console.log(
          `📄 Document message - Caption: ${content}, Media ID: ${media_url}`
        );
      } else if (type === "audio" && message.audio) {
        // Note: audio is not in the media_type enum, so we'll treat it as document
        media_url = message.audio.id;
        media_type = "document";
        content = "Audio message";
        console.log(`🎵 Audio message - Media ID: ${media_url}`);
      } else {
        console.log(`⚠️ Unsupported message type: ${type}`);
      }

      console.log("💾 Step 4: Storing message in database");
      // Save the incoming message
      const incomingMessage = messageRepository.create({
        user_id: contact.id, // The contact who sent the message
        messageable_type: "chat",
        messageable_id: chat.id,
        status: "received", // Mark as received
        content,
        media_url,
        media_type,
        is_scheduled: false,
        // Note: created_at will be automatically set by @CreateDateColumn
        // Store WhatsApp message ID for reference
        // wa_message_id: wa_message_id // You might want to add this field to Message entity
      });

      await messageRepository.save(incomingMessage);
      console.log(`✅ Step 4: Message saved with ID: ${incomingMessage.id}`);

      // Emit real-time Socket.IO events
      console.log("🔌 Step 4a: Emitting real-time events via Socket.IO");
      try {
        // Emit to specific chat room
        global.socketServer.emitNewMessage(chat.id, {
          id: incomingMessage.id,
          content,
          media_url,
          media_type,
          sender: {
            id: contact.id,
            first_name: contact.first_name,
            last_name: contact.last_name,
            phone: contact.phone
          },
          chat_id: chat.id,
          status: 'received',
          created_at: incomingMessage.created_at
        });

        // Emit WhatsApp notification to business agents
        global.socketServer.emitWhatsAppMessage(businessUser.id, chat.id, {
          id: incomingMessage.id,
          content,
          media_url,
          media_type,
          from: contact.phone,
          contact: {
            id: contact.id,
            first_name: contact.first_name,
            last_name: contact.last_name,
            phone: contact.phone
          },
          wa_message_id,
          timestamp: new Date()
        });

        console.log(`🔌 Real-time events emitted for chat ${chat.id}`);
      } catch (socketError) {
        console.error("⚠️ Socket.IO emission error:", socketError);
        // Don't fail the entire process if socket emission fails
      }

      console.log("🔄 Step 4b: Updating contact's last_contacted timestamp");
      // Update contact's last_contacted timestamp
      contact.last_contacted = new Date();
      await userRepository.save(contact);
      console.log(
        `✅ Step 4b: Contact updated - last_contacted: ${contact.last_contacted}`
      );

      console.log(`Incoming message saved from ${from}: ${content}`);
    }

    console.log("✅ All messages processed successfully");
  } catch (error) {
    console.error("❌ Error processing incoming message:", error);
  }
}

// Also uncomment bulkqueue .push in sendbulkmessage controller
// async function sendBulkJob(job: any) {
//   const { sender_id, receiver, content, template_id, variables, attempt } = job;
//   console.log("Sending bulk message:", job);
//   try {
//     // Use the same logic as sendMessage/sendTemplateMessage
//     const userRepository = AppDataSource.getRepository(User);
//     const sender = await userRepository.findOne({ where: { id: sender_id } });
//     if (
//       !sender ||
//       !sender.whatsapp_api_token ||
//       !sender.whatsapp_business_phone
//     ) {
//       job.status = "failed";
//       job.error = "Sender WhatsApp API config missing";
//       return;
//     }
//     let waResponse = null;
//     let waStatus = "sent";
//     if (template_id) {
//       // Template message
//       const templateRepository = AppDataSource.getRepository(Template);
//       const template = await templateRepository.findOne({
//         where: { id: template_id },
//         relations: ["variables"],
//       });
//       if (!template) {
//         job.status = "failed";
//         job.error = "Template not found";
//         return;
//       }
//       const components = [];
//       if (template.variables && variables) {
//         const params = template.variables.map((v: any) => ({
//           type: "text",
//           text: variables[v.name] || v.default_value || "",
//         }));
//         components.push({ type: "body", parameters: params });
//       }
//       waResponse = await axios.post(
//         `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
//         {
//           messaging_product: "whatsapp",
//           to: receiver.phone,
//           type: "template",
//           template: {
//             name: template.name,
//             language: { code: template.language },
//             components,
//           },
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${sender.whatsapp_api_token}`,
//             "Content-Type": "application/json",
//           },
//         }
//       );
//     } else {
//       // Plain text message
//       waResponse = await axios.post(
//         `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
//         {
//           messaging_product: "whatsapp",
//           to: receiver.phone,
//           type: "text",
//           text: { body: content },
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${sender.whatsapp_api_token}`,
//             "Content-Type": "application/json",
//           },
//         }
//       );
//     }
//     job.status = "sent";
//     job.wa_response = waResponse?.data;
//   } catch (err: any) {
//     job.status = "failed";
//     job.error = err.response?.data || err.message;
//     if ((job.attempt || 1) < MAX_RETRIES) {
//       // Retry
//       bulkQueue.push({ ...job, attempt: (job.attempt || 1) + 1 });
//     }
//   }
// }

// async function sendBulkJob(job: any) {
//   const { sender_id, receiver, content, variables, attempt } = job;
//   console.log("Sending bulk message:", job);
//   try {
//     // Use the same logic as sendMessage/sendTemplateMessage
//     const userRepository = AppDataSource.getRepository(User);
//     const sender = await userRepository.findOne({ where: { id: sender_id } });
//     if (
//       !sender ||
//       !sender.whatsapp_api_token ||
//       !sender.whatsapp_business_phone
//     ) {
//       job.status = "failed";
//       job.error = "Sender WhatsApp API config missing";
//       return;
//     }
//     let waResponse = null;
//     let waStatus = "sent";
//     // Plain text message
//     waResponse = await axios.post(
//       `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
//       {
//         messaging_product: "whatsapp",
//         to: receiver.phone,
//         type: "text",
//         text: { body: content },
//       },
//       {
//         headers: {
//           Authorization: `Bearer ${sender.whatsapp_api_token}`,
//           "Content-Type": "application/json",
//         },
//       }
//     );
//     job.status = "sent";
//     job.wa_response = waResponse?.data;
//     console.log(job.wa_response);

//     const messageRepository = AppDataSource.getRepository(Message);

//     if (job.scheduled_message_id) {
//       const existingMessage = await messageRepository.findOne({
//         where: { id: job.scheduled_message_id },
//       });
//       if (existingMessage) {
//         existingMessage.status = "sent";
//         await messageRepository.save(existingMessage);
//         return;
//       }
//     }

//     const contactUser = await userRepository.findOne({
//       where: { phone: receiver.phone },
//     });

//     const messageable_id = contactUser?.id || 0;

//     await messageRepository.save({
//       user_id: sender_id,
//       messageable_type: "chat",
//       messageable_id,
//       status: waStatus,
//       content: content,
//     });
//   } catch (err: any) {
//     job.status = "failed";
//     job.error = err.response?.data || err.message;
//     if ((job.attempt || 1) < MAX_RETRIES) {
//       // Retry
//       bulkQueue.push({ ...job, attempt: (job.attempt || 1) + 1 });
//     }
//   }
// }

async function sendBulkJob(job: any) {
  const {
    sender_id,
    receiver,
    content,
    media_url,
    media_type,
    chat_id, // <-- make sure this is passed in queue
    attempt,
  } = job;

  try {
    const userRepository = AppDataSource.getRepository(User);
    const sender = await userRepository.findOne({ where: { id: sender_id } });
    console.log(job);

    if (
      !sender ||
      !sender.whatsapp_api_token ||
      !sender.whatsapp_business_phone
    ) {
      job.status = "failed";
      job.error = "Sender WhatsApp API config missing";
      return;
    }

    let payload: any = {
      messaging_product: "whatsapp",
      to: receiver.phone,
    };

    if (media_url) {
      payload.type = media_type;
      payload[media_type] = {
        link: media_url,
        caption: content || undefined,
      };
    } else if (content) {
      payload.type = "text";
      payload.text = { body: content };
    }

    const waResponse = await axios.post(
      `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${sender.whatsapp_api_token}`,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("WA Response:", waResponse?.data);

    job.status = "sent";
    job.wa_response = waResponse?.data;

    const messageRepository = AppDataSource.getRepository(Message);

    // Save only if WhatsApp API succeeded
    const saved = await messageRepository.save({
      user_id: sender_id,
      messageable_type: "chat",
      messageable_id: chat_id || 0,
      status: "sent",
      content,
      media_url,
      media_type,
      // wa_response_id: waResponse?.data?.messages?.[0]?.id || null,
    });
    console.log(saved);
  } catch (err: any) {
    console.error("❌ WhatsApp API Error for", receiver.phone);
    console.error("Status Code:", err.response?.status);
    console.error(
      "Response Data:",
      JSON.stringify(err.response?.data, null, 2)
    );
    console.error("Raw Error:", err.message);

    job.status = "failed";
    job.error = err.response?.data || err.message;

    if ((job.attempt || 1) < MAX_RETRIES) {
      bulkQueue.push({ ...job, attempt: (job.attempt || 1) + 1 });
    }
  }
}

export const MessageController = {
  // WhatsApp Webhook verification endpoint
  verifyWebhook: async (req: Request, res: Response) => {
    try {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      // Verify the webhook with your verify token
      const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

      if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("Webhook verified successfully!");
        return res.status(200).send(challenge);
      } else {
        console.log("Webhook verification failed");
        return res.status(403).send("Forbidden");
      }
    } catch (error) {
      console.error("Webhook verification error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // WhatsApp Webhook endpoint for receiving incoming messages
  receiveWebhook: async (req: Request, res: Response) => {
    try {
      console.log("🔄 Step 1: Webhook received - Processing incoming message");
      console.log("📥 Webhook payload:", JSON.stringify(req.body, null, 2));

      const body = req.body;

      // Check if this is a WhatsApp webhook event
      if (body.object === "whatsapp_business_account") {
        console.log("✅ Valid WhatsApp Business Account webhook detected");

        // Process each entry in the webhook
        for (const entry of body.entry) {
          console.log(`📋 Processing entry ID: ${entry.id}`);

          for (const change of entry.changes) {
            console.log(`🔄 Processing change field: ${change.field}`);

            if (change.field === "messages") {
              console.log(
                "📨 Message field detected - calling processIncomingMessage"
              );
              await processIncomingMessage(change.value);
            }
          }
        }
      } else {
        console.log("❌ Invalid webhook object type:", body.object);
      }

      console.log("✅ Step 5: Returning 200 OK status");
      // Always respond with 200 OK to acknowledge receipt
      return res.status(200).send("OK");
    } catch (error) {
      console.error("❌ Webhook processing error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
  sendMessage: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { receiver_id, content, template_id, media_url, media_type } =
        req.body;
      const sender_id = req.user!.id;

      const userRepository = AppDataSource.getRepository(User);
      const receiver = await userRepository.findOne({
        where: { id: receiver_id },
      });
      const sender = await userRepository.findOne({ where: { id: sender_id } });

      if (!receiver) {
        return res.status(404).json({ message: "Receiver not found" });
      }

      if (
        !sender ||
        !sender.whatsapp_api_token ||
        !sender.whatsapp_business_phone
      ) {
        return res
          .status(400)
          .json({ message: "Sender WhatsApp API config missing" });
      }

      let waResponse = null;
      let waError = null;
      let waStatus = "sent";

      try {
        const headers = {
          Authorization: `Bearer ${sender.whatsapp_api_token}`,
          "Content-Type": "application/json",
        };

        if (media_url && media_type) {
          // Handle media message with optional caption
          let mediaPayload: any = {
            messaging_product: "whatsapp",
            to: receiver.phone,
            type: media_type,
          };

          const supportedMediaTypes = ["image", "video", "document"];

          if (!supportedMediaTypes.includes(media_type)) {
            return res.status(400).json({ message: "Unsupported media type" });
          }

          // Attach media with optional caption
          mediaPayload[media_type] = {
            link: media_url,
            ...(content ? { caption: content } : {}),
          };

          waResponse = await axios.post(
            `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
            mediaPayload,
            { headers }
          );
        } else if (content) {
          // Plain text message only
          waResponse = await axios.post(
            `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
            {
              messaging_product: "whatsapp",
              to: receiver.phone,
              type: "text",
              text: { body: content, preview_url: false },
            },
            { headers }
          );
        } else {
          return res
            .status(400)
            .json({ message: "No content or media provided" });
        }
      } catch (err: any) {
        waError = err.response?.data || err.message;
        waStatus = "failed";
      }

      // Get or create chat between sender and receiver
      const chatRepository = AppDataSource.getRepository(Chat);
      let chat = await chatRepository.findOne({
        where: [
          { sender_id, receiver_id },
          { sender_id: receiver_id, receiver_id: sender_id },
        ],
      });

      if (!chat) {
        chat = chatRepository.create({ sender_id, receiver_id });
        await chatRepository.save(chat);
      }

      // Save message
      const messageRepository = AppDataSource.getRepository(Message);
      const message = messageRepository.create({
        user_id: sender_id,
        messageable_type: "chat",
        messageable_id: chat.id,
        status: waStatus,
        content: content || media_url,
        media_type: media_type || null,
        media_url: media_url || null,
      });
      await messageRepository.save(message);

      if (waStatus === "failed") {
        return res.status(500).json({
          message: "Failed to send via WhatsApp API",
          error: waError,
        });
      }

      // Log user activity
      try {
        await LogActivityController.logUserActivity(sender_id, `Sent message to ${receiver.first_name} ${receiver.last_name}`);
      } catch (logError) {
        console.error("Failed to log user activity:", logError);
      }

      return res.status(201).json({
        message: "Message sent successfully via WhatsApp API",
        data: message,
        wa_response: waResponse?.data,
      });
    } catch (error) {
      console.error("Send message error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // Send template Message add chat functionality
  sendTemplateMessage: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { receiver_id, template_id, variables } = req.body;
      const sender_id = req.user!.id;

      const userRepository = AppDataSource.getRepository(User);
      const receiver = await userRepository.findOne({
        where: { id: receiver_id },
      });
      const sender = await userRepository.findOne({ where: { id: sender_id } });

      if (!receiver) {
        return res.status(404).json({ message: "Receiver not found" });
      }
      if (
        !sender ||
        !sender.whatsapp_api_token ||
        !sender.whatsapp_business_phone
      ) {
        return res
          .status(400)
          .json({ message: "Sender WhatsApp API config missing" });
      }

      const templateRepository = AppDataSource.getRepository(Template);
      const template = await templateRepository.findOne({
        where: { id: template_id },
        relations: ["variables"],
      });
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Prepare WhatsApp API template message payload
      const components = [];
      if (template.variables && variables) {
        const params = template.variables.map((v: any) => ({
          type: "text",
          text: variables[v.name] || v.default_value || "",
        }));
        components.push({
          type: "body",
          parameters: params,
        });
      }

      let waResponse = null;
      let waError = null;
      let waStatus = "sent";
      try {
        // First, get the WhatsApp Business Account ID
        const wbaResponse = await axios.get(
          `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}`,
          {
            headers: {
              Authorization: `Bearer ${sender.whatsapp_api_token}`,
              "Content-Type": "application/json",
            },
          }
        );

        const phoneNumberId = sender.whatsapp_business_phone;

        // Send the template message using the phone number ID
        // Note: For sending messages, we use the phone number ID, not the business account ID
        waResponse = await axios.post(
          `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
          {
            messaging_product: "whatsapp",
            to: receiver.phone,
            type: "template",
            template: {
              name: template.name,
              language: { code: template.language },
              components,
            },
          },
          {
            headers: {
              Authorization: `Bearer ${sender.whatsapp_api_token}`,
              "Content-Type": "application/json",
            },
          }
        );
        waStatus = "sent";
      } catch (err: any) {
        waError = err.response?.data || err.message;
        waStatus = "failed";
      }

      if (waStatus === "failed") {
        return res.status(500).json({
          message: "Failed to send template via WhatsApp API",
          error: waError,
        });
      }

      const chatRepository = AppDataSource.getRepository(Chat);
      let chat = await chatRepository.findOne({
        where: [
          { sender_id: sender_id, receiver_id: receiver_id },
          { sender_id: receiver_id, receiver_id: sender_id },
        ],
      });

      if (!chat) {
        chat = chatRepository.create({ sender_id, receiver_id });
        await chatRepository.save(chat);
      }

      const messageRepository = AppDataSource.getRepository(Message);
      const message = messageRepository.create({
        user_id: sender_id,
        messageable_type: "template",
        messageable_id: chat?.id,
        status: waStatus,
      });
      await messageRepository.save(message);

      // Log user activity
      try {
        await LogActivityController.logUserActivity(sender_id, `Sent template message '${template.name}' to ${receiver.first_name} ${receiver.last_name}`);
      } catch (logError) {
        console.error("Failed to log user activity:", logError);
      }

      return res.status(201).json({
        message: "Template message sent successfully via WhatsApp API",
        data: message,
        wa_response: waResponse?.data,
      });
    } catch (error) {
      console.error("Send template message error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // sendBulkMessages: async (req: AuthenticatedRequest, res: Response) => {
  //   try {
  //     const { csv_data, content, template_id } = req.body;
  //     const sender_id = req.user!.id;
  //     if (!csv_data || !Array.isArray(csv_data) || csv_data.length === 0) {
  //       return res
  //         .status(400)
  //         .json({ message: "CSV data required for bulk messaging" });
  //     }
  //     // Each csv_data item: { phone: '...', var1: '...', ... }
  //     for (const row of csv_data) {
  //       bulkQueue.push({
  //         sender_id,
  //         receiver: { phone: row.phone },
  //         content,
  //         // template_id,
  //         variables: row,
  //         attempt: 1,
  //       });
  //     }
  //     processBulkQueue();
  //     return res.status(200).json({
  //       message: `Bulk messages queued: ${csv_data.length}`,
  //     });
  //   } catch (error) {
  //     console.error("Send bulk messages error:", error);
  //     return res.status(500).json({ message: "Internal server error" });
  //   }
  // },

  sendBulkMessages: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { user_ids, content, media_url, media_type } = req.body;
      const sender_id = req.user!.id;

      if ((!content && !media_url) || !user_ids || user_ids.length === 0) {
        return res.status(400).json({
          message:
            "At least one of 'content' or 'media_url' and non-empty 'user_ids' are required",
        });
      }

      const userRepository = AppDataSource.getRepository(User);
      const chatRepository = AppDataSource.getRepository(Chat);

      const users = await userRepository.findByIds(user_ids);

      if (!users || users.length === 0) {
        return res
          .status(404)
          .json({ message: "No valid users found for the provided user_ids" });
      }

      for (const user of users) {
        // Find or create chat between sender and user
        let chat = await chatRepository.findOne({
          where: [
            { sender_id, receiver_id: user.id },
            { sender_id: user.id, receiver_id: sender_id },
          ],
        });

        if (!chat) {
          chat = chatRepository.create({ sender_id, receiver_id: user.id });
          await chatRepository.save(chat);
        }

        // Push job to queue
        bulkQueue.push({
          sender_id,
          receiver: { id: user.id, phone: user.phone },
          content,
          media_url,
          media_type,
          chat_id: chat.id,
          attempt: 1,
        });
      }

      await processBulkQueue();

      // Log user activity
      try {
        await LogActivityController.logUserActivity(sender_id, `Initiated bulk message to ${users.length} recipients`);
      } catch (logError) {
        console.error("Failed to log user activity:", logError);
      }

      return res.status(200).json({
        message: "Bulk messages are being processed",
        recipients: users.map((u) => ({ id: u.id, phone: u.phone })),
      });
    } catch (error) {
      console.error("Bulk message error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  uploadBulkCSV: async (req: any, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const filePath = req.file.path;
      const results: any[] = [];
      const parser = fs
        .createReadStream(filePath)
        .pipe(parse({ columns: true, trim: true }));
      for await (const record of parser) {
        // Each record is an object: { phone: '...', var1: '...', var2: '...' }
        results.push(record);
      }
      // Optionally, delete the file after parsing
      fs.unlinkSync(filePath);
      return res.status(200).json({
        message: "CSV parsed successfully",
        data: results,
      });
    } catch (error) {
      console.error("CSV upload/parse error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  getMessageHistory: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { receiver_id } = req.params;
      const sender_id = req.user!.id;
      const userRepository = AppDataSource.getRepository(User);
      const chatRepository = AppDataSource.getRepository(Chat);
      const messageRepository = AppDataSource.getRepository(Message);

      const chat = await chatRepository.findOne({
        where: [
          { sender_id: sender_id, receiver_id: Number(receiver_id) },
          { sender_id: Number(receiver_id), receiver_id: sender_id },
        ],
      });

      if (!chat) {
        return res.status(404).json({ message: "No chat history found." });
      }

      const messages = await messageRepository.find({
        where: {
          messageable_id: chat.id,
          messageable_type: "chat",
        },
        order: { created_at: "ASC" },
      });

      // Fetch user info for sender and receiver
      const sender = await userRepository.findOne({ where: { id: sender_id } });
      const receiver = await userRepository.findOne({
        where: { id: Number(receiver_id) },
      });
      // Map messages to visual-friendly structure
      const chatHistory = messages.map((msg) => ({
        id: msg.id,
        from: msg.user_id === sender_id ? "me" : "them",
        sender_id: msg.user_id,
        receiver_id: Number(receiver_id),
        content: (msg as any).content,
        status: msg.status,
        created_at: msg.created_at,
        updated_at: msg.updated_at,
        scheduled_at: (msg as any).scheduled_at,
        is_scheduled: (msg as any).is_scheduled,
        media_url: (msg as any).media_url || null,
        media_type: (msg as any).media_type || null,
      }));
      return res.status(200).json({
        chat: chatHistory,
        sender: sender
          ? { id: sender.id, name: sender.first_name, phone: sender.phone }
          : null,
        receiver: receiver
          ? {
              id: receiver.id,
              name: receiver.first_name,
              phone: receiver.phone,
            }
          : null,
      });
    } catch (error) {
      console.error("Get message history error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // scheduleMessage: async (req: AuthenticatedRequest, res: Response) => {
  //   try {
  //     const { receiver_id, content, template_id, variables, scheduled_at } =
  //       req.body;
  //     const sender_id = req.user!.id;
  //     if (!receiver_id || !scheduled_at) {
  //       return res
  //         .status(400)
  //         .json({ message: "receiver_id and scheduled_at are required" });
  //     }
  //     const userRepository = AppDataSource.getRepository(User);
  //     const receiver = await userRepository.findOne({
  //       where: { id: receiver_id },
  //     });
  //     if (!receiver) {
  //       return res.status(404).json({ message: "Receiver not found" });
  //     }
  //     const chatRepository = AppDataSource.getRepository(Chat);

  //     let chat = await chatRepository.findOne({
  //       where: [
  //         { sender_id: sender_id, receiver_id: receiver_id },
  //         { sender_id: receiver_id, receiver_id: sender_id },
  //       ],
  //     });

  //     if (!chat) {
  //       chat = chatRepository.create({ sender_id, receiver_id });
  //       await chatRepository.save(chat);
  //     }

  //     const messageRepository = AppDataSource.getRepository(Message);
  //     const message = messageRepository.create({
  //       user_id: sender_id,
  //       messageable_type: "chat",
  //       messageable_id: chat.id,
  //       status: "scheduled",
  //       content,
  //       is_scheduled: true,
  //       scheduled_at: new Date(scheduled_at),
  //       // Optionally store template_id and variables for template messages
  //       ...(template_id && { template_id }),
  //       ...(variables && { variables }),
  //     });
  //     await messageRepository.save(message);
  //     return res.status(201).json({
  //       message: "Message scheduled successfully",
  //       data: message,
  //     });
  //   } catch (error) {
  //     console.error("Schedule message error:", error);
  //     return res.status(500).json({ message: "Internal server error" });
  //   }
  // },

  scheduleMessage: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        receiver_id,
        content,
        template_id,
        variables,
        scheduled_at,
        media_url,
        media_type,
      } = req.body;

      const sender_id = req.user!.id;

      // Validate required fields
      if (!receiver_id || !scheduled_at) {
        return res
          .status(400)
          .json({ message: "receiver_id and scheduled_at are required" });
      }

      // Ensure either content or media is present
      if (!content && !media_url) {
        return res.status(400).json({
          message: "At least one of content or media_url must be provided",
        });
      }

      // Validate media_type if media_url is provided
      if (media_url && !media_type) {
        return res.status(400).json({
          message: "media_type is required when media_url is provided",
        });
      }

      const userRepository = AppDataSource.getRepository(User);
      const receiver = await userRepository.findOne({
        where: { id: receiver_id },
      });

      if (!receiver) {
        return res.status(404).json({ message: "Receiver not found" });
      }

      const chatRepository = AppDataSource.getRepository(Chat);
      let chat = await chatRepository.findOne({
        where: [
          { sender_id, receiver_id },
          { sender_id: receiver_id, receiver_id: sender_id },
        ],
      });

      if (!chat) {
        chat = chatRepository.create({ sender_id, receiver_id });
        await chatRepository.save(chat);
      }

      const messageRepository = AppDataSource.getRepository(Message);
      const message = messageRepository.create({
        user_id: sender_id,
        messageable_type: "chat",
        messageable_id: chat.id,
        status: "scheduled",
        is_scheduled: true,
        scheduled_at: new Date(scheduled_at),
        content: content || null,
        media_url: media_url || null,
        media_type: media_url ? media_type : null,
        ...(template_id && { template_id }),
        ...(variables && { variables }),
      });

      await messageRepository.save(message);

      return res.status(201).json({
        message: "Message scheduled successfully",
        data: message,
      });
    } catch (error) {
      console.error("Schedule message error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
};

// Background job: process scheduled messages every minute
cron.schedule("* * * * *", async () => {
  const messageRepository = AppDataSource.getRepository(Message);
  const chatRepository = AppDataSource.getRepository(Chat);
  const userRepository = AppDataSource.getRepository(User);
  const now = new Date();
  const scheduledMessages = await messageRepository.find({
    where: {
      is_scheduled: true,
      status: "scheduled",
      scheduled_at: LessThanOrEqual(new Date()),
    } as any,
  });

  for (const msg of scheduledMessages) {
    const chat = await chatRepository.findOne({
      where: { id: msg.messageable_id },
    });

    if (!chat) {
      console.error(`Chat not found for message ID ${msg.messageable_id}`);
      continue;
    }

    const receiver = await userRepository.findOne({
      where: { id: chat.receiver_id },
    });

    if (!receiver) {
      console.error(`Receiver not found for chat ID ${chat.id}`);
      continue;
    }

    const job: any = {
      sender_id: msg.user_id,
      receiver: { phone: receiver.phone }, // You may need to resolve this to actual phone number if it's just user_id
      content: msg.content,
      attempt: 1,
      scheduled_message_id: msg.id,
    };

    // Conditionally include template data
    if ((msg as any).template_id && (msg as any).variables) {
      job.template_id = (msg as any).template_id;
      job.variables = (msg as any).variables;
    }

    bulkQueue.push(job);
    msg.status = "queued";
    await messageRepository.save(msg);
  }

  if (scheduledMessages.length > 0) processBulkQueue();
});
