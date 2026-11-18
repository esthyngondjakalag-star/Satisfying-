import crypto from 'crypto';
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  agencies,
  categories,
  kbArticles,
  memberships,
  organizations,
  slaPolicies,
  surveyTemplates,
  teams,
  users,
} from '../db/schema.ts';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_REQUEST_TYPES,
  buildDefaultSurveyTemplates,
  ensureDemoDataForUser,
} from '../db/seed.ts';
import { AuthRequest, FOUNDER_EMAIL, requireAuth, signSessionToken } from '../middleware/auth.ts';

const authRouter = Router();

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

// Verify persisted B2B session token
authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const u = req.dbUser!;
  res.json({
    user: {
      id: u.id,
      uid: u.uid,
      email: u.email,
      fullName: u.fullName,
      isSuperAdmin: u.isSuperAdmin,
    },
  });
});

// Check whether the platform founder has activated a password yet
authRouter.get('/founder-status', async (_req, res) => {
  try {
    const [founder] = await db.select().from(users).where(eq(users.email, FOUNDER_EMAIL)).limit(1);
    res.json({
      founderEmail: FOUNDER_EMAIL,
      isActivated: Boolean(founder?.passwordHash),
    });
  } catch {
    res.json({ founderEmail: FOUNDER_EMAIL, isActivated: false });
  }
});

