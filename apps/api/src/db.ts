import type { PrismaClient } from "@prisma/client";

let client: PrismaClient | undefined;

export async function getPrisma(): Promise<PrismaClient> {
  if (!client) {
    const { PrismaClient: Client } = await import("@prisma/client");
    client = new Client();
  }
  return client;
}

export async function checkDatabase(): Promise<boolean> {
  try {
    const prisma = await getPrisma();
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
