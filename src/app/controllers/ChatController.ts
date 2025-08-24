import { Request, Response } from "express";
import { AppDataSource } from "../../database/connection/dataSource";
import { Chat } from "../../database/entities/Chat";
import { User, UserRole } from "../../database/entities/User";
import { LogActivityController } from "./LogActivityController";

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: UserRole;
  };
}

export const ChatController = {
  /**
   * Get all contacts/users that the logged-in user has chatted with
   * @param req - Request object with authenticated user
   * @param res - Response object
   * @returns List of users the authenticated user has chatted with
   */
  getUserChats: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Get the chat repository
      const chatRepository = AppDataSource.getRepository(Chat);
      const userRepository = AppDataSource.getRepository(User);
      
      // Find all chats where the user is either sender or receiver
      const chats = await chatRepository
        .createQueryBuilder("chat")
        .where("chat.sender_id = :userId", { userId })
        .orWhere("chat.receiver_id = :userId", { userId })
        .orderBy("chat.updated_at", "DESC")
        .getMany();
      
      // Extract unique user IDs (excluding the logged-in user)
      const contactIds = new Set<number>();
      chats.forEach(chat => {
        if (chat.sender_id === userId) {
          contactIds.add(chat.receiver_id);
        } else {
          contactIds.add(chat.sender_id);
        }
      });
      
      // Get user details for all contacts
      const contacts = await userRepository
        .createQueryBuilder("user")
        .where("user.id IN (:...ids)", { ids: Array.from(contactIds) })
        .getMany();
      
      // Log the activity
      try {
        await LogActivityController.logUserActivity(
          userId,
          "Retrieved chat contacts"
        );
      } catch (logError) {
        console.error("Error logging activity:", logError);
      }

      return res.status(200).json({ 
        contacts,
        count: contacts.length
      });
    } catch (error) {
      console.error("Get user chats error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }
};