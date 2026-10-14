import { PrismaClient } from "@prisma/client";
import { env } from "../config";

export const prisma = new PrismaClient({
  // URL ya resuelta (incluye los alias de las integraciones de Vercel)
  ...(env.DATABASE_URL ? { datasourceUrl: env.DATABASE_URL } : {}),
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
