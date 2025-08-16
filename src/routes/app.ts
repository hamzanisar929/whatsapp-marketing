import express from "express";
const router = express.Router();
import "reflect-metadata";
import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext); //
  },
});

const upload = multer({ storage: storage });

// Import controllers
import * as AuthController from "../app/controllers/AuthController";
import * as UserController from "../app/controllers/UserController";
import * as TemplateController from "../app/controllers/TemplateController";
import * as MessageController from "../app/controllers/MessageController";
import * as CategoryController from "../app/controllers/CategoryController";
import * as TagController from "../app/controllers/TagController";
import { LogActivityController } from "../app/controllers/LogActivityController";

// Import middleware
import {
  authenticate,
  authorize,
  isAdmin,
} from "../app/middleware/authMiddleware";
import { UserRole } from "../database/entities/User";

module.exports = (io: any, socketConnectedUser: Map<string, any>) => {
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
    "/test-socket",
    TemplateController.TemplateController.showSocketPage
  );

  router.get(
    "/templates",
    authenticate,
    TemplateController.TemplateController.getAllTemplates
  );

  router.get(
    "/templates/whatsapp",
    authenticate,
    authorize([UserRole.ADMIN, UserRole.USER]),
    TemplateController.TemplateController.getAllWhatsAppTemplates
  );

  // router.get(
  //   "/templates/sync",
  //   authenticate,
  //   // isAdmin,
  //   TemplateController.TemplateController.syncTemplatesFromWhatsApp
  // );

  router.get(
    "/templates/:id",
    authenticate,
    TemplateController.TemplateController.getTemplateById
  );
  router.post(
    "/templates",
    authenticate,
    authorize([UserRole.ADMIN, UserRole.USER]),
    upload.single("file"),
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

  // router.post(
  //   "/upload-image",
  //   authenticate,
  //   upload.single("file"),
  //   TemplateController.TemplateController.uploadImage
  // );

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
    "/messages/send-template-test",
    authenticate,
    MessageController.MessageController.sendTemplateMessageTest
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
  router.delete(
    "/tags/:id",
    authenticate,
    TagController.TagController.deleteTag
  );

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

  // WhatsApp Webhook routes (no authentication required for webhooks)
  router.get(
    "/webhook/whatsapp",
    MessageController.MessageController.verifyWebhook
  );

  router.post("/webhook/whatsapp", (req, res) => {
    MessageController.MessageController.receiveWebhook(
      req,
      res,
      io,
      socketConnectedUser
    );
  });

  router.post(
    "/whatsapp/media-message",
    authenticate,
    upload.single("file"),
    MessageController.MessageController.mediaMessage
  );

  // Log Activity routes
  router.get(
    "/log-activities",
    authenticate,
    LogActivityController.getAllLogActivities
  );
  router.get(
    "/log-activities/:id",
    authenticate,
    LogActivityController.getLogActivityById
  );
  router.get(
    "/log-activities/user/:userId",
    authenticate,
    LogActivityController.getLogActivitiesByUserId
  );
  router.post(
    "/log-activities",
    authenticate,
    LogActivityController.createLogActivity
  );
  router.put(
    "/log-activities/:id",
    authenticate,
    authorize([UserRole.ADMIN]),
    LogActivityController.updateLogActivity
  );
  router.delete(
    "/log-activities/:id",
    authenticate,
    authorize([UserRole.ADMIN]),
    LogActivityController.deleteLogActivity
  );

  return router;
};
