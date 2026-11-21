import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { sessions, users } from "@/server/db/schema";
import { isDemoRole, roleHome, SESSION_COOKIE, type DemoRole } from "./demo-auth";
import { hasPermission, type Permission } from "./permissions";

export const DEMO_RESTAURANT_ID = "demo-restaurant";
export const DB_SESSION_COOKIE = "tablors_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export type DemoSession = {
  role: DemoRole;
  restaurantId: string;
  userId?: string;
  email?: string;
  name?: string;
};

export async function getDbSession(): Promise<DemoSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(DB_SESSION_COOKIE)?.value;
  if (!token) return null;

  const now = new Date();
  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      restaurantId: users.restaurantId,
      role: users.role,
      email: users.email,
      name: users.name,
      active: users.active,
      lockedUntil: users.lockedUntil,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, now)))
    .limit(1);

  if (!row || !row.active) return null;
  if (row.lockedUntil && row.lockedUntil > now) return null;
  if (!isDemoRole(row.role)) return null;

  return {
    role: row.role,
    restaurantId: row.restaurantId,
    userId: row.userId,
    email: row.email,
    name: row.name,
  };
}

export async function createDbSession(userId: string, restaurantId: string): Promise<string> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id,
    userId,
    restaurantId,
    expiresAt,
  });
  const cookieStore = await cookies();
  cookieStore.set(DB_SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return id;
}

export async function destroyDbSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(DB_SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.id, token)).catch(() => {});
  }
  cookieStore.delete(DB_SESSION_COOKIE);
  cookieStore.delete(SESSION_COOKIE);
}

export async function getDemoRole(): Promise<DemoRole | null> {
  const dbSess = await getDbSession();
  if (dbSess) return dbSess.role;
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  return isDemoRole(value) ? value : null;
}

export async function getDemoSession(): Promise<DemoSession | null> {
  const dbSess = await getDbSession();
  if (dbSess) return dbSess;
  const role = await getDemoRole();
  return role ? { role, restaurantId: DEMO_RESTAURANT_ID } : null;
}

export async function requirePermission(permission: Permission): Promise<DemoSession> {
  const session = await getDemoSession();
  if (!session) redirect("/login");
  if (!hasPermission(session.role, permission)) redirect(roleHome[session.role]);
  return session;
}