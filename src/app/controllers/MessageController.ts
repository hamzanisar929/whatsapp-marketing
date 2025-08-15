import { Request, Response } from "express";
import { AppDataSource } from "../../database/connection/dataSource";
import { Message } from "../../database/entities/Message";
import { Template } from "../../database/entities/Template";
import { User, UserRole } from "../../database/entities/User";
import { Chat } from "../../database/entities/Chat";
import { Code, LessThanOrEqual } from "typeorm";
import axios from "axios";
import { parse } from "csv-parse";
import fs from "fs";
import cron from "node-cron";
import SocketServer from "../socket/SocketServer";
import { LogActivityController } from "./LogActivityController";
import { TemplateMedia } from "../../database/entities/TemplateMedia";
import os from "os";
import path from "path";
import FormData from "form-data";

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
          let contactInfo = contacts.find(
            (c: any) => c.wa_id === from.replace("+", "")
          );

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
            phone: contact.phone,
          },
          chat_id: chat.id,
          status: "received",
          created_at: incomingMessage.created_at,
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
            phone: contact.phone,
          },
          wa_message_id,
          timestamp: new Date(),
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
    console.log(receiver);
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
      console.log("---- Incoming Webhook Verification Request ----");
      console.log("Headers:", req.headers);
      console.log("Query:", req.query);
      console.log("Params:", req.params);
      console.log("Body:", req.body);
      console.log("-----------------------------------------------");
      const mode = req.query["hub.mode"];
      const challenge = req.query["hub.challenge"];
      const token = req.query["hub.verify_token"];

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
  receiveWebhook: async (req: Request, res: Response , io: any , socketConnectedUser:any ) => {
    try {
    console.log("📩 Incoming WhatsApp webhook:", JSON.stringify(req.body, null, 2));

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;
      console.log(23423423);
    if (messages && messages.length > 0) {
      const message = messages[0];
      const from = message.from; // sender's WhatsApp number
      const type = message.type;
      console.log(4444);
      const sendTo = 1;
      const socketDetail = socketConnectedUser.get(sendTo);
      console.log(socketDetail);
      if (socketDetail) {
       
        io.to(socketDetail.socketId).emit("recieve-message", { from, type, message });
        console.log(` Sent message to socket for ${from}`);
      } else {
        console.log(` No active socket for ${from}`);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error handling webhook:", error);
    res.sendStatus(500);
  }
  },


  mediaMessage: async (req: Request, res: Response)=>{
     try{
        const file = req.file as Express.Multer.File
        const filename =  file.filename;
        const mimeType = file.mimetype;
        const to = req.body.to;
        const filePath = path.join(__dirname , "../../../uploads" , filename)
        const mediaId = await uploadWhatsAppMedia(filePath, mimeType);
        await sendWhatsAppMedia(to, mediaId, "document");
        return res.status(200).json({msg : `Message send to user with media id ${mediaId}`})
     }catch( error ){
      console.log(error);
        console.log("HEREERERERE");
        return res.status(500).json({ message: "Internal server error" , error });
     }
  },

  

  // sendMessage: async (req: AuthenticatedRequest, res: Response) => {
  //   try {
  //     const { receiver_id, content, template_id, media_url, media_type } =
  //       req.body;
  //     const sender_id = req.user!.id;

  //     const userRepository = AppDataSource.getRepository(User);
  //     const receiver = await userRepository.findOne({
  //       where: { id: receiver_id },
  //     });
  //     const sender = await userRepository.findOne({ where: { id: sender_id } });

  //     if (!receiver) {
  //       return res.status(404).json({ message: "Receiver not found" });
  //     }

  //     if (
  //       !sender ||
  //       !sender.whatsapp_api_token ||
  //       !sender.whatsapp_business_phone
  //     ) {
  //       return res
  //         .status(400)
  //         .json({ message: "Sender WhatsApp API config missing" });
  //     }

  //     let waResponse = null;
  //     let waError = null;
  //     let waStatus = "sent";

  //     try {
  //       const headers = {
  //         Authorization: `Bearer ${sender.whatsapp_api_token}`,
  //         "Content-Type": "application/json",
  //       };

  //       if (media_url && media_type) {
  //         // Handle media message with optional caption
  //         let mediaPayload: any = {
  //           messaging_product: "whatsapp",
  //           to: receiver.phone,
  //           type: media_type,
  //         };

  //         const supportedMediaTypes = ["image", "video", "document"];

  //         if (!supportedMediaTypes.includes(media_type)) {
  //           return res.status(400).json({ message: "Unsupported media type" });
  //         }

  //         // Attach media with optional caption
  //         mediaPayload[media_type] = {
  //           link: media_url,
  //           ...(content ? { caption: content } : {}),
  //         };

  //         waResponse = await axios.post(
  //           `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
  //           mediaPayload,
  //           { headers }
  //         );
  //       } else if (content) {
  //         // Plain text message only
  //         waResponse = await axios.post(
  //           `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
  //           {
  //             messaging_product: "whatsapp",
  //             to: receiver.phone,
  //             type: "text",
  //             text: { body: content, preview_url: false },
  //           },
  //           { headers }
  //         );
  //       } else {
  //         return res
  //           .status(400)
  //           .json({ message: "No content or media provided" });
  //       }
  //     } catch (err: any) {
  //       waError = err.response?.data || err.message;
  //       waStatus = "failed";
  //     }

  //     // Get or create chat between sender and receiver
  //     const chatRepository = AppDataSource.getRepository(Chat);
  //     let chat = await chatRepository.findOne({
  //       where: [
  //         { sender_id, receiver_id },
  //         { sender_id: receiver_id, receiver_id: sender_id },
  //       ],
  //     });

  //     if (!chat) {
  //       chat = chatRepository.create({ sender_id, receiver_id });
  //       await chatRepository.save(chat);
  //     }

  //     // Save message
  //     const messageRepository = AppDataSource.getRepository(Message);
  //     const message = messageRepository.create({
  //       user_id: sender_id,
  //       messageable_type: "chat",
  //       messageable_id: chat.id,
  //       status: waStatus,
  //       content: content || media_url,
  //       media_type: media_type || null,
  //       media_url: media_url || null,
  //     });
  //     await messageRepository.save(message);

  //     if (waStatus === "failed") {
  //       return res.status(500).json({
  //         message: "Failed to send via WhatsApp API",
  //         error: waError,
  //       });
  //     }

  //     // Log user activity
  //     try {
  //       await LogActivityController.logUserActivity(
  //         sender_id,
  //         `Sent message to ${receiver.first_name} ${receiver.last_name}`
  //       );
  //     } catch (logError) {
  //       console.error("Failed to log user activity:", logError);
  //     }

  //     return res.status(201).json({
  //       message: "Message sent successfully via WhatsApp API",
  //       data: message,
  //       wa_response: waResponse?.data,
  //     });
  //   } catch (error) {
  //     console.error("Send message error:", error);
  //     return res.status(500).json({ message: "Internal server error" });
  //   }
  // },

  // Send template Message add chat functionality
  // sendTemplateMessage: async (req: AuthenticatedRequest, res: Response) => {
  //   try {
  //     const { receiver_id, template_id, variables } = req.body;
  //     const sender_id = req.user!.id;

  //     const userRepository = AppDataSource.getRepository(User);
  //     const receiver = await userRepository.findOne({
  //       where: { id: receiver_id },
  //     });
  //     const sender = await userRepository.findOne({ where: { id: sender_id } });

  //     if (!receiver) {
  //       return res.status(404).json({ message: "Receiver not found" });
  //     }
  //     if (
  //       !sender ||
  //       !sender.whatsapp_api_token ||
  //       !sender.whatsapp_business_phone
  //     ) {
  //       return res
  //         .status(400)
  //         .json({ message: "Sender WhatsApp API config missing" });
  //     }

  //     const templateRepository = AppDataSource.getRepository(Template);
  //     const template = await templateRepository.findOne({
  //       where: { id: template_id },
  //       relations: ["variables"],
  //     });

  //     if (!template) {
  //       return res.status(404).json({ message: "Template not found" });
  //     }

  //     // Prepare WhatsApp API template message payload
  //     const components = [];
  //     // if (template.variables && variables) {
  //     //   const params = template.variables.map((v: any) => ({
  //     //     type: "text",
  //     //     text: variables[v.name] || v.default_value || "",
  //     //   }));
  //     //   components.push({
  //     //     type: "body",
  //     //     parameters: params,
  //     //   });
  //     // }

  //     if (variables && Array.isArray(variables)) {
  //       components.push({
  //         type: "body",
  //         parameters: variables,
  //       });
  //     } else if (template.variables && variables) {
  //       const params = template.variables.map((v: any) => ({
  //         type: "text",
  //         text: variables[v.name] || v.default_value || "",
  //       }));
  //       components.push({
  //         type: "body",
  //         parameters: params,
  //       });
  //     }

  //     let waResponse = null;
  //     let waError = null;
  //     let waStatus = "sent";
  //     try {
  //       // First, get the WhatsApp Business Account ID
  //       const wbaResponse = await axios.get(
  //         `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}`,
  //         {
  //           headers: {
  //             Authorization: `Bearer ${sender.whatsapp_api_token}`,
  //             "Content-Type": "application/json",
  //           },
  //         }
  //       );

  //       const phoneNumberId = sender.whatsapp_business_phone;

  //       // Send the template message using the phone number ID
  //       // Note: For sending messages, we use the phone number ID, not the business account ID
  //       waResponse = await axios.post(
  //         `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
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
  //       waStatus = "sent";
  //     } catch (err: any) {
  //       waError = err.response?.data || err.message;
  //       waStatus = "failed";
  //     }

  //     if (waStatus === "failed") {
  //       return res.status(500).json({
  //         message: "Failed to send template via WhatsApp API",
  //         error: waError,
  //       });
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
  //       messageable_type: "template",
  //       messageable_id: chat?.id,
  //       status: waStatus,
  //     });
  //     await messageRepository.save(message);

  //     // Log user activity
  //     try {
  //       await LogActivityController.logUserActivity(
  //         sender_id,
  //         `Sent template message '${template.name}' to ${receiver.first_name} ${receiver.last_name}`
  //       );
  //     } catch (logError) {
  //       console.error("Failed to log user activity:", logError);
  //     }

  //     return res.status(201).json({
  //       message: "Template message sent successfully via WhatsApp API",
  //       data: message,
  //       wa_response: waResponse?.data,
  //     });
  //   } catch (error) {
  //     console.error("Send template message error:", error);
  //     return res.status(500).json({ message: "Internal server error" });
  //   }
  // },

  // Sending Media Templates
  // sendTemplateMessage: async (req: AuthenticatedRequest, res: Response) => {
  //   try {
  //     const { receiver_id, template_id, variables } = req.body;
  //     const sender_id = req.user!.id;

  //     const userRepository = AppDataSource.getRepository(User);
  //     const receiver = await userRepository.findOne({
  //       where: { id: receiver_id },
  //     });
  //     const sender = await userRepository.findOne({ where: { id: sender_id } });

  //     if (!receiver) {
  //       return res.status(404).json({ message: "Receiver not found" });
  //     }
  //     if (
  //       !sender ||
  //       !sender.whatsapp_api_token ||
  //       !sender.whatsapp_business_phone
  //     ) {
  //       return res
  //         .status(400)
  //         .json({ message: "Sender WhatsApp API config missing" });
  //     }

  //     const templateRepository = AppDataSource.getRepository(Template);
  //     const template = await templateRepository.findOne({
  //       where: { id: template_id },
  //       relations: ["variables"],
  //     });

  //     if (!template) {
  //       return res.status(404).json({ message: "Template not found" });
  //     }

  //     // 🔹 Get media for the template (if exists)
  //     const templateMediaRepo = AppDataSource.getRepository(TemplateMedia);
  //     const media = await templateMediaRepo.findOne({
  //       where: { template_id: template.id },
  //     });

  //     // Prepare WhatsApp API template message payload
  //     const components: any[] = [];

  //     // Add media header if exists
  //     if (media && typeof media.type === "string" && media.wa_media_id) {
  //       const lowerType = media.type.toLowerCase();

  //       components.push({
  //         type: "header",
  //         parameters: [
  //           {
  //             type: lowerType, // "image", "video", "document"
  //             image:
  //               lowerType === "image" ? { id: media.wa_media_id } : undefined,
  //             video:
  //               lowerType === "video" ? { id: media.wa_media_id } : undefined,
  //             document:
  //               lowerType === "document"
  //                 ? { id: media.wa_media_id }
  //                 : undefined,
  //           },
  //         ],
  //       });
  //     }

  //     // Add body variables
  //     if (variables && Array.isArray(variables)) {
  //       components.push({
  //         type: "body",
  //         parameters: variables,
  //       });
  //     } else if (template.variables && variables) {
  //       const params = template.variables.map((v: any) => ({
  //         type: "text",
  //         text: variables[v.name] || v.default_value || "",
  //       }));
  //       components.push({
  //         type: "body",
  //         parameters: params,
  //       });
  //     }

  //     let waResponse = null;
  //     let waError = null;
  //     let waStatus = "sent";

  //     try {
  //       const phoneNumberId = sender.whatsapp_business_phone;

  //       waResponse = await axios.post(
  //         `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
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
  //     } catch (err: any) {
  //       waError = err.response?.data || err.message;
  //       waStatus = "failed";
  //     }

  //     if (waStatus === "failed") {
  //       return res.status(500).json({
  //         message: "Failed to send template via WhatsApp API",
  //         error: waError,
  //       });
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
  //       messageable_type: "template",
  //       messageable_id: chat?.id,
  //       status: waStatus,
  //     });
  //     await messageRepository.save(message);

  //     await LogActivityController.logUserActivity(
  //       sender_id,
  //       `Sent template message '${template.name}' to ${receiver.first_name} ${receiver.last_name}`
  //     );

  //     return res.status(201).json({
  //       message: "Template message sent successfully via WhatsApp API",
  //       data: message,
  //       wa_response: waResponse?.data,
  //     });
  //   } catch (error) {
  //     console.error("Send template message error:", error);
  //     return res.status(500).json({ message: "Internal server error" });
  //   }
  // },

  // sendMessage: async (req: AuthenticatedRequest, res: Response) => {
  //   try {
  //     const { receiver_id, content, media_url, media_type } = req.body;
  //     const sender_id = req.user!.id;

  //     const userRepository = AppDataSource.getRepository(User);
  //     const receiver = await userRepository.findOne({
  //       where: { id: receiver_id },
  //     });
  //     const sender = await userRepository.findOne({ where: { id: sender_id } });

  //     if (!receiver)
  //       return res.status(404).json({ message: "Receiver not found" });
  //     if (!sender?.whatsapp_api_token || !sender?.whatsapp_business_phone)
  //       return res
  //         .status(400)
  //         .json({ message: "Sender WhatsApp API config missing" });

  //     let waStatus = "sent";
  //     let waResponse = null;
  //     let waError = null;
  //     const headers = { Authorization: `Bearer ${sender.whatsapp_api_token}` };

  //     try {
  //       if (media_url && media_type) {
  //         const supportedMediaTypes = ["image", "video", "document"];
  //         if (!supportedMediaTypes.includes(media_type)) {
  //           return res.status(400).json({ message: "Unsupported media type" });
  //         }

  //         let mediaId = null;

  //         // Step 1 — Upload media to WhatsApp
  //         if (!media_url.startsWith("http")) {
  //           // Local file — upload
  //           const filePath = path.isAbsolute(media_url)
  //             ? media_url
  //             : path.join(process.cwd(), media_url);
  //           if (!fs.existsSync(filePath)) {
  //             return res.status(400).json({ message: "Media file not found" });
  //           }

  //           const formData = new FormData();
  //           formData.append("file", fs.createReadStream(filePath));
  //           formData.append("type", media_type);
  //           formData.append("messaging_product", "whatsapp");

  //           const uploadRes = await axios.post(
  //             `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/media`,
  //             formData,
  //             {
  //               headers: {
  //                 ...formData.getHeaders(),
  //                 Authorization: `Bearer ${sender.whatsapp_api_token}`,
  //               },
  //             }
  //           );
  //           mediaId = uploadRes.data.id;
  //         } else {
  //           // Remote file — try using direct link
  //           mediaId = null; // we can send by link without upload
  //         }

  //         // Step 2 — Send media message
  //         let mediaPayload: any = {
  //           messaging_product: "whatsapp",
  //           to: receiver.phone,
  //           type: media_type,
  //         };

  //         if (mediaId) {
  //           mediaPayload[media_type] = {
  //             id: mediaId,
  //             ...(content ? { caption: content } : {}),
  //           };
  //         } else {
  //           mediaPayload[media_type] = {
  //             link: media_url,
  //             ...(content ? { caption: content } : {}),
  //           };
  //         }

  //         waResponse = await axios.post(
  //           `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
  //           mediaPayload,
  //           { headers: { ...headers, "Content-Type": "application/json" } }
  //         );
  //       } else if (content) {
  //         // Plain text
  //         waResponse = await axios.post(
  //           `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
  //           {
  //             messaging_product: "whatsapp",
  //             to: receiver.phone,
  //             type: "text",
  //             text: { body: content, preview_url: false },
  //           },
  //           { headers: { ...headers, "Content-Type": "application/json" } }
  //         );
  //       } else {
  //         return res
  //           .status(400)
  //           .json({ message: "No content or media provided" });
  //       }
  //     } catch (err: any) {
  //       waError = err.response?.data || err.message;
  //       waStatus = "failed";
  //     }

  //     // Get or create chat
  //     const chatRepository = AppDataSource.getRepository(Chat);
  //     let chat = await chatRepository.findOne({
  //       where: [
  //         { sender_id, receiver_id },
  //         { sender_id: receiver_id, receiver_id: sender_id },
  //       ],
  //     });
  //     if (!chat) {
  //       chat = chatRepository.create({ sender_id, receiver_id });
  //       await chatRepository.save(chat);
  //     }

  //     // Save message
  //     const messageRepository = AppDataSource.getRepository(Message);
  //     const message = messageRepository.create({
  //       user: { id: sender_id } as User,
  //       messageable_type: "chat",
  //       messageable_id: chat.id,
  //       status: waStatus,
  //       content: content || media_url,
  //       media_type: media_type || null,
  //       media_url: media_url || null,
  //     });
  //     await messageRepository.save(message);

  //     if (waStatus === "failed") {
  //       return res
  //         .status(500)
  //         .json({ message: "Failed to send via WhatsApp API", error: waError });
  //     }

  //     return res.status(201).json({
  //       message: "Message sent successfully via WhatsApp API",
  //       data: message,
  //       wa_response: waResponse?.data,
  //     });
  //   } catch (error) {
  //     console.error("Send message error:", error);
  //     return res.status(500).json({ message: "Internal server error" });
  //   }
  // },

  sendMessage: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { receiver_id, content, media_url, media_type } = req.body;
      const sender_id = req.user!.id;

      // validate user & target
      const userRepo = AppDataSource.getRepository(User);
      const receiver = await userRepo.findOne({ where: { id: receiver_id } });
      const sender = await userRepo.findOne({ where: { id: sender_id } });

      if (!receiver)
        return res.status(404).json({ message: "Receiver not found" });
      if (!sender?.whatsapp_api_token || !sender?.whatsapp_business_phone) {
        return res
          .status(400)
          .json({ message: "Sender WhatsApp API config missing" });
      }

      let waStatus = "sent";
      let waError = null;
      let waResponse = null;

      // HTTPS upload & send
      if (media_url && media_type) {
        const supportedMedia = ["image", "video", "document"];
        if (!supportedMedia.includes(media_type)) {
          return res.status(400).json({ message: "Unsupported media type" });
        }

        let mediaId: string | null = null;
        const phoneId = sender.whatsapp_business_phone;
        const authHeader = {
          Authorization: `Bearer ${sender.whatsapp_api_token}`,
        };

        if (!media_url.startsWith("http")) {
          // Upload local file first
          const filePath = path.isAbsolute(media_url)
            ? media_url
            : path.join(process.cwd(), media_url);
          if (!fs.existsSync(filePath)) {
            return res.status(400).json({ message: "Media file not found" });
          }

          const form = new FormData();
          form.append("file", fs.createReadStream(filePath));
          form.append("type", media_type);
          form.append("messaging_product", "whatsapp");

          const uploadRes = await axios.post(
            `https://graph.facebook.com/v20.0/${phoneId}/media`,
            form,
            { headers: { ...form.getHeaders(), ...authHeader } }
          );
          mediaId = uploadRes.data.id;
          console.log(mediaId);
        }

        const payload: any = {
          messaging_product: "whatsapp",
          to: receiver.phone,
          type: media_type,
        };
        payload[media_type] = mediaId
          ? { id: mediaId, ...(content ? { caption: content } : {}) }
          : { link: media_url, ...(content ? { caption: content } : {}) };

        try {
          waResponse = await axios.post(
            `https://graph.facebook.com/v20.0/${phoneId}/messages`,
            payload,
            { headers: { "Content-Type": "application/json", ...authHeader } }
          );
        } catch (err: any) {
          waError = err.response?.data || err.message;
          waStatus = "failed";
        }
      } else if (content) {
        // Text only path
        try {
          waResponse = await axios.post(
            `https://graph.facebook.com/v20.0/${sender.whatsapp_business_phone}/messages`,
            {
              messaging_product: "whatsapp",
              to: receiver.phone,
              type: "text",
              text: { body: content, preview_url: false },
            },
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${sender.whatsapp_api_token}`,
              },
            }
          );
        } catch (err: any) {
          waError = err.response?.data || err.message;
          waStatus = "failed";
        }
      } else {
        return res
          .status(400)
          .json({ message: "No content or media provided" });
      }

      // Save message
      const chatRepo = AppDataSource.getRepository(Chat);
      let chat = await chatRepo.findOne({
        where: [
          { sender_id, receiver_id },
          { sender_id: receiver_id, receiver_id: sender_id },
        ],
      });
      if (!chat) {
        chat = chatRepo.create({ sender_id, receiver_id });
        await chatRepo.save(chat);
      }

      const msgRepo = AppDataSource.getRepository(Message);
      const message = msgRepo.create({
        user: { id: sender_id } as User,
        messageable_type: "chat",
        messageable_id: chat.id,
        status: waStatus,
        content: content || media_url,
        media_type: media_type || null,
        media_url: media_url || null,
      });
      await msgRepo.save(message);

      if (waStatus === "failed") {
        return res
          .status(500)
          .json({ message: "Failed to send via WhatsApp API", error: waError });
      }

      await LogActivityController.logUserActivity(
        sender_id,
        `Sent message to ${receiver.first_name} ${receiver.last_name}`
      );

      return res.status(201).json({
        message: "Message sent successfully via WhatsApp API",
        data: message,
        wa_response: waResponse?.data,
      });
    } catch (error: any) {
      console.error(
        "Send message error:",
        error?.response?.data || error.message
      );
      return res.status(500).json({ message: "Internal server error" });
    }
  },

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

      // 🔹 Get media for the template (if exists)
      const templateMediaRepo = AppDataSource.getRepository(TemplateMedia);
      let media = await templateMediaRepo.findOne({
        where: { template_id: template.id },
      });

      // 🔹 If media exists but doesn't have wa_media_id → upload it first
      let waMediaId: string | null = null;
      if (media) {
        try {
          const data = new FormData();
          data.append("messaging_product", "whatsapp");

          let fileStream: fs.ReadStream;
          let tempFilePath: string | null = null;

          if (media.url && media.url.startsWith("http")) {
            // Remote file
            tempFilePath = path.join(
              os.tmpdir(),
              `wa_upload_${Date.now()}.png`
            );
            const response = await axios.get(media.url, {
              responseType: "stream",
            });
            const writer = fs.createWriteStream(tempFilePath);
            await new Promise<void>((resolve, reject) => {
              response.data.pipe(writer);
              writer.on("finish", resolve);
              writer.on("error", reject);
            });
            fileStream = fs.createReadStream(tempFilePath);
          } else {
            // Local file path (from filename in /public or other dir)
            const localPath = path.isAbsolute(media.filename)
              ? media.filename
              : path.join(process.cwd(), "public", media.filename);

            if (!fs.existsSync(localPath)) {
              return res.status(400).json({ error: "Media file not found" });
            }
            fileStream = fs.createReadStream(localPath);
          }

          data.append("file", fileStream, { contentType: "image/png" }); // adjust type if needed
          data.append("type", "image/png");

          const uploadRes = await axios.post(
            `https://graph.facebook.com/v20.0/${sender.whatsapp_business_phone}/media`,
            data,
            {
              headers: {
                Authorization: `Bearer ${sender.whatsapp_api_token}`,
                ...data.getHeaders(),
              },
            }
          );

          waMediaId = uploadRes.data.id;

          // Cleanup
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }

          // Save mediaId in DB for future use
          if (!media) {
            return res.status(400).json({ error: "Template media not found" });
          }

          (media as TemplateMedia).wa_media_id = waMediaId ?? "";
          await templateMediaRepo.save(media);
          await templateMediaRepo.save(media);
        } catch (uploadErr) {
          console.error("Media upload failed:", uploadErr);
          return res
            .status(500)
            .json({ message: "Failed to upload media to WhatsApp" });
        }
      }

      // Prepare WhatsApp API template message payload
      const components: any[] = [];

      // Add media header if exists
      if (media && waMediaId && typeof media.type === "string") {
        const lowerType = media.type.toLowerCase();
        components.push({
          type: "header",
          parameters: [
            {
              type: lowerType,
              image: lowerType === "image" ? { id: waMediaId } : undefined,
              video: lowerType === "video" ? { id: waMediaId } : undefined,
              document:
                lowerType === "document" ? { id: waMediaId } : undefined,
            },
          ],
        });
      }

      // Add body variables
      if (variables && Array.isArray(variables)) {
        components.push({
          type: "body",
          parameters: variables,
        });
      } else if (template.variables && variables) {
        const params = template.variables.map((v: any) => ({
          type: "text",
          text: variables[v.name] || v.default_value || "",
        }));
        components.push({
          type: "body",
          parameters: params,
        });
      }

      // Send template message
      let waResponse,
        waError,
        waStatus = "sent";
      try {
        waResponse = await axios.post(
          `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
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

      // Save chat & message
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

      let messageText = template.message; // e.g. "Hello {{1}}, your order {{2}} is confirmed."
      if (variables && Array.isArray(variables)) {
        variables.forEach((variableValue, index) => {
          const placeholder = new RegExp(`{{${index + 1}}}`, "g");
          messageText = messageText.replace(
            placeholder,
            variableValue.text || ""
          );
        });
      }

      // 5. Save to DB
      const message = messageRepository.create({
        user_id: sender_id,
        messageable_type: "template",
        messageable_id: chat?.id,
        status: waStatus,
        content: messageText,
        media_url: media?.url || null,
        media_type: media?.type || null,
      } as any);
      await messageRepository.save(message);

      await LogActivityController.logUserActivity(
        sender_id,
        `Sent template message '${template.name}' to ${receiver.first_name} ${receiver.last_name}`
      );

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
        await LogActivityController.logUserActivity(
          sender_id,
          `Initiated bulk message to ${users.length} recipients`
        );
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

  sendTemplateMessageTest: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { WHATSAPP_ACCESS_TOKEN } = process.env;

      const response = await axios.post(
        `https://graph.facebook.com/v20.0/140540532486833/messages`,
        {
          messaging_product: "whatsapp",
          to: "923309266288", // must be in full international format without +
          type: "template",
          template: {
            name: "hello_world",
            language: { code: "en_US" },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("✅ Message sent:", response.data);
      return res.status(200).json(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          "❌ WhatsApp API error:",
          error.response?.data || error.message
        );
        return res
          .status(500)
          .json(error.response?.data || { error: error.message });
      } else {
        console.error("❌ Unexpected error:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    }
    // console.log(process.env.WHATSAPP_ACCESS_TOKEN);
    // const response = await axios({
    //   url: `https://graph.facebook.com/v20.0/140540532486833/messages`,
    //   method: "post",
    //   headers: {
    //     Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
    //     "Content-Type": "application/json",
    //   },
    //   data: JSON.stringify({
    //     messaging_product: "whatsapp",
    //     to: "923309266288",
    //     type: "template",
    //     template: {
    //       name: "hello_world",
    //       language: {
    //         code: "en_US",
    //       },
    //     },
    //   }),
    // });

    // console.log(response);
  },

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


async function uploadWhatsAppMedia(filePath: string, mimeType: string) {
  const formData = new FormData();
  formData.append("file", fs.createReadStream(filePath));
  formData.append("messaging_product", "whatsapp");

  const response = await axios.post(
    `https://graph.facebook.com/v20.0/140540532486833/media`,
    formData,
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        ...formData.getHeaders(),
      },
    }
  );
  console.log(response);
  return response.data.id; 
}


async function sendWhatsAppMedia(to: string, mediaId: string, type: string) {
  console.log(to);
  console.log(mediaId);
  console.log(type);
  const response = await axios.post("https://graph.facebook.com/v22.0/140540532486833/messages",
    {
      messaging_product: "whatsapp",
      to,
      type,
      [type]: {
        id: mediaId,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  console.log(response.status)
  console.log(response.data)
  console.log(response.data.message)
}