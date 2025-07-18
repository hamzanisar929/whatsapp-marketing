import express from "express";
const router = express.Router();
import "reflect-metadata";
import multer from "multer";
const upload = multer({ dest: "uploads/" });

// Import controllers
import * as AuthController from "../app/controllers/AuthController";
import * as UserController from "../app/controllers/UserController";
import * as TemplateController from "../app/controllers/TemplateController";
import * as MessageController from "../app/controllers/MessageController";
import * as CategoryController from "../app/controllers/CategoryController";
import * as TagController from "../app/controllers/TagController";

// Import middleware
import {
  authenticate,
  authorize,
  isAdmin,
} from "../app/middleware/authMiddleware";
import { UserRole } from "../database/entities/User";

// Auth routes
router.post("/auth/register", AuthController.register);
router.post("/auth/login", AuthController.login);
router.get("/auth/profile", authenticate, AuthController.getProfile);

// User routes
router.get(
  "/users",
  authenticate,
  authorize([UserRole.ADMIN]),
  UserController.getAllUsers
);
router.get("/users/:id", authenticate, UserController.getUserById);
router.put("/users/:id", authenticate, UserController.updateUser);
router.delete("/users/:id", authenticate, isAdmin, UserController.deleteUser);
router.post(
  "/users/:id/change-password",
  authenticate,
  UserController.changePassword
);

// Template routes
router.get(
  "/templates",
  authenticate,
  TemplateController.TemplateController.getAllTemplates
);
router.get(
  "/templates/:id",
  authenticate,
  TemplateController.TemplateController.getTemplateById
);
router.post(
  "/templates",
  authenticate,
  authorize([UserRole.ADMIN, UserRole.USER]),
  TemplateController.TemplateController.createTemplate
);
router.put(
  "/templates/:id",
  authenticate,
  authorize([UserRole.ADMIN, UserRole.USER]),
  TemplateController.TemplateController.updateTemplate
);
router.delete(
  "/templates/:id",
  authenticate,
  authorize([UserRole.ADMIN]),
  TemplateController.TemplateController.deleteTemplate
);
router.post(
  "/templates/:id/media",
  authenticate,
  TemplateController.TemplateController.addTemplateMedia
);
router.get(
  "/templates/sync",
  authenticate,
  isAdmin,
  TemplateController.TemplateController.syncTemplatesFromWhatsApp
);

// Message routes
router.post(
  "/messages/send",
  authenticate,
  MessageController.MessageController.sendMessage
);
router.post(
  "/messages/send-template",
  authenticate,
  MessageController.MessageController.sendTemplateMessage
);
router.post(
  "/messages/send-bulk",
  authenticate,
  MessageController.MessageController.sendBulkMessages
);
router.get(
  "/messages/history/:receiver_id",
  authenticate,
  MessageController.MessageController.getMessageHistory
);
// // Bulk messaging CSV upload route
router.post(
  "/messages/bulk-upload-csv",
  authenticate,
  upload.single("file"),
  MessageController.MessageController.uploadBulkCSV
);
// // Schedule message route
router.post(
  "/messages/schedule",
  authenticate,
  MessageController.MessageController.scheduleMessage
);

// Category routes
router.get(
  "/categories",
  authenticate,
  CategoryController.CategoryController.getAllCategories
);
router.get(
  "/categories/:id",
  authenticate,
  CategoryController.CategoryController.getCategoryById
);
router.post(
  "/categories",
  authenticate,
  isAdmin,
  CategoryController.CategoryController.createCategory
);
router.put(
  "/categories/:id",
  authenticate,
  isAdmin,
  CategoryController.CategoryController.updateCategory
);
router.delete(
  "/categories/:id",
  authenticate,
  isAdmin,
  CategoryController.CategoryController.deleteCategory
);

// Tag routes
router.get("/tags", authenticate, TagController.TagController.getAllTags);
router.get(
  "/tags/:type",
  authenticate,
  TagController.TagController.getTagsByType
);
router.post("/tags", authenticate, TagController.TagController.createTag);
router.delete("/tags/:id", authenticate, TagController.TagController.deleteTag);

// WhatsApp Business API config routes (admin only)
router.post(
  "/whatsapp/config",
  authenticate,
  isAdmin,
  UserController.setWhatsAppConfig
);
router.get(
  "/whatsapp/config",
  authenticate,
  isAdmin,
  UserController.getWhatsAppConfig
);
router.post(
  "/whatsapp/verify-facebook",
  authenticate,
  isAdmin,
  UserController.verifyFacebookBusiness
);

// Contact management routes
router.post(
  "/contacts/import-csv",
  authenticate,
  upload.single("file"),
  UserController.importContactsCSV
);
router.get(
  "/contacts/export-csv",
  authenticate,
  UserController.exportContactsCSV
);
router.put("/contacts/:id", authenticate, UserController.updateContact);
router.post("/contacts/:id/tags", authenticate, UserController.tagContact);
router.get("/contacts", authenticate, UserController.getContacts);

export default router;
