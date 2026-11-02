import { Prisma, type PrismaClient } from "@prisma/client";
import { getPrisma } from "../db.js";
import {
  AccountDisabledError,
  AccountExistsError,
  GoogleIdentityConflictError,
  type AuthAccount,
  type AuthPrincipal,
  type AuthStore,
  type GoogleIdentity,
  type PasswordAccount,
} from "./types.js";

const memberRole = { name: "member", description: "Standard platform account" };
const adminRole = { name: "admin", description: "Platform administrator" };

function isPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export function createAuthStore(client?: PrismaClient): AuthStore {
  const db = async () => client ?? getPrisma();

  return {
    async createPasswordAccount(email, passwordHash, displayName): Promise<AuthAccount> {
      const prisma = await db();
      try {
        return await prisma.$transaction(async (tx) => {
          const role = await tx.role.upsert({
            where: { name: memberRole.name },
            update: {},
            create: memberRole,
          });
          const user = await tx.user.create({
            data: {
              email,
              passwordHash,
              status: "ACTIVE",
              ...(displayName ? { profile: { create: { displayName } } } : {}),
              roles: { create: { roleId: role.id } },
            },
            select: { id: true, email: true, status: true },
          });
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              action: "auth.register",
              entityType: "user",
              entityId: user.id,
              afterData: { method: "password" },
            },
          });
          return user;
        });
      } catch (error) {
        if (isPrismaCode(error, "P2002")) throw new AccountExistsError("An account with this email already exists.");
        throw error;
      }
    },

    async findPasswordAccount(email): Promise<PasswordAccount | null> {
      const prisma = await db();
      return prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true, status: true },
      });
    },

    async recordFailedPasswordLogin(): Promise<void> {
      const prisma = await db();
      await prisma.auditLog.create({
        data: {
          action: "auth.login_failed",
          entityType: "auth",
          afterData: { method: "password" },
        },
      });
    },

    async findOrCreateGoogleAccount(identity: GoogleIdentity, bootstrapAdminEmail): Promise<AuthAccount> {
      const prisma = await db();
      return prisma.$transaction(
        async (tx) => {
          const bySubject = await tx.user.findUnique({ where: { googleSubject: identity.subject } });
          const byEmail = await tx.user.findUnique({ where: { email: identity.email } });
          if (bySubject && bySubject.email !== identity.email) {
            throw new GoogleIdentityConflictError("Google identity is already linked to another account.");
          }
          if (byEmail?.googleSubject && byEmail.googleSubject !== identity.subject) {
            throw new GoogleIdentityConflictError("This email is already linked to another Google identity.");
          }

          const existingAdmin = await tx.userRole.findFirst({ where: { role: { name: adminRole.name } } });
          const shouldBootstrapAdmin = identity.email === bootstrapAdminEmail && !existingAdmin;
          const role = shouldBootstrapAdmin ? adminRole : memberRole;
          const databaseRole = await tx.role.upsert({
            where: { name: role.name },
            update: {},
            create: role,
          });

          const existingUser = byEmail ?? bySubject;
          const user = existingUser
            ? await tx.user.update({
                where: { id: existingUser.id },
                data: {
                  googleSubject: identity.subject,
                  emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
                },
                select: { id: true, email: true, status: true },
              })
            : await tx.user.create({
                data: {
                  email: identity.email,
                  passwordHash: null,
                  googleSubject: identity.subject,
                  status: "ACTIVE",
                  emailVerifiedAt: new Date(),
                  profile: { create: { displayName: identity.name || identity.email.split("@")[0] } },
                  roles: { create: { roleId: databaseRole.id } },
                },
                select: { id: true, email: true, status: true },
              });

          if (user.status !== "ACTIVE") throw new AccountDisabledError("This account is not active.");

          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: databaseRole.id } },
            update: {},
            create: { userId: user.id, roleId: databaseRole.id },
          });

          if (shouldBootstrapAdmin) {
            const allPermission = await tx.permission.upsert({
              where: { key: "*" },
              update: {},
              create: { key: "*", description: "All platform permissions" },
            });
            await tx.rolePermission.upsert({
              where: { roleId_permissionId: { roleId: databaseRole.id, permissionId: allPermission.id } },
              update: {},
              create: { roleId: databaseRole.id, permissionId: allPermission.id },
            });
            await tx.auditLog.create({
              data: {
                actorId: user.id,
                action: "auth.bootstrap_admin",
                entityType: "role",
                entityId: databaseRole.id,
                afterData: { email: user.email },
              },
            });
          }

          if (!existingUser) {
            await tx.auditLog.create({
              data: {
                actorId: user.id,
                action: "auth.register",
                entityType: "user",
                entityId: user.id,
                afterData: { method: "google" },
              },
            });
          }
          return user;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    },

    async createSession(userId, tokenHash, expiresAt, method): Promise<void> {
      const prisma = await db();
      await prisma.$transaction(async (tx) => {
        const session = await tx.session.create({ data: { userId, tokenHash, expiresAt } });
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: "auth.login",
            entityType: "session",
            entityId: session.id,
            afterData: { method },
          },
        });
      });
    },

    async findSession(tokenHash, now): Promise<AuthPrincipal | null> {
      const prisma = await db();
      const session = await prisma.session.findFirst({
        where: {
          tokenHash,
          revokedAt: null,
          expiresAt: { gt: now },
          user: { is: { status: "ACTIVE" } },
        },
        include: {
          user: {
            include: {
              roles: {
                include: {
                  role: { include: { permissions: { include: { permission: true } } } },
                },
              },
            },
          },
        },
      });
      if (!session) return null;

      const roles = session.user.roles.map(({ role }) => ({
        name: role.name,
        permissions: role.permissions.map(({ permission }) => permission.key),
      }));
      return {
        id: session.user.id,
        email: session.user.email,
        roles,
        permissions: [...new Set(roles.flatMap(({ permissions }) => permissions))],
      };
    },

    async revokeSession(tokenHash, now): Promise<void> {
      const prisma = await db();
      await prisma.$transaction(async (tx) => {
        const session = await tx.session.findUnique({
          where: { tokenHash },
          select: { id: true, userId: true, revokedAt: true },
        });
        if (!session || session.revokedAt) return;

        await tx.session.update({ where: { id: session.id }, data: { revokedAt: now } });
        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            action: "auth.logout",
            entityType: "session",
            entityId: session.id,
          },
        });
      });
    },
  };
}
