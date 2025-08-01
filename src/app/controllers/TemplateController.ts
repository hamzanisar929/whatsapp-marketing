import { Request, Response } from "express";
import { AppDataSource } from "../../database/connection/dataSource";
import { Template, TemplateStatus } from "../../database/entities/Template";
import { Variable } from "../../database/entities/TemplateVariable";
import { TemplateMedia } from "../../database/entities/TemplateMedia";
import { Category } from "../../database/entities/Category";
import { User, UserRole } from "../../database/entities/User";
import axios from "axios";
import { LogActivityController } from "./LogActivityController";

export const TemplateController = {
  getAllTemplates: async (req: Request, res: Response) => {
    try {
      const templateRepository = AppDataSource.getRepository(Template);
      const templates = await templateRepository.find({
        relations: ["category", "media", "variables"],
      });

      return res.status(200).json({ templates });
    } catch (error) {
      console.error("Get all templates error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  getTemplateById: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const templateRepository = AppDataSource.getRepository(Template);
      const template = await templateRepository.findOne({
        where: { id: Number(id) },
        relations: ["category", "media", "variables"],
      });

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      return res.status(200).json({ template });
    } catch (error) {
      console.error("Get template by ID error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  // Uncomment category_id
  createTemplate: async (req: Request, res: Response) => {
    try {
      const {
        name,
        language,
        category_id,
        message,
        variables,
        is_active,
        register_to_whatsapp,
      }: {
        name: string;
        language: string;
        category_id: number;
        message: string;
        variables?: {
          name: string;
          default_value?: string;
          is_required?: boolean;
        }[];
        is_active?: boolean;
        register_to_whatsapp?: boolean;
      } = req.body;

      const categoryRepository = AppDataSource.getRepository(Category);
      const category = await categoryRepository.findOne({
        where: { id: category_id },
      });

      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      const templateRepository = AppDataSource.getRepository(Template);
      const template = templateRepository.create({
        name,
        language,
        category_id,
        message,
        is_active: is_active || false,
        is_drafted: true,
        is_approved: false,
        status: TemplateStatus.PENDING,
      });

      await templateRepository.save(template);

      if (variables && variables.length > 0) {
        const variableRepository = AppDataSource.getRepository(Variable);

        for (const variable of variables) {
          const newVariable = variableRepository.create({
            template_id: template.id,
            name: variable.name,
            default_value: variable.default_value || undefined,
            is_required: variable.is_required || false,
          });

          await variableRepository.save(newVariable);
        }
      }

      const savedTemplate = await templateRepository.findOne({
        where: { id: template.id },
        relations: ["category", "variables"],
      });

      // Register template to WhatsApp Business API if requested
      let waRegistrationResponse = null;
      let waRegistrationError = null;

      if (register_to_whatsapp) {
        // Get admin user with WhatsApp API credentials
        const userRepository = AppDataSource.getRepository(User);
        const admin = await userRepository.findOne({
          where: { role: UserRole.ADMIN },
        });

        if (
          !admin ||
          !admin.whatsapp_api_token ||
          !admin.whatsapp_business_phone
        ) {
          return res.status(400).json({
            message:
              "Template created but not registered with WhatsApp: Admin WhatsApp API config missing",
            template: savedTemplate,
          });
        }

        // Prepare components based on variables
        const components = [];
        if (variables && variables.length > 0) {
          const params = variables.map((v) => ({
            type: "text",
            text: "{{" + v.name + "}}",
          }));

          components.push({
            type: "body",
            text: message,
            parameters: params,
          });
        } else {
          components.push({
            type: "body",
            text: message,
          });
        }

        try {
          // First, get the WhatsApp Business Account ID
          // const wbaResponse = await axios.get(
          //   `https://graph.facebook.com/v17.0/${admin.whatsapp_business_phone}`,
          //   {
          //     headers: {
          //       Authorization: `Bearer ${admin.whatsapp_api_token}`,
          //       "Content-Type": "application/json",
          //     },
          //   }
          // );

          const whatsappBusinessAccountId = 181499641717304;

          if (!whatsappBusinessAccountId) {
            return res.status(400).json({
              message:
                "Template created but not registered with WhatsApp: Could not retrieve WhatsApp Business Account ID",
              template: savedTemplate,
              error: "Missing whatsapp_business_account_id in API response",
            });
          }

          // Register template with WhatsApp Business API using the WhatsApp Business Account ID
          waRegistrationResponse = await axios.post(
            `https://graph.facebook.com/v17.0/${whatsappBusinessAccountId}/message_templates`,
            {
              name: name,
              category: category.name, // Use standard WhatsApp category instead of custom category name
              language: language,
              components: [
                {
                  type: "BODY",
                  text: message,
                  // parameters:
                  //   variables && variables.length > 0
                  //     ? variables.map((v, index) => ({
                  //         type: "text",
                  //         text: "{{" + (index + 1) + "}}",
                  //       }))
                  //     : [],
                },
              ],
            },
            {
              headers: {
                Authorization: `Bearer ${admin.whatsapp_api_token}`,
                "Content-Type": "application/json",
              },
            }
          );

          return res.status(201).json({
            message:
              "Template created and registered with WhatsApp successfully",
            template: savedTemplate,
            whatsapp_registration: waRegistrationResponse.data,
          });
        } catch (err: any) {
          waRegistrationError = err.response?.data || err.message;

          return res.status(201).json({
            message: "Template created but failed to register with WhatsApp",
            template: savedTemplate,
            whatsapp_error: waRegistrationError,
          });
        }
      }

      // Log user activity
      try {
        const authReq = req as any;
        if (authReq.user?.id) {
          await LogActivityController.logUserActivity(authReq.user.id, `Created template: ${savedTemplate?.name}`);
        }
      } catch (logError) {
        console.error("Failed to log user activity:", logError);
      }

      return res.status(201).json({
        message: "Template created successfully",
        template: savedTemplate,
      });
    } catch (error) {
      console.error("Create template error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  updateTemplate: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        name,
        language,
        category_id,
        message,
        is_active,
        is_drafted,
        status,
      }: {
        name?: string;
        language?: string;
        category_id?: number;
        message?: string;
        is_active?: boolean;
        is_drafted?: boolean;
        status?: TemplateStatus;
      } = req.body;

      const templateRepository = AppDataSource.getRepository(Template);
      const template = await templateRepository.findOne({
        where: { id: Number(id) },
      });

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      if (name) template.name = name;
      if (language) template.language = language;
      if (category_id) {
        const categoryRepository = AppDataSource.getRepository(Category);
        const category = await categoryRepository.findOne({
          where: { id: category_id },
        });

        if (!category) {
          return res.status(404).json({ message: "Category not found" });
        }

        template.category_id = category_id;
      }
      if (message) template.message = message;
      if (is_active !== undefined) template.is_active = is_active;
      if (is_drafted !== undefined) template.is_drafted = is_drafted;
      if (status) template.status = status;

      await templateRepository.save(template);

      const updatedTemplate = await templateRepository.findOne({
        where: { id: Number(id) },
        relations: ["category", "media", "variables"],
      });

      // Log user activity
      try {
        const authReq = req as any;
        if (authReq.user?.id) {
          await LogActivityController.logUserActivity(authReq.user.id, `Updated template: ${updatedTemplate?.name}`);
        }
      } catch (logError) {
        console.error("Failed to log user activity:", logError);
      }

      return res.status(200).json({
        message: "Template updated successfully",
        template: updatedTemplate,
      });
    } catch (error) {
      console.error("Update template error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  deleteTemplate: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const templateRepository = AppDataSource.getRepository(Template);
      const template = await templateRepository.findOne({
        where: { id: Number(id) },
      });

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Log user activity before deletion
      try {
        const authReq = req as any;
        if (authReq.user?.id) {
          await LogActivityController.logUserActivity(authReq.user.id, `Deleted template: ${template.name}`);
        }
      } catch (logError) {
        console.error("Failed to log user activity:", logError);
      }

      await templateRepository.remove(template);

      return res.status(200).json({ message: "Template deleted successfully" });
    } catch (error) {
      console.error("Delete template error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  addTemplateMedia: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { filename }: { filename: string } = req.body;

      const templateRepository = AppDataSource.getRepository(Template);
      const template = await templateRepository.findOne({
        where: { id: Number(id) },
      });

      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      const mediaRepository = AppDataSource.getRepository(TemplateMedia);
      const media = mediaRepository.create({
        template_id: template.id,
        filename,
      });

      await mediaRepository.save(media);

      return res.status(201).json({
        message: "Media added to template successfully",
        media,
      });
    } catch (error) {
      console.error("Add template media error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },

  syncTemplatesFromWhatsApp: async (req: Request, res: Response) => {
    try {
      // Get admin user (assume req.user.id is admin)
      const userId = (req as any).user?.id;
      console.log("userId in controller:", userId);
      if (!userId) {
        return res
          .status(401)
          .json({ message: "Unauthorized: user not found in request" });
      }
      const userRepository = AppDataSource.getRepository(User);
      const admin = await userRepository.findOne({ where: { id: userId } });
      if (
        !admin ||
        !admin.whatsapp_api_token ||
        !admin.whatsapp_business_phone
      ) {
        return res
          .status(400)
          .json({ message: "Admin WhatsApp API config missing" });
      }
      // Fetch templates from WhatsApp Business API
      let waResponse = null;
      try {
        // First, get the WhatsApp Business Account ID
        const wbaResponse = await axios.get(
          `https://graph.facebook.com/v17.0/${admin.whatsapp_business_phone}`,
          {
            headers: {
              Authorization: `Bearer ${admin.whatsapp_api_token}`,
              "Content-Type": "application/json",
            },
          }
        );

        const whatsappBusinessAccountId =
          wbaResponse.data?.whatsapp_business_account_id;

        if (!whatsappBusinessAccountId) {
          return res.status(400).json({
            message: "Could not retrieve WhatsApp Business Account ID",
            error: "Missing whatsapp_business_account_id in API response",
          });
        }

        // Now fetch templates using the WhatsApp Business Account ID
        waResponse = await axios.get(
          `https://graph.facebook.com/v17.0/${whatsappBusinessAccountId}/message_templates`,
          {
            headers: {
              Authorization: `Bearer ${admin.whatsapp_api_token}`,
              "Content-Type": "application/json",
            },
          }
        );
      } catch (err: any) {
        return res.status(500).json({
          message: "Failed to fetch templates from WhatsApp API",
          error: err.response?.data || err.message,
        });
      }
      // Return WhatsApp templates
      return res.status(200).json({
        message: "Templates synced successfully",
        templates: waResponse.data?.data || [],
      });
    } catch (error) {
      console.error("Sync templates error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
};
