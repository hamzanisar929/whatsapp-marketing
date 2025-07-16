import { Request, Response } from "express";
import { AppDataSource } from "../../database/connection/dataSource";
import { User, UserRole, UserStatus } from "../../database/entities/User";
import * as bcrypt from "bcrypt";
import { parse } from "csv-parse";
import { stringify } from "csv-stringify";
import fs from "fs";
import { Tag } from "../../database/entities/Tag";

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: UserRole;
  };
}

interface UpdateUserBody {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  status?: UserStatus;
  role?: UserRole;
}

interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export const getAllUsers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const userRepository = AppDataSource.getRepository(User);
    const users = await userRepository.find();

    return res.status(200).json({ users });
  } catch (error) {
    console.error("Get all users error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getUserById = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: Number(id) } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Get user by ID error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateUser = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email, phone, status, role } =
      req.body as UpdateUserBody;

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: Number(id) } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update user fields
    if (first_name) user.first_name = first_name;
    if (last_name) user.last_name = last_name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (status) user.status = status;
    if (role) user.role = role;

    await userRepository.save(user);

    return res.status(200).json({
      message: "User updated successfully",
      user,
    });
  } catch (error) {
    console.error("Update user error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteUser = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: Number(id) } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await userRepository.remove(user);

    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const changePassword = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body as ChangePasswordBody;

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: Number(id) } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await userRepository.save(user);

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const setWhatsAppConfig = async (req: Request, res: Response) => {
  try {
    const { userId, whatsapp_api_token, whatsapp_business_phone } = req.body;
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });
    user.whatsapp_api_token = whatsapp_api_token;
    user.whatsapp_business_phone = whatsapp_business_phone;
    await userRepository.save(user);
    return res.status(200).json({ message: "WhatsApp config updated", user });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getWhatsAppConfig = async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: Number(userId) },
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json({
      whatsapp_api_token: user.whatsapp_api_token,
      whatsapp_business_phone: user.whatsapp_business_phone,
      facebook_business_verified: user.facebook_business_verified,
    });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyFacebookBusiness = async (req: Request, res: Response) => {
  try {
    const { userId, verified } = req.body;
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });
    user.facebook_business_verified = !!verified;
    await userRepository.save(user);
    return res
      .status(200)
      .json({ message: "Facebook business verification status updated", user });
  } catch (error) {
    return res.status(500).json({ message: "Internal server error" });
  }
};

// export const importContactsCSV = async (req: any, res: Response) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: "No file uploaded" });
//     }
//     const filePath = req.file.path;
//     const userRepository = AppDataSource.getRepository(User);
//     const results: any[] = [];
//     const parser = fs
//       .createReadStream(filePath)
//       .pipe(parse({ columns: true, trim: true }));
//     for await (const record of parser) {
//       // { first_name, last_name, email, phone, opt_in }
//       let user = await userRepository.findOne({
//         where: { phone: record.phone },
//       });
//       if (!user) {
//         // user = userRepository.create(record) as User;
//         if (user) await userRepository.save(user);
//       } else {
//         Object.assign(user, record);
//         await userRepository.save(user);
//       }
//       if (user) results.push(user);
//     }
//     fs.unlinkSync(filePath);
//     return res
//       .status(200)
//       .json({ message: "Contacts imported", data: results });
//   } catch (error) {
//     console.error("Import contacts error:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

export const importContactsCSV = async (req: any, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const filePath = req.file.path;
    const userRepository = AppDataSource.getRepository(User);
    const results: any[] = [];

    const parser = fs
      .createReadStream(filePath)
      .pipe(parse({ columns: true, trim: true }));

    for await (const csvRow of parser) {
      const nameParts = csvRow["Name"]?.split(" ") || ["", ""];
      const defaultPassword = await bcrypt.hash("changeme", 10);
      const userData = {
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(" "),
        email: csvRow["Email"],
        phone: csvRow["Phone Number"],
        address: csvRow["Address"],
        password: defaultPassword,
        opt_in: true, // or parse if exists
      };

      let user = await userRepository.findOne({
        where: { phone: userData.phone },
      });

      if (!user) {
        user = userRepository.create(userData);
      } else {
        Object.assign(user, userData);
      }

      await userRepository.save(user);
      results.push(user);
    }

    fs.unlinkSync(filePath);
    return res
      .status(200)
      .json({ message: "Contacts imported", data: results });
  } catch (error) {
    console.error("Import contacts error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const exportContactsCSV = async (req: Request, res: Response) => {
  try {
    const userRepository = AppDataSource.getRepository(User);
    const users = await userRepository.find();
    stringify(
      users,
      { header: true },
      (err: Error | undefined, output: string | undefined) => {
        if (err) {
          return res.status(500).json({ message: "CSV export error" });
        }
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          "attachment; filename=contacts.csv"
        );
        res.send(output);
      }
    );
  } catch (error) {
    console.error("Export contacts error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const updateContact = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, phone, opt_in, last_contacted } = req.body;
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: Number(id) } });
    if (!user) return res.status(404).json({ message: "Contact not found" });
    if (first_name) user.first_name = first_name;
    if (last_name) user.last_name = last_name;
    if (phone) user.phone = phone;
    if (opt_in !== undefined) user.opt_in = opt_in;
    if (last_contacted) user.last_contacted = new Date(last_contacted);
    await userRepository.save(user);
    return res.status(200).json({ message: "Contact updated", user });
  } catch (error) {
    console.error("Update contact error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const tagContact = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { tags } = req.body; // tags: string[]
    const tagRepository = AppDataSource.getRepository(Tag);
    // Remove old tags for this user
    await tagRepository.delete({
      taggable_type: "user",
      taggable_id: Number(id),
    });
    // Add new tags
    if (Array.isArray(tags)) {
      for (const name of tags) {
        const tag = tagRepository.create({
          name,
          taggable_type: "user",
          taggable_id: Number(id),
        });
        await tagRepository.save(tag);
      }
    }
    return res.status(200).json({ message: "Tags updated" });
  } catch (error) {
    console.error("Tag contact error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getContacts = async (req: Request, res: Response) => {
  try {
    const { tag, opt_in, search } = req.query;
    const userRepository = AppDataSource.getRepository(User);
    let query = userRepository.createQueryBuilder("user");
    if (opt_in !== undefined) {
      query = query.andWhere("user.opt_in = :opt_in", {
        opt_in: opt_in === "true",
      });
    }
    if (search) {
      query = query.andWhere(
        "user.first_name LIKE :search OR user.last_name LIKE :search OR user.phone LIKE :search",
        { search: `%${search}%` }
      );
    }
    let users = await query.getMany();
    if (tag && typeof tag === "string") {
      const tagRepository = AppDataSource.getRepository(Tag);
      const tagged = await tagRepository.find({
        where: { name: tag, taggable_type: "user" },
      });
      const taggedIds = tagged.map((t) => t.taggable_id);
      users = users.filter((u) => taggedIds.includes(u.id));
    }
    return res.status(200).json({ users });
  } catch (error) {
    console.error("Get contacts error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
