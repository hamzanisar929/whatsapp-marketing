import { Request, Response } from "express";
import { AppDataSource } from "../../database/connection/dataSource";
import { User, UserRole, UserStatus } from "../../database/entities/User";
import * as bcrypt from "bcrypt";
import * as jwt from "jsonwebtoken";
import { LogActivityController } from "./LogActivityController";

interface RegisterRequestBody {
  first_name: string;
  last_name?: string;
  email: string;
  phone: string;
  password: string;
  role?: UserRole;
}

interface LoginRequestBody {
  email: string;
  password: string;
}

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: UserRole;
  };
}

export const register = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { first_name, last_name, email, phone, password, role } =
      req.body as RegisterRequestBody;

    // Check if user already exists
    const userRepository = AppDataSource.getRepository(User);
    const existingUser = await userRepository.findOne({ where: { email } });

    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = userRepository.create({
      first_name,
      last_name,
      email,
      phone,
      role: role || UserRole.USER,
      status: UserStatus.ACTIVE,
      password: hashedPassword,
    });

    await userRepository.save(user);

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "24h" }
    );

    // Log user activity
    try {
      await LogActivityController.logUserActivity(user.id, `User registered: ${user.email}`);
    } catch (logError) {
      console.error("Failed to log user activity:", logError);
    }

    return res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const login = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email, password } = req.body as LoginRequestBody;

    // Find user
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { email } });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET as string,
      { expiresIn: "24h" }
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const getProfile = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<Response> => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        photo: user.photo,
        role: user.role,
        status: user.status,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