// One-time Founder / Super Admin password activation
authRouter.post('/founder-activate', async (req, res) => {
  try {
    const { email, fullName, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (normalizedEmail !== FOUNDER_EMAIL) {
      return res.status(403).json({
        error: `Seul l’email fondateur autorisé (${FOUNDER_EMAIL}) peut activer le compte Super Admin.`,
      });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing && existing.passwordHash) {
      return res.status(409).json({
        error: 'Le compte Fondateur est déjà activé. Connectez-vous avec votre mot de passe.',
      });
    }

    const passwordHash = hashPassword(String(password));
    const displayName = String(fullName || existing?.fullName || 'Fondateur ClientPulse 360').trim();

    const [founderUser] = existing
      ? await db
          .update(users)
          .set({
            fullName: displayName,
            passwordHash,
            isSuperAdmin: true,
          })
          .where(eq(users.id, existing.id))
          .returning()
      : await db
          .insert(users)
          .values({
            uid: `founder-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
            email: normalizedEmail,
            fullName: displayName,
            passwordHash,
            isSuperAdmin: true,
          })
          .returning();

    await ensureDemoDataForUser(founderUser);

    const token = signSessionToken({
      uid: founderUser.uid,
      email: founderUser.email,
      fullName: founderUser.fullName,
    });

    res.status(201).json({
      token,
      user: {
        id: founderUser.id,
        uid: founderUser.uid,
        email: founderUser.email,
        fullName: founderUser.fullName,
        isSuperAdmin: true,
      },
    });
  } catch (error) {
    console.error('Founder activate error:', error);
    res.status(500).json({ error: 'Impossible d’activer le compte Fondateur.' });
  }
});

// Invited collaborator first-time password activation
authRouter.post('/activate-invite', async (req, res) => {
  try {
    const { email, fullName, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !password || String(password).length < 6) {
      return res.status(400).json({ error: 'Email et mot de passe (6+ caractères) requis.' });
    }

    const [invitedUser] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (!invitedUser) {
      return res.status(404).json({
        error: 'Aucune invitation trouvée pour cet email. Demandez à votre administrateur de vous inviter.',
      });
    }
    if (invitedUser.passwordHash) {
      return res.status(409).json({
        error: 'Ce compte possède déjà un mot de passe. Utilisez la connexion standard.',
      });
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        passwordHash: hashPassword(String(password)),
        ...(fullName ? { fullName: String(fullName).trim() } : {}),
      })
      .where(eq(users.id, invitedUser.id))
      .returning();

    await db
      .update(memberships)
      .set({ status: 'ACTIVE' })
      .where(eq(memberships.userId, updatedUser.id));

    const token = signSessionToken({
      uid: updatedUser.uid,
      email: updatedUser.email,
      fullName: updatedUser.fullName,
    });

    res.json({
      token,
      user: {
        id: updatedUser.id,
        uid: updatedUser.uid,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        isSuperAdmin: updatedUser.isSuperAdmin,
      },
    });
  } catch (error) {
    console.error('Activate invite error:', error);
    res.status(500).json({ error: 'Impossible d’activer votre invitation.' });
  }
});

// Create a brand new isolated B2B organization + Admin user
authRouter.post('/register-org', async (req, res) => {
  try {
    const { organizationName, industry, plan, fullName, email, password } = req.body;
    if (!organizationName || !fullName || !email || !password) {
      return res.status(400).json({ error: 'Tous les champs obligatoires doivent être remplis.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const isFounder = normalizedEmail === FOUNDER_EMAIL;
    const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing.length > 0 && existing[0].passwordHash) {
      return res.status(409).json({ error: 'Un compte existe déjà avec cet email. Connectez-vous.' });
    }

    const chosenPlan = ['STARTER', 'BUSINESS', 'ENTERPRISE'].includes(plan) ? plan : 'BUSINESS';
    const planSpecs: Record<string, { mrr: number; maxAgents: number }> = {
      STARTER: { mrr: 7900, maxAgents: 5 },
      BUSINESS: { mrr: 24900, maxAgents: 25 },
      ENTERPRISE: { mrr: 49900, maxAgents: 100 },
    };
    const spec = planSpecs[chosenPlan];

    const passwordHash = hashPassword(String(password));
    const uid = `saas-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const [createdUser] =
      existing.length > 0
        ? await db
            .update(users)
            .set({
              fullName: String(fullName).trim(),
              passwordHash,
              isSuperAdmin: existing[0].isSuperAdmin || isFounder,
            })
            .where(eq(users.id, existing[0].id))
            .returning()
        : await db
            .insert(users)
            .values({
              uid,
              email: normalizedEmail,
              fullName: String(fullName).trim(),
              passwordHash,
              isSuperAdmin: isFounder,
            })
            .returning();

    const slug = `${String(organizationName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-4)}`;

    const [createdOrg] = await db
      .insert(organizations)
      .values({
        name: String(organizationName).trim(),
        slug,
        industry: industry || 'Services B2B',
        plan: chosenPlan,
        status: 'TRIAL',
        billingCycle: 'ANNUAL',
        mrrCents: spec.mrr,
        maxAgents: spec.maxAgents,
        billingEmail: normalizedEmail,
        portalTitle: `Portail Support — ${String(organizationName).trim()}`,
        trialEndsAt: new Date(Date.now() + 14 * 86400000),
      })
      .returning();

    const [ag] = await db
      .insert(agencies)
      .values({
        orgId: createdOrg.id,
        name: 'Siège Principal',
        code: 'HQ-01',
        city: 'Paris',
        country: 'France',
        managerName: createdUser.fullName,
      })
      .returning();

    const [tm] = await db
      .insert(teams)
      .values({
        orgId: createdOrg.id,
        agencyId: ag.id,
        name: 'Service Client',
        description: 'Équipe principale de traitement des demandes.',
        leadName: createdUser.fullName,
      })
      .returning();

    await db.insert(memberships).values({
      orgId: createdOrg.id,
      userId: createdUser.id,
      agencyId: ag.id,
      teamId: tm.id,
      role: 'ORG_ADMIN',
      status: 'ACTIVE',
      maxLoad: 25,
      jobTitle: 'Administrateur Entreprise',
    });

    await db.insert(categories).values(
      DEFAULT_CATEGORIES.map((c) => ({
        orgId: createdOrg.id,
        name: c.name,
        subcategories: c.subcategories,
        requestTypes: DEFAULT_REQUEST_TYPES,
        isDefault: true,
      }))
    );

    await db.insert(surveyTemplates).values(buildDefaultSurveyTemplates(createdOrg.id));

    await db.insert(slaPolicies).values([
      {
        orgId: createdOrg.id,
        name: 'SLA Critique',
        priority: 'CRITIQUE',
        firstResponseMinutes: 15,
        resolutionMinutes: 120,
        businessHoursOnly: false,
      },
      {
        orgId: createdOrg.id,
        name: 'SLA Normale',
        priority: 'NORMALE',
        firstResponseMinutes: 240,
        resolutionMinutes: 1440,
        businessHoursOnly: true,
      },
    ]);

    await db.insert(kbArticles).values({
      orgId: createdOrg.id,
      title: 'Guide de démarrage — Traitement des réclamations',
      category: 'Service',
      articleType: 'GUIDE',
      content: 'Bienvenue dans votre espace ClientPulse 360. Publiez ici vos procédures et FAQ clients.',
      visibility: 'PUBLIC',
      isPublished: true,
      authorName: createdUser.fullName,
    });

    const token = signSessionToken({
      uid: createdUser.uid,
      email: createdUser.email,
      fullName: createdUser.fullName,
    });

    res.status(201).json({
      token,
      user: {
        id: createdUser.id,
        uid: createdUser.uid,
        email: createdUser.email,
        fullName: createdUser.fullName,
        isSuperAdmin: createdUser.isSuperAdmin,
      },
    });
  } catch (error) {
    console.error('Register org error:', error);
    res.status(500).json({ error: 'Impossible de créer votre organisation.' });
  }
});

// Email + Password login
authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (!user || !user.passwordHash || !verifyPassword(String(password), user.passwordHash)) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    const token = signSessionToken({
      uid: user.uid,
      email: user.email,
      fullName: user.fullName,
    });

    res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        fullName: user.fullName,
        isSuperAdmin: user.isSuperAdmin,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erreur lors de la connexion.' });
  }
});

