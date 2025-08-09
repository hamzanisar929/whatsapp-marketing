import { Request, Response } from "express";
import { AppDataSource } from "../../database/connection/dataSource";
import { Template, TemplateStatus } from "../../database/entities/Template";
import { Variable } from "../../database/entities/TemplateVariable";
import { TemplateMedia } from "../../database/entities/TemplateMedia";
import { Category } from "../../database/entities/Category";
import { User, UserRole } from "../../database/entities/User";
import axios from "axios";
import { LogActivityController } from "./LogActivityController";

const whatsapp_api_url = "https://graph.facebook.com/v19.0";
const WHATSAPP_BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const whatsapp_api_token = process.env.WHATSAPP_ACCESS_TOKEN;

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
  // createTemplate: async (req: Request, res: Response) => {
  //   try {
  //     const {
  //       name,
  //       language,
  //       category_id,
  //       message,
  //       variables,
  //       is_active,
  //       register_to_whatsapp,
  //     }: {
  //       name: string;
  //       language: string;
  //       category_id: number;
  //       message: string;
  //       variables?: {
  //         name: string;
  //         default_value?: string;
  //         is_required?: boolean;
  //       }[];
  //       is_active?: boolean;
  //       register_to_whatsapp?: boolean;
  //     } = req.body;

  //     const categoryRepository = AppDataSource.getRepository(Category);
  //     const category = await categoryRepository.findOne({
  //       where: { id: category_id },
  //     });

  //     if (!category) {
  //       return res.status(404).json({ message: "Category not found" });
  //     }

  //     const templateRepository = AppDataSource.getRepository(Template);
  //     const template = templateRepository.create({
  //       name,
  //       language,
  //       category_id,
  //       message,
  //       is_active: is_active || false,
  //       is_drafted: true,
  //       is_approved: false,
  //       status: TemplateStatus.PENDING,
  //     });

  //     await templateRepository.save(template);

  //     if (variables && variables.length > 0) {
  //       const variableRepository = AppDataSource.getRepository(Variable);

  //       for (const variable of variables) {
  //         const newVariable = variableRepository.create({
  //           template_id: template.id,
  //           name: variable.name,
  //           default_value: variable.default_value || undefined,
  //           is_required: variable.is_required || false,
  //         });

  //         await variableRepository.save(newVariable);
  //       }
  //     }

  //     const savedTemplate = await templateRepository.findOne({
  //       where: { id: template.id },
  //       relations: ["category", "variables"],
  //     });

  //     // Register template to WhatsApp Business API if requested
  //     let waRegistrationResponse = null;
  //     let waRegistrationError = null;

  //     if (register_to_whatsapp) {
  //       // Get admin user with WhatsApp API credentials
  //       const userRepository = AppDataSource.getRepository(User);
  //       const admin = await userRepository.findOne({
  //         where: { role: UserRole.ADMIN },
  //       });

  //       if (
  //         !admin ||
  //         !admin.whatsapp_api_token ||
  //         !admin.whatsapp_business_phone
  //       ) {
  //         return res.status(400).json({
  //           message:
  //             "Template created but not registered with WhatsApp: Admin WhatsApp API config missing",
  //           template: savedTemplate,
  //         });
  //       }

  //       // Prepare components based on variables
  //       const components = [];
  //       if (variables && variables.length > 0) {
  //         const params = variables.map((v) => ({
  //           type: "text",
  //           text: "{{" + v.name + "}}",
  //         }));

  //         components.push({
  //           type: "body",
  //           text: message,
  //           parameters: params,
  //         });
  //       } else {
  //         components.push({
  //           type: "body",
  //           text: message,
  //         });
  //       }

  //       try {
  //         // First, get the WhatsApp Business Account ID
  //         // const wbaResponse = await axios.get(
  //         //   `https://graph.facebook.com/v17.0/${admin.whatsapp_business_phone}`,
  //         //   {
  //         //     headers: {
  //         //       Authorization: `Bearer ${admin.whatsapp_api_token}`,
  //         //       "Content-Type": "application/json",
  //         //     },
  //         //   }
  //         // );

  //         const whatsappBusinessAccountId = 181499641717304;

  //         if (!whatsappBusinessAccountId) {
  //           return res.status(400).json({
  //             message:
  //               "Template created but not registered with WhatsApp: Could not retrieve WhatsApp Business Account ID",
  //             template: savedTemplate,
  //             error: "Missing whatsapp_business_account_id in API response",
  //           });
  //         }

  //         // Register template with WhatsApp Business API using the WhatsApp Business Account ID
  //         waRegistrationResponse = await axios.post(
  //           `https://graph.facebook.com/v17.0/${whatsappBusinessAccountId}/message_templates`,
  //           {
  //             name: name,
  //             category: category.name, // Use standard WhatsApp category instead of custom category name
  //             language: language,
  //             components: [
  //               {
  //                 type: "BODY",
  //                 text: message,
  //                 // parameters:
  //                 //   variables && variables.length > 0
  //                 //     ? variables.map((v, index) => ({
  //                 //         type: "text",
  //                 //         text: "{{" + (index + 1) + "}}",
  //                 //       }))
  //                 //     : [],
  //               },
  //             ],
  //           },
  //           {
  //             headers: {
  //               Authorization: `Bearer ${admin.whatsapp_api_token}`,
  //               "Content-Type": "application/json",
  //             },
  //           }
  //         );

  //         return res.status(201).json({
  //           message:
  //             "Template created and registered with WhatsApp successfully",
  //           template: savedTemplate,
  //           whatsapp_registration: waRegistrationResponse.data,
  //         });
  //       } catch (err: any) {
  //         waRegistrationError = err.response?.data || err.message;

  //         return res.status(201).json({
  //           message: "Template created but failed to register with WhatsApp",
  //           template: savedTemplate,
  //           whatsapp_error: waRegistrationError,
  //         });
  //       }
  //     }

  //     // Log user activity
  //     try {
  //       const authReq = req as any;
  //       if (authReq.user?.id) {
  //         await LogActivityController.logUserActivity(authReq.user.id, `Created template: ${savedTemplate?.name}`);
  //       }
  //     } catch (logError) {
  //       console.error("Failed to log user activity:", logError);
  //     }

  //     return res.status(201).json({
  //       message: "Template created successfully",
  //       template: savedTemplate,
  //     });
  //   } catch (error) {
  //     console.error("Create template error:", error);
  //     return res.status(500).json({ message: "Internal server error" });
  //   }
  // },

  // New createTemplate
  // createTemplate: async (req: Request, res: Response) => {
  //   try {
  //     const {
  //       name,
  //       language,
  //       category_id,
  //       message,
  //       variables,
  //       is_active,
  //       register_to_whatsapp,
  //     }: {
  //       name: string;
  //       language: string;
  //       category_id: number;
  //       message: string;
  //       variables?: {
  //         name: string;
  //         default_value?: string;
  //         is_required?: boolean;
  //       }[];
  //       is_active?: boolean;
  //       register_to_whatsapp?: boolean;
  //     } = req.body;

  //     const categoryRepository = AppDataSource.getRepository(Category);
  //     const category = await categoryRepository.findOne({
  //       where: { id: category_id },
  //     });

  //     if (!category) {
  //       return res.status(404).json({ message: "Category not found" });
  //     }

  //     const templateRepository = AppDataSource.getRepository(Template);
  //     const template = templateRepository.create({
  //       name,
  //       language,
  //       category_id,
  //       message,
  //       is_active: is_active || false,
  //       is_drafted: true,
  //       is_approved: false,
  //       status: TemplateStatus.PENDING,
  //     });

  //     await templateRepository.save(template);

  //     if (variables && variables.length > 0) {
  //       const variableRepository = AppDataSource.getRepository(Variable);
  //       for (const variable of variables) {
  //         const newVariable = variableRepository.create({
  //           template_id: template.id,
  //           name: variable.name,
  //           default_value: variable.default_value || undefined,
  //           is_required: variable.is_required || false,
  //         });

  //         await variableRepository.save(newVariable);
  //       }
  //     }

  //     const savedTemplate = await templateRepository.findOne({
  //       where: { id: template.id },
  //       relations: ["category", "variables"],
  //     });

  //     // Register template to WhatsApp Business API if requested
  //     let waRegistrationResponse = null;
  //     let waRegistrationError = null;

  //     if (register_to_whatsapp) {
  //       const userRepository = AppDataSource.getRepository(User);
  //       const admin = await userRepository.findOne({
  //         where: { role: UserRole.ADMIN },
  //       });

  //       if (
  //         !admin ||
  //         !admin.whatsapp_api_token ||
  //         !admin.whatsapp_business_phone
  //       ) {
  //         return res.status(400).json({
  //           message:
  //             "Template created but not registered with WhatsApp: Admin WhatsApp API config missing",
  //           template: savedTemplate,
  //         });
  //       }

  //       const whatsappBusinessAccountId = 181499641717304; // hardcoded for now

  //       if (!whatsappBusinessAccountId) {
  //         return res.status(400).json({
  //           message:
  //             "Template created but not registered with WhatsApp: Could not retrieve WhatsApp Business Account ID",
  //           template: savedTemplate,
  //           error: "Missing whatsapp_business_account_id in API response",
  //         });
  //       }

  //       // Prepare the correct WhatsApp template registration payload
  //       const formattedMessage = message; // Should include numbered placeholders like {{1}}, {{2}}, etc.

  //       try {
  //         waRegistrationResponse = await axios.post(
  //           `https://graph.facebook.com/v17.0/${whatsappBusinessAccountId}/message_templates`,
  //           {
  //             name: name,
  //             category: category.name.toUpperCase(), // MARKETING, TRANSACTIONAL, etc.
  //             language: language,
  //             components: [
  //               {
  //                 type: "BODY",
  //                 text: formattedMessage,
  //               },
  //             ],
  //           },
  //           {
  //             headers: {
  //               Authorization: `Bearer ${admin.whatsapp_api_token}`,
  //               "Content-Type": "application/json",
  //             },
  //           }
  //         );

  //         return res.status(201).json({
  //           message:
  //             "Template created and registered with WhatsApp successfully",
  //           template: savedTemplate,
  //           whatsapp_registration: waRegistrationResponse.data,
  //         });
  //       } catch (err: any) {
  //         waRegistrationError = err.response?.data || err.message;

  //         return res.status(201).json({
  //           message: "Template created but failed to register with WhatsApp",
  //           template: savedTemplate,
  //           whatsapp_error: waRegistrationError,
  //         });
  //       }
  //     }

  //     // Log user activity
  //     try {
  //       const authReq = req as any;
  //       if (authReq.user?.id) {
  //         await LogActivityController.logUserActivity(
  //           authReq.user.id,
  //           `Created template: ${savedTemplate?.name}`
  //         );
  //       }
  //     } catch (logError) {
  //       console.error("Failed to log user activity:", logError);
  //     }

  //     return res.status(201).json({
  //       message: "Template created successfully",
  //       template: savedTemplate,
  //     });
  //   } catch (error) {
  //     console.error("Create template error:", error);
  //     return res.status(500).json({ message: "Internal server error" });
  //   }
  // },

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

      if (!name || !language || !category_id || !message) {
        return res.status(400).json({
          message:
            "Missing required fields: name, language, category_id, or message.",
        });
      }

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

      const savedTemplate = await templateRepository.findOne({
        where: { id: template.id },
        relations: ["category", "variables"],
      });

      let waRegistrationResponse = null;

      if (register_to_whatsapp) {
        const userRepository = AppDataSource.getRepository(User);
        const admin = await userRepository.findOne({
          where: { role: UserRole.ADMIN },
        });

        if (!admin?.whatsapp_api_token || !admin.whatsapp_business_phone) {
          return res.status(400).json({
            message:
              "Template created but not registered with WhatsApp: Admin WhatsApp API config missing",
            template: savedTemplate,
          });
        }

        const whatsappBusinessAccountId =
          process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
        if (!whatsappBusinessAccountId) {
          return res
            .status(500)
            .json({ message: "WhatsApp Business Account ID not configured." });
        }

        const components: any[] = [
          {
            type: "BODY",
            text: message,
            example: {
              body_text: [
                variables?.map((v) => v.default_value || "Sample") || [],
              ],
            },
          },
        ];

        try {
          const waRes = await axios.post(
            `https://graph.facebook.com/v19.0/${whatsappBusinessAccountId}/message_templates`,
            {
              name,
              category: category.name.toUpperCase(),
              language,
              parameter_format: "POSITIONAL",
              components,
            },
            {
              headers: {
                Authorization: `Bearer ${admin.whatsapp_api_token}`,
                "Content-Type": "application/json",
              },
            }
          );

          waRegistrationResponse = waRes.data;

          return res.status(201).json({
            message: "Template created and registered with WhatsApp",
            template: savedTemplate,
            whatsapp_registration: waRegistrationResponse,
          });
        } catch (error: any) {
          return res.status(201).json({
            message: "Template created but failed to register with WhatsApp",
            template: savedTemplate,
            whatsapp_error: error.response?.data || error.message,
          });
        }
      }

      try {
        const authReq = req as any;
        if (authReq.user?.id) {
          await LogActivityController.logUserActivity(
            authReq.user.id,
            `Created template: ${savedTemplate?.name}`
          );
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
          await LogActivityController.logUserActivity(
            authReq.user.id,
            `Updated template: ${updatedTemplate?.name}`
          );
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
          await LogActivityController.logUserActivity(
            authReq.user.id,
            `Deleted template: ${template.name}`
          );
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

  getAllWhatsAppTemplates: async (req: Request, res: Response) => {
    try {
      const WABA_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID; // Your WhatsApp Business Account ID
      const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

      if (!WABA_ID || !ACCESS_TOKEN) {
        return res.status(500).json({
          success: false,
          message:
            "WABA_ID or WHATSAPP_ACCESS_TOKEN is not set in environment variables",
        });
      }

      const response = await axios.get(
        `https://graph.facebook.com/v20.0/${WABA_ID}/message_templates`,
        {
          headers: {
            Authorization: `Bearer ${ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
        }
      );

      const templatesFromAPI = response.data.data;
      const templateRepo = AppDataSource.getRepository(Template);
      const categoryRepo = AppDataSource.getRepository(Category);
      const variableRepo = AppDataSource.getRepository(Variable);

      for (const tpl of templatesFromAPI) {
        // Ensure category exists
        let category = await categoryRepo.findOne({
          where: { name: tpl.category },
        });
        if (!category) {
          category = categoryRepo.create({
            name: tpl.category,
          });
          await categoryRepo.save(category);
        }

        // Extract BODY text
        const bodyComponent = tpl.components.find(
          (c: any) => c.type === "BODY"
        );
        const messageText = bodyComponent?.text || "";

        // Map status
        let mappedStatus: TemplateStatus = TemplateStatus.PENDING;
        if (tpl.status === "APPROVED") mappedStatus = TemplateStatus.APPROVED;
        else if (tpl.status === "REJECTED")
          mappedStatus = TemplateStatus.REJECTED;

        // Check if template exists
        let templateEntity = await templateRepo.findOne({
          where: { name: tpl.name, language: tpl.language },
        });

        if (templateEntity) {
          // Update template
          templateEntity.language = tpl.language;
          templateEntity.category_id = category.id;
          templateEntity.message = messageText;
          templateEntity.is_active = tpl.status === "APPROVED";
          templateEntity.is_approved = tpl.status === "APPROVED";
          templateEntity.status = mappedStatus;
          await templateRepo.save(templateEntity);
        } else {
          // Create new template
          templateEntity = templateRepo.create({
            name: tpl.name,
            language: tpl.language,
            category_id: category.id,
            message: messageText,
            is_active: tpl.status === "APPROVED",
            is_approved: tpl.status === "APPROVED",
            is_drafted: false,
            status: mappedStatus,
          });
          await templateRepo.save(templateEntity);
        }

        // 2️⃣ Extract variables from template components
        const variablesFound: {
          name: string;
          default_value?: string;
          is_required: boolean;
        }[] = [];

        tpl.components.forEach((comp: any) => {
          if (comp.text) {
            // Match {{number}} placeholders
            const matches = comp.text.match(/{{\d+}}/g);
            if (Array.isArray(matches)) {
              matches.forEach((match) => {
                variablesFound.push({
                  name: match, // store placeholder name (e.g., {{1}})
                  default_value: undefined, // can be set if provided by API
                  is_required: true, // placeholders are usually required
                });
              });
            }
          }
        });

        // 3️⃣ Sync variables with DB
        if (variablesFound.length > 0) {
          for (const variable of variablesFound) {
            let existingVariable = await variableRepo.findOne({
              where: {
                template_id: templateEntity.id,
                name: variable.name,
              },
            });

            if (existingVariable) {
              // Update variable
              existingVariable.default_value =
                variable.default_value ?? undefined;
              existingVariable.is_required = variable.is_required;
              await variableRepo.save(existingVariable);
            } else {
              // Create new variable
              const newVariable = variableRepo.create({
                template_id: templateEntity.id,
                name: variable.name,
                default_value: variable.default_value ?? undefined,
                is_required: variable.is_required,
              });
              await variableRepo.save(newVariable);
            }
          }
        }
      }

      res.status(200).json({
        success: true,
        data: response.data,
      });
    } catch (error: any) {
      console.error(
        "Error fetching WhatsApp templates:",
        error.response?.data || error.message
      );
      res.status(500).json({
        success: false,
        message: "Failed to fetch WhatsApp templates",
        error: error.response?.data || error.message,
      });
    }
  },

  // syncTemplatesFromWhatsApp: async (req: Request, res: Response) => {
  //   try {
  //     // Get admin user (assume req.user.id is admin)
  //     const userId = (req as any).user?.id;
  //     console.log("userId in controller:", userId);
  //     if (!userId) {
  //       return res
  //         .status(401)
  //         .json({ message: "Unauthorized: user not found in request" });
  //     }
  //     const userRepository = AppDataSource.getRepository(User);
  //     const admin = await userRepository.findOne({ where: { id: userId } });
  //     if (
  //       !admin ||
  //       !admin.whatsapp_api_token ||
  //       !admin.whatsapp_business_phone
  //     ) {
  //       return res
  //         .status(400)
  //         .json({ message: "Admin WhatsApp API config missing" });
  //     }
  //     // Fetch templates from WhatsApp Business API
  //     let waResponse = null;
  //     try {
  //       // First, get the WhatsApp Business Account ID
  //       const wbaResponse = await axios.get(
  //         `https://graph.facebook.com/v17.0/${admin.whatsapp_business_phone}`,
  //         {
  //           headers: {
  //             Authorization: `Bearer ${admin.whatsapp_api_token}`,
  //             "Content-Type": "application/json",
  //           },
  //         }
  //       );

  //       const whatsappBusinessAccountId =
  //         wbaResponse.data?.whatsapp_business_account_id;

  //       if (!whatsappBusinessAccountId) {
  //         return res.status(400).json({
  //           message: "Could not retrieve WhatsApp Business Account ID",
  //           error: "Missing whatsapp_business_account_id in API response",
  //         });
  //       }

  //       // Now fetch templates using the WhatsApp Business Account ID
  //       waResponse = await axios.get(
  //         `https://graph.facebook.com/v17.0/${whatsappBusinessAccountId}/message_templates`,
  //         {
  //           headers: {
  //             Authorization: `Bearer ${admin.whatsapp_api_token}`,
  //             "Content-Type": "application/json",
  //           },
  //         }
  //       );
  //     } catch (err: any) {
  //       return res.status(500).json({
  //         message: "Failed to fetch templates from WhatsApp API",
  //         error: err.response?.data || err.message,
  //       });
  //     }
  //     // Return WhatsApp templates
  //     return res.status(200).json({
  //       message: "Templates synced successfully",
  //       templates: waResponse.data?.data || [],
  //     });
  //   } catch (error) {
  //     console.error("Sync templates error:", error);
  //     return res.status(500).json({ message: "Internal server error" });
  //   }
  // },

  // New sync template from whatsapp

  syncTemplatesFromWhatsApp: async (req: Request, res: Response) => {
    try {
      console.log("Syncing...");
      const userId = (req as any).user?.id;
      console.log("User ID from request:", userId);

      if (!userId) {
        return res
          .status(401)
          .json({ message: "Unauthorized: user not found in request" });
      }

      const userRepository = AppDataSource.getRepository(User);
      console.log("Fetching user from database...");
      const admin = await userRepository.findOne({ where: { id: userId } });

      if (!admin) {
        return res.status(404).json({ message: "Admin user not found" });
      }

      const { whatsapp_api_token, whatsapp_business_phone } = admin;

      if (!whatsapp_api_token || !whatsapp_business_phone) {
        console.log("Missing WhatsApp config:", {
          whatsapp_api_token,
          whatsapp_business_phone,
        });
        return res
          .status(400)
          .json({ message: "Admin WhatsApp API config missing" });
      }

      let whatsappBusinessAccountId: string;

      try {
        console.log(
          "Fetching WABA ID from phone number ID:",
          whatsapp_business_phone
        );
        const wbaResponse = await axios.get(
          `https://graph.facebook.com/v17.0/${whatsapp_business_phone}?fields=whatsapp_business_account`,
          {
            headers: {
              Authorization: `Bearer ${whatsapp_api_token}`,
              "Content-Type": "application/json",
            },
          }
        );

        whatsappBusinessAccountId =
          wbaResponse.data?.whatsapp_business_account?.id;

        if (!whatsappBusinessAccountId) {
          return res.status(400).json({
            message: "Could not retrieve WhatsApp Business Account ID",
            error: "Missing whatsapp_business_account.id in API response",
          });
        }
        console.log("Retrieved WABA ID:", whatsappBusinessAccountId);
      } catch (err: any) {
        console.error(
          "Error fetching WABA ID:",
          err.response?.data || err.message
        );
        return res.status(500).json({
          message: "Failed to fetch WhatsApp Business Account ID",
          error: err.response?.data || err.message,
        });
      }

      // Fetch templates
      let waResponse;
      try {
        console.log("Fetching message templates...");
        waResponse = await axios.get(
          `https://graph.facebook.com/v17.0/${whatsappBusinessAccountId}/message_templates`,
          {
            headers: {
              Authorization: `Bearer ${whatsapp_api_token}`,
              "Content-Type": "application/json",
            },
          }
        );

        console.log("Templates fetched:", waResponse.data?.data?.length || 0);
      } catch (err: any) {
        console.error(
          "Error fetching templates:",
          err.response?.data || err.message
        );
        return res.status(500).json({
          message: "Failed to fetch templates from WhatsApp API",
          error: err.response?.data || err.message,
        });
      }

      return res.status(200).json({
        message: "Templates synced successfully",
        templates: waResponse.data?.data || [],
      });
    } catch (error: any) {
      console.error("Sync templates error:", error);
      return res.status(500).json({
        message: "Internal server error",
        error: error instanceof Error ? error.message : error,
      });
    }
  },
};
