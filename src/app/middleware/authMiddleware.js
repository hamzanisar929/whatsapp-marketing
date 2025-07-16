const jwt = require("jsonwebtoken");
const { AppDataSource } = require("../../database/connection/dataSource");
const { User, UserRole } = require("../../database/entities/User");

module.exports = {
  authenticate: async (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const token = authHeader.split(" ")[1];

      if (!token) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if user exists
      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({ where: { id: decoded.id } });

      if (!user) {
        return res.status(401).json({ message: "Invalid token" });
      }

      // Attach user to request
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      next();
    } catch (error) {
      console.error("Authentication error:", error);
      return res.status(401).json({ message: "Invalid token" });
    }
  },

  authorize: (roles = []) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userRole = req.user.role;

      // If no roles are specified, allow all authenticated users
      if (roles.length === 0) {
        return next();
      }

      // Check if user has required role
      if (!roles.includes(userRole)) {
        return res
          .status(403)
          .json({ message: "Forbidden: Insufficient permissions" });
      }

      next();
    };
  },

  isAdmin: (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (req.user.role !== UserRole.ADMIN) {
      return res
        .status(403)
        .json({ message: "Forbidden: Admin access required" });
    }

    next();
  },
};
