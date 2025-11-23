import { PrismaClient } from "@prisma/client";

declare global {
  // biar tidak error implicit any
  var prisma: PrismaClient | undefined;
}

export {};