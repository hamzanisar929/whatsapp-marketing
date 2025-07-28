import { Request, Response } from "express";
import { AppDataSource } from "../../database/connection/dataSource";
import { Tag } from "../../database/entities/Tag";
import { LogActivityController } from "./LogActivityController";

export const TagController = {
  getAllTags: async (req: Request, res: Response) => {
    try {
      const tagRepository = AppDataSource.getRepository(Tag);
      const tags = await tagRepository.find();

      return res.status(200).json({ tags });
    } catch (error) {
      console.error("Get all tags error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  getTagsByType: async (req: Request, res: Response) => {
    try {
      const { type } = req.params;

      const tagRepository = AppDataSource.getRepository(Tag);
      const tags = await tagRepository.find({
        where: { taggable_type: type },
      });

      return res.status(200).json({ tags });
    } catch (error) {
      console.error("Get tags by type error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  createTag: async (req: Request, res: Response) => {
    try {
      const { name, taggable_type, taggable_id } = req.body;

      const tagRepository = AppDataSource.getRepository(Tag);
      const tag = tagRepository.create({
        name,
        taggable_type,
        taggable_id,
      });

      await tagRepository.save(tag);

      // Log user activity
      try {
        const authReq = req as any;
        if (authReq.user?.id) {
          await LogActivityController.logUserActivity(authReq.user.id, `Created tag: ${tag.name} for ${tag.taggable_type}`);
        }
      } catch (logError) {
        console.error("Failed to log user activity:", logError);
      }

      return res.status(201).json({
        message: "Tag created successfully",
        tag,
      });
    } catch (error) {
      console.error("Create tag error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  deleteTag: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const tagRepository = AppDataSource.getRepository(Tag);
      const tag = await tagRepository.findOne({ where: { id: Number(id) } });

      if (!tag) {
        return res.status(404).json({ message: "Tag not found" });
      }

      // Log user activity before deletion
      try {
        const authReq = req as any;
        if (authReq.user?.id) {
          await LogActivityController.logUserActivity(authReq.user.id, `Deleted tag: ${tag.name} from ${tag.taggable_type}`);
        }
      } catch (logError) {
        console.error("Failed to log user activity:", logError);
      }

      await tagRepository.remove(tag);

      return res.status(200).json({ message: "Tag deleted successfully" });
    } catch (error) {
      console.error("Delete tag error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
};
