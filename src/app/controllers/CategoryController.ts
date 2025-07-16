import { Request, Response } from "express";
import { AppDataSource } from "../../database/connection/dataSource";
import { Category } from "../../database/entities/Category";

export const CategoryController = {
  getAllCategories: async (req: Request, res: Response) => {
    try {
      const categoryRepository = AppDataSource.getRepository(Category);
      const categories = await categoryRepository.find();

      return res.status(200).json({ categories });
    } catch (error) {
      console.error("Get all categories error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  getCategoryById: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const categoryRepository = AppDataSource.getRepository(Category);
      const category = await categoryRepository.findOne({
        where: { id: Number(id) },
      });

      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      return res.status(200).json({ category });
    } catch (error) {
      console.error("Get category by ID error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  createCategory: async (req: Request, res: Response) => {
    try {
      const { name } = req.body;

      const categoryRepository = AppDataSource.getRepository(Category);
      const category = categoryRepository.create({ name });

      await categoryRepository.save(category);

      return res.status(201).json({
        message: "Category created successfully",
        category,
      });
    } catch (error) {
      console.error("Create category error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  updateCategory: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name } = req.body;

      const categoryRepository = AppDataSource.getRepository(Category);
      const category = await categoryRepository.findOne({
        where: { id: Number(id) },
      });

      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      category.name = name;
      await categoryRepository.save(category);

      return res.status(200).json({
        message: "Category updated successfully",
        category,
      });
    } catch (error) {
      console.error("Update category error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  deleteCategory: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const categoryRepository = AppDataSource.getRepository(Category);
      const category = await categoryRepository.findOne({
        where: { id: Number(id) },
      });

      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      await categoryRepository.remove(category);

      return res.status(200).json({ message: "Category deleted successfully" });
    } catch (error) {
      console.error("Delete category error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
};