// Clearly identified Demo Sandbox session by RBAC Role
authRouter.post('/demo-session', async (req, res) => {
  try {
    const role = String(req.body.role || 'ORG_ADMIN');
    const validRoles = ['SUPER_ADMIN', 'ORG_ADMIN', 'CS_MANAGER', 'AGENT', 'ANALYST'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Rôle de démonstration invalide.' });
    }

    const personaMap: Record<
      string,
      { uid: string; email: string; fullName: string; avatar: string; isSuper: boolean; title: string }
    > = {
      SUPER_ADMIN: {
        uid: 'demo-persona-super-admin',
        email: 'superadmin.demo@clientpulse360.fr',
        fullName: 'Direction SaaS [DÉMO]',
        avatar: '/src/assets/images/avatar_director_claire_1795000474272.jpg',
        isSuper: true,
        title: 'Super Administrateur SaaS',
      },
      ORG_ADMIN: {
        uid: 'demo-persona-org-admin',
        email: 'admin.demo@horizon-demo.fr',
        fullName: 'Claire Moreau [DÉMO]',
        avatar: '/src/assets/images/avatar_director_claire_1795000474272.jpg',
        isSuper: false,
        title: 'Administrateur Entreprise',
      },
      CS_MANAGER: {
        uid: 'demo-persona-cs-manager',
        email: 'manager.demo@horizon-demo.fr',
        fullName: 'Thomas Bernard [DÉMO]',
        avatar: '/src/assets/images/avatar_lead_thomas_1795000474970.jpg',
        isSuper: false,
        title: 'Responsable Service Client',
      },
      AGENT: {
        uid: 'demo-persona-agent',
        email: 'agent.demo@horizon-demo.fr',
        fullName: 'Marc Lefèvre [DÉMO]',
        avatar: '/src/assets/images/avatar_lead_thomas_1795000474970.jpg',
        isSuper: false,
        title: 'Agent Support SAV',
      },
      ANALYST: {
        uid: 'demo-persona-analyst',
        email: 'analyste.demo@horizon-demo.fr',
        fullName: 'Nadia Khelifi [DÉMO]',
        avatar: '/src/assets/images/avatar_analyst_nadia_1795000474646.jpg',
        isSuper: false,
        title: 'Analyste Qualité (Lecture seule)',
      },
    };

    const p = personaMap[role];
    let [user] = await db.select().from(users).where(eq(users.uid, p.uid)).limit(1);
    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          uid: p.uid,
          email: p.email,
          fullName: p.fullName,
          avatarUrl: p.avatar,
          isSuperAdmin: p.isSuper,
        })
        .returning();
    } else {
      [user] = await db
        .update(users)
        .set({ isSuperAdmin: p.isSuper, fullName: p.fullName })
        .where(eq(users.id, user.id))
        .returning();
    }

    const demoOrgId = await ensureDemoDataForUser(user);

    // Ensure the membership role on the primary demo org matches the selected demo persona
    await db
      .update(memberships)
      .set({ role, jobTitle: p.title })
      .where(eq(memberships.userId, user.id));

    const token = signSessionToken({
      uid: user.uid,
      email: user.email,
      fullName: user.fullName,
    });

    res.json({
      token,
      demoOrgId,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        fullName: user.fullName,
        isSuperAdmin: user.isSuperAdmin,
      },
    });
  } catch (error) {
    console.error('Demo session error:', error);
    res.status(500).json({ error: 'Impossible de démarrer la session de démonstration.' });
  }
});

export default authRouter;
