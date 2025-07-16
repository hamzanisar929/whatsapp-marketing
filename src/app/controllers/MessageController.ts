import { Request, Response } from "express";
import { AppDataSource } from "../../database/connection/dataSource";
import { Message } from "../../database/entities/Message";
import { Template } from "../../database/entities/Template";
import { User } from "../../database/entities/User";
import axios from "axios";
import { parse } from "csv-parse";
import fs from "fs";
import cron from "node-cron";

interface AuthenticatedRequest extends Request {
  user: { id: number };
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

async function sendBulkJob(job: any) {
  const { sender_id, receiver, content, template_id, variables, attempt } = job;
  try {
    // Use the same logic as sendMessage/sendTemplateMessage
    const userRepository = AppDataSource.getRepository(User);
    const sender = await userRepository.findOne({ where: { id: sender_id } });
    if (
      !sender ||
      !sender.whatsapp_api_token ||
      !sender.whatsapp_business_phone
    ) {
      job.status = "failed";
      job.error = "Sender WhatsApp API config missing";
      return;
    }
    let waResponse = null;
    let waStatus = "sent";
    if (template_id) {
      // Template message
      const templateRepository = AppDataSource.getRepository(Template);
      const template = await templateRepository.findOne({
        where: { id: template_id },
        relations: ["variables"],
      });
      if (!template) {
        job.status = "failed";
        job.error = "Template not found";
        return;
      }
      const components = [];
      if (template.variables && variables) {
        const params = template.variables.map((v: any) => ({
          type: "text",
          text: variables[v.name] || v.default_value || "",
        }));
        components.push({ type: "body", parameters: params });
      }
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
    } else {
      // Plain text message
      waResponse = await axios.post(
        `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
        {
          messaging_product: "whatsapp",
          to: receiver.phone,
          type: "text",
          text: { body: content },
        },
        {
          headers: {
            Authorization: `Bearer ${sender.whatsapp_api_token}`,
            "Content-Type": "application/json",
          },
        }
      );
    }
    job.status = "sent";
    job.wa_response = waResponse?.data;
  } catch (err: any) {
    job.status = "failed";
    job.error = err.response?.data || err.message;
    if ((job.attempt || 1) < MAX_RETRIES) {
      // Retry
      bulkQueue.push({ ...job, attempt: (job.attempt || 1) + 1 });
    }
  }
}

export const MessageController = {
  sendMessage: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { receiver_id, content, template_id, media_url } = req.body;
      const sender_id = req.user.id;

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

      // WhatsApp API integration
      let waResponse = null;
      let waError = null;
      let waStatus = "sent";
      try {
        if (media_url) {
          // Send media message
          waResponse = await axios.post(
            `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
            {
              messaging_product: "whatsapp",
              to: receiver.phone,
              type: "image", // You can extend to video/document as needed
              image: { link: media_url },
            },
            {
              headers: {
                Authorization: `Bearer ${sender.whatsapp_api_token}`,
                "Content-Type": "application/json",
              },
            }
          );
        } else {
          // Send plain text message (already implemented)
          waResponse = await axios.post(
            `https://graph.facebook.com/v17.0/${sender.whatsapp_business_phone}/messages`,
            {
              messaging_product: "whatsapp",
              to: receiver.phone,
              type: "text",
              text: { body: content },
            },
            {
              headers: {
                Authorization: `Bearer ${sender.whatsapp_api_token}`,
                "Content-Type": "application/json",
              },
            }
          );
        }
        waStatus = "sent";
      } catch (err: any) {
        waError = err.response?.data || err.message;
        waStatus = "failed";
      }

      const messageRepository = AppDataSource.getRepository(Message);
      const message = messageRepository.create({
        user_id: sender_id,
        messageable_type: "chat",
        messageable_id: receiver_id,
        status: waStatus,
      });
      await messageRepository.save(message);

      if (waStatus === "failed") {
        return res
          .status(500)
          .json({ message: "Failed to send via WhatsApp API", error: waError });
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

  sendTemplateMessage: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { receiver_id, template_id, variables } = req.body;
      const sender_id = req.user.id;

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
        waStatus = "sent";
      } catch (err: any) {
        waError = err.response?.data || err.message;
        waStatus = "failed";
      }

      const messageRepository = AppDataSource.getRepository(Message);
      const message = messageRepository.create({
        user_id: sender_id,
        messageable_type: "chat",
        messageable_id: receiver_id,
        status: waStatus,
      });
      await messageRepository.save(message);

      if (waStatus === "failed") {
        return res
          .status(500)
          .json({
            message: "Failed to send template via WhatsApp API",
            error: waError,
          });
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

  sendBulkMessages: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { csv_data, content, template_id } = req.body;
      const sender_id = req.user.id;
      if (!csv_data || !Array.isArray(csv_data) || csv_data.length === 0) {
        return res
          .status(400)
          .json({ message: "CSV data required for bulk messaging" });
      }
      // Each csv_data item: { phone: '...', var1: '...', ... }
      for (const row of csv_data) {
        bulkQueue.push({
          sender_id,
          receiver: { phone: row.phone },
          content,
          template_id,
          variables: row,
          attempt: 1,
        });
      }
      processBulkQueue();
      return res.status(200).json({
        message: `Bulk messages queued: ${csv_data.length}`,
      });
    } catch (error) {
      console.error("Send bulk messages error:", error);
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
      const sender_id = req.user.id;
      const userRepository = AppDataSource.getRepository(User);
      const messageRepository = AppDataSource.getRepository(Message);
      const messages = await messageRepository.find({
        where: [
          {
            user_id: sender_id,
            messageable_id: Number(receiver_id),
            messageable_type: "chat",
          },
          {
            user_id: Number(receiver_id),
            messageable_id: sender_id,
            messageable_type: "chat",
          },
        ],
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
        receiver_id: msg.messageable_id,
        content: (msg as any).content,
        status: msg.status,
        created_at: msg.created_at,
        updated_at: msg.updated_at,
        scheduled_at: (msg as any).scheduled_at,
        is_scheduled: (msg as any).is_scheduled,
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

  scheduleMessage: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { receiver_id, content, template_id, variables, scheduled_at } =
        req.body;
      const sender_id = req.user.id;
      if (!receiver_id || !scheduled_at) {
        return res
          .status(400)
          .json({ message: "receiver_id and scheduled_at are required" });
      }
      const userRepository = AppDataSource.getRepository(User);
      const receiver = await userRepository.findOne({
        where: { id: receiver_id },
      });
      if (!receiver) {
        return res.status(404).json({ message: "Receiver not found" });
      }
      const messageRepository = AppDataSource.getRepository(Message);
      const message = messageRepository.create({
        user_id: sender_id,
        messageable_type: "chat",
        messageable_id: receiver_id,
        status: "scheduled",
        content,
        is_scheduled: true,
        scheduled_at: new Date(scheduled_at),
        // Optionally store template_id and variables for template messages
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
  const now = new Date();
  const scheduledMessages = await messageRepository.find({
    where: {
      is_scheduled: true,
      status: "scheduled",
      scheduled_at: () => `scheduled_at <= NOW()`,
    } as any,
  });
  for (const msg of scheduledMessages) {
    // Prepare job for queue
    bulkQueue.push({
      sender_id: msg.user_id,
      receiver: { phone: msg.messageable_id }, // You may need to resolve phone from user_id
      content: msg.content,
      template_id: (msg as any).template_id,
      variables: (msg as any).variables,
      attempt: 1,
      scheduled_message_id: msg.id,
    });
    msg.status = "queued";
    await messageRepository.save(msg);
  }
  if (scheduledMessages.length > 0) processBulkQueue();
});
