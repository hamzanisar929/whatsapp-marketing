// types/express.d.ts

import { UserRole } from "../../src/database/entities/User"; // adjust path if needed

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        email: string;
        role: UserRole;
      };
    }
  }
}
