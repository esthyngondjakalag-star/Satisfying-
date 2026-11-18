import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { eq, and } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users, memberships, organizations } from '../db/schema.ts';

export interface AuthRequest extends Request {
  authUser?: DecodedIdToken;
  dbUser?: typeof users.$inferSelect;
  orgId?: number;
  orgRole?: string;
}

const TOKEN_SECRET = crypto
  .createHash('sha256')
  .update(process.env.SESSION_SECRET || process.env.SQL_PASSWORD || 'clientpulse360-session-key')
  .digest();

export function signSessionToken(payload: { uid: string; email: string; fullName: string }): string {
  const data = {
    ...payload,
    exp: Date.now() + 7 * 24 * 3600 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
  return `cp360.${encoded}.${sig}`;
}

export function verifySessionToken(
  token: string
): { uid: string; email: string; fullName: string; exp: number } | null {
  if (!token.startsWith('cp360.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const FOUNDER_EMAIL = (process.env.FOUNDER_EMAIL || 'esthyngondjakalag@gmail.com')
  .trim()
  .toLowerCase();

export async function getOrCreateUser(uid: string, email: string, fullName?: string, avatarUrl?: string) {
  try {
    const normalizedEmail = email.trim().toLowerCase();
    const isFounder = normalizedEmail === FOUNDER_EMAIL;
    const displayName = fullName?.trim() || normalizedEmail.split('@')[0] || 'Utilisateur';

    const existingByUid = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (existingByUid.length > 0) {
      const updated = await db
        .update(users)
        .set({
          email: normalizedEmail,
          fullName: existingByUid[0].fullName || displayName,
          avatarUrl: avatarUrl || existingByUid[0].avatarUrl,
          isSuperAdmin: existingByUid[0].isSuperAdmin || isFounder,
        })
        .where(eq(users.id, existingByUid[0].id))
        .returning();
      return updated[0];
    }

    const existingByEmail = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existingByEmail.length > 0) {
      const updated = await db
        .update(users)
        .set({
          fullName: existingByEmail[0].fullName || displayName,
          avatarUrl: avatarUrl || existingByEmail[0].avatarUrl,
          isSuperAdmin: existingByEmail[0].isSuperAdmin || isFounder,
        })
        .where(eq(users.id, existingByEmail[0].id))
        .returning();
      return updated[0];
    }

    const result = await db
      .insert(users)
      .values({
        uid,
        email: normalizedEmail,
        fullName: displayName,
        avatarUrl: avatarUrl || '/src/assets/images/avatar_director_claire_1795000474272.jpg',
        isSuperAdmin: isFounder,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email: normalizedEmail },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database error in getOrCreateUser:', error);
    throw new Error('Impossible de synchroniser le profil utilisateur.', { cause: error });
  }
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise : jeton manquant.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    let dbUser: typeof users.$inferSelect | undefined;

    const sessionPayload = verifySessionToken(token);
    if (sessionPayload) {
      const [found] = await db.select().from(users).where(eq(users.uid, sessionPayload.uid)).limit(1);
      if (!found) {
        return res.status(401).json({ error: 'Compte utilisateur introuvable.' });
      }
      dbUser = found;
    } else {
      const decodedToken = await adminAuth.verifyIdToken(token);
      req.authUser = decodedToken;
      dbUser = await getOrCreateUser(
        decodedToken.uid,
        decodedToken.email || 'utilisateur@clientpulse360.fr',
        decodedToken.name,
        decodedToken.picture
      );
    }

    req.dbUser = dbUser;

    // Resolve tenant organization from header x-org-id if provided
    const requestedOrgIdRaw = req.headers['x-org-id'];
    if (requestedOrgIdRaw) {
      const requestedOrgId = Number(requestedOrgIdRaw);
      if (!Number.isNaN(requestedOrgId)) {
        const mem = await db
          .select()
          .from(memberships)
          .where(and(eq(memberships.orgId, requestedOrgId), eq(memberships.userId, dbUser.id)))
          .limit(1);

        if (mem.length > 0) {
          req.orgId = requestedOrgId;
          req.orgRole = mem[0].role;
        } else if (dbUser.isSuperAdmin) {
          const orgExists = await db
            .select()
            .from(organizations)
            .where(eq(organizations.id, requestedOrgId))
            .limit(1);
          if (orgExists.length > 0) {
            req.orgId = requestedOrgId;
            req.orgRole = 'SUPER_ADMIN';
          }
        }
      }
    }

    if (!req.orgId) {
      const firstMem = await db
        .select()
        .from(memberships)
        .where(eq(memberships.userId, dbUser.id))
        .limit(1);
      if (firstMem.length > 0) {
        req.orgId = firstMem[0].orgId;
        req.orgRole = firstMem[0].role;
      }
    }

    next();
  } catch (error) {
    console.error('Error verifying authentication token:', error);
    return res.status(401).json({ error: 'Session expirée ou jeton invalide.' });
  }
};

export function requireRole(allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.orgRole || '';
    if (req.dbUser?.isSuperAdmin || allowedRoles.includes(role)) {
      return next();
    }
    return res.status(403).json({
      error: 'Permissions insuffisantes pour effectuer cette action.',
    });
  };
}
