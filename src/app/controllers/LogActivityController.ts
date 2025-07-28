import { Request, Response } from "express";
import { AppDataSource } from "../../database/connection/dataSource";
import { LogActivity } from "../../database/entities/LogActivity";
import { User, UserRole } from "../../database/entities/User";

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: UserRole;
  };
}

export const LogActivityController = {
  // Get all log activities
  getAllLogActivities: async (req: Request, res: Response) => {
    try {
      const logActivityRepository = AppDataSource.getRepository(LogActivity);
      const logActivities = await logActivityRepository.find({
        relations: ["user"],
        order: { created_at: "DESC" },
      });

      return res.status(200).json({ logActivities });
    } catch (error) {
      console.error("Get all log activities error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // Get log activity by ID
  getLogActivityById: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      console.log(id);

      const logActivityRepository = AppDataSource.getRepository(LogActivity);
      const logActivity = await logActivityRepository.findOne({
        where: { id: Number(id) },
        relations: ["user"],
      });

      console.log(logActivity);

      if (!logActivity) {
        return res.status(404).json({ message: "Log activity not found" });
      }

      return res.status(200).json({ logActivity });
    } catch (error) {
      console.error("Get log activity by ID error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // Get log activities by user ID
  getLogActivitiesByUserId: async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      const logActivityRepository = AppDataSource.getRepository(LogActivity);
      const logActivities = await logActivityRepository.find({
        where: { user_id: Number(userId) },
        relations: ["user"],
        order: { created_at: "DESC" },
      });

      return res.status(200).json({ logActivities });
    } catch (error) {
      console.error("Get log activities by user ID error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // Create a new log activity
  createLogActivity: async (req: Request, res: Response) => {
    try {
      const { user_id, action } = req.body;

      if (!user_id || !action) {
        return res
          .status(400)
          .json({ message: "User ID and action are required" });
      }

      // Verify user exists
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: Number(user_id) },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const logActivityRepository = AppDataSource.getRepository(LogActivity);
      const logActivity = logActivityRepository.create({
        user_id: Number(user_id),
        action,
      });

      await logActivityRepository.save(logActivity);

      // Fetch the created log activity with user relation
      const createdLogActivity = await logActivityRepository.findOne({
        where: { id: logActivity.id },
        relations: ["user"],
      });

      return res.status(201).json({
        message: "Log activity created successfully",
        logActivity: createdLogActivity,
      });
    } catch (error) {
      console.error("Create log activity error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // Update a log activity
  updateLogActivity: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { action } = req.body;

      const logActivityRepository = AppDataSource.getRepository(LogActivity);
      const logActivity = await logActivityRepository.findOne({
        where: { id: Number(id) },
      });

      if (!logActivity) {
        return res.status(404).json({ message: "Log activity not found" });
      }

      if (action) {
        logActivity.action = action;
      }

      await logActivityRepository.save(logActivity);

      // Fetch the updated log activity with user relation
      const updatedLogActivity = await logActivityRepository.findOne({
        where: { id: logActivity.id },
        relations: ["user"],
      });

      return res.status(200).json({
        message: "Log activity updated successfully",
        logActivity: updatedLogActivity,
      });
    } catch (error) {
      console.error("Update log activity error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // Delete a log activity
  deleteLogActivity: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const logActivityRepository = AppDataSource.getRepository(LogActivity);
      const logActivity = await logActivityRepository.findOne({
        where: { id: Number(id) },
      });

      if (!logActivity) {
        return res.status(404).json({ message: "Log activity not found" });
      }

      await logActivityRepository.remove(logActivity);

      return res
        .status(200)
        .json({ message: "Log activity deleted successfully" });
    } catch (error) {
      console.error("Delete log activity error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // Helper function to log user activity (can be called from other controllers)
  logUserActivity: async (userId: number, action: string) => {
    try {
      const logActivityRepository = AppDataSource.getRepository(LogActivity);
      const logActivity = logActivityRepository.create({
        user_id: userId,
        action,
      });

      await logActivityRepository.save(logActivity);
      return logActivity;
    } catch (error) {
      console.error("Log user activity error:", error);
      throw error;
    }
  },
};
