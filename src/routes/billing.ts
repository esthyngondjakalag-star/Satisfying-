import crypto from 'crypto';
import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { activityLogs, invoices, notifications, organizations } from '../db/schema.ts';
import { AuthRequest, requireAuth, requireRole } from '../middleware/auth.ts';

const billingRouter = Router();
billingRouter.use(requireAuth);

export const PLAN_CATALOG: Record<
  'STARTER' | 'BUSINESS' | 'ENTERPRISE',
  { maxAgents: number; mrrMonthly: number; mrrAnnual: number; label: string }
> = {
  STARTER: { maxAgents: 5, mrrMonthly: 7900, mrrAnnual: 6500, label: 'Starter' },
  BUSINESS: { maxAgents: 25, mrrMonthly: 24900, mrrAnnual: 19900, label: 'Business' },
  ENTERPRISE: { maxAgents: 100, mrrMonthly: 59900, mrrAnnual: 49900, label: 'Enterprise' },
};

function computePricing(plan: 'STARTER' | 'BUSINESS' | 'ENTERPRISE', billingCycle: 'MONTHLY' | 'ANNUAL') {
  const spec = PLAN_CATALOG[plan];
  const unitMonthlyCents = billingCycle === 'ANNUAL' ? spec.mrrAnnual : spec.mrrMonthly;
  const amountCents = billingCycle === 'ANNUAL' ? spec.mrrAnnual * 12 : spec.mrrMonthly;
  const taxCents = Math.round(amountCents * 0.2);
  const totalCents = amountCents + taxCents;
  const periodDays = billingCycle === 'ANNUAL' ? 365 : 30;
  return { spec, unitMonthlyCents, amountCents, taxCents, totalCents, periodDays };
}

function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `FAC-${year}-${suffix}`;
}

billingRouter.get('/status', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const [[org], orgInvoices] = await Promise.all([
      db.select().from(organizations).where(eq(organizations.id, oid)).limit(1),
      db.select().from(invoices).where(eq(invoices.orgId, oid)).orderBy(desc(invoices.createdAt)),
    ]);
    res.json({
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
      organization: org,
      invoices: orgInvoices,
    });
  } catch (error) {
    console.error('Billing status error:', error);
    res.status(500).json({ error: 'Impossible de charger la facturation.' });
  }
});

billingRouter.post(
  '/checkout',
  requireRole(['ORG_ADMIN', 'SUPER_ADMIN']),
  async (req: AuthRequest, res) => {
    try {
      const oid = req.orgId!;
      const user = req.dbUser!;
      const {
        plan,
        billingCycle,
        billingEmail,
        paymentMethod,
        cardLast4,
        cardBrand,
        ibanLast4,
      } = req.body;

      if (!['STARTER', 'BUSINESS', 'ENTERPRISE'].includes(plan)) {
        return res.status(400).json({ error: 'Plan tarifaire invalide.' });
      }
      const cycle: 'MONTHLY' | 'ANNUAL' = billingCycle === 'MONTHLY' ? 'MONTHLY' : 'ANNUAL';
      const typedPlan = plan as 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
      const pricing = computePricing(typedPlan, cycle);

      const [org] = await db.select().from(organizations).where(eq(organizations.id, oid)).limit(1);
      if (!org) return res.status(404).json({ error: 'Organisation introuvable.' });

      const effectiveBillingEmail = String(billingEmail || org.billingEmail || user.email).trim();
      if (!effectiveBillingEmail) {
        return res.status(400).json({ error: 'Email de facturation requis.' });
      }

      const invoiceNumber = generateInvoiceNumber();
      const now = new Date();
      const periodEnd = new Date(now.getTime() + pricing.periodDays * 86400000);
      const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();

      // Real Stripe Checkout when STRIPE_SECRET_KEY is configured and Stripe method is selected
      if (stripeKey && paymentMethod === 'STRIPE') {
        const origin =
          process.env.APP_URL ||
          `${req.protocol}://${req.get('host')}`;
        const cleanOrigin = origin.replace(/\/+$/, '');

        const form = new URLSearchParams();
        form.append('mode', 'payment');
        form.append('customer_email', effectiveBillingEmail);
        form.append('success_url', `${cleanOrigin}/?stripe_session_id={CHECKOUT_SESSION_ID}`);
        form.append('cancel_url', `${cleanOrigin}/?billing=cancelled`);
        form.append('line_items[0][quantity]', '1');
        form.append('line_items[0][price_data][currency]', 'eur');
        form.append('line_items[0][price_data][unit_amount]', String(pricing.totalCents));
        form.append(
          'line_items[0][price_data][product_data][name]',
          `ClientPulse 360 — Plan ${pricing.spec.label} (${cycle === 'ANNUAL' ? 'Annuel' : 'Mensuel'}, TTC)`
        );
        form.append('metadata[orgId]', String(oid));
        form.append('metadata[plan]', typedPlan);
        form.append('metadata[billingCycle]', cycle);
        form.append('metadata[invoiceNumber]', invoiceNumber);

        const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${stripeKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
        });
        const stripeJson: any = await stripeRes.json();
        if (!stripeRes.ok || !stripeJson.url) {
          return res.status(502).json({
            error: stripeJson?.error?.message || 'Erreur lors de la création de la session Stripe.',
          });
        }

        const [pendingInvoice] = await db
          .insert(invoices)
          .values({
            orgId: oid,
            invoiceNumber,
            plan: typedPlan,
            billingCycle: cycle,
            amountCents: pricing.amountCents,
            taxCents: pricing.taxCents,
            totalCents: pricing.totalCents,
            currency: 'EUR',
            status: 'PENDING',
            paymentProvider: 'STRIPE',
            paymentMethodSummary: 'Stripe Checkout (en attente)',
            stripeSessionId: stripeJson.id,
            periodStart: now,
            periodEnd,
          })
          .returning();

        return res.status(201).json({
          provider: 'STRIPE',
          checkoutUrl: stripeJson.url,
          sessionId: stripeJson.id,
          invoice: pendingInvoice,
        });
      }

      // Built-in instant Card or SEPA B2B checkout
      const method = paymentMethod === 'SEPA' ? 'SEPA' : 'CARD';
      const cleanedLast4 =
        method === 'SEPA'
          ? String(ibanLast4 || '8901').replace(/\s+/g, '').slice(-4).padStart(4, '0')
          : String(cardLast4 || '4242').replace(/\D/g, '').slice(-4).padStart(4, '0');
      const brand = method === 'SEPA' ? 'Prélèvement SEPA' : String(cardBrand || 'Visa / Mastercard');
      const summary = `${brand} •••• ${cleanedLast4}`;

      const [paidInvoice] = await db
        .insert(invoices)
        .values({
          orgId: oid,
          invoiceNumber,
          plan: typedPlan,
          billingCycle: cycle,
          amountCents: pricing.amountCents,
          taxCents: pricing.taxCents,
          totalCents: pricing.totalCents,
          currency: 'EUR',
          status: 'PAID',
          paymentProvider: method,
          paymentMethodSummary: summary,
          periodStart: now,
          periodEnd,
          paidAt: now,
        })
        .returning();

      const [updatedOrg] = await db
        .update(organizations)
        .set({
          plan: typedPlan,
          billingCycle: cycle,
          mrrCents: pricing.unitMonthlyCents,
          maxAgents: pricing.spec.maxAgents,
          status: 'ACTIVE',
          trialEndsAt: null,
          billingEmail: effectiveBillingEmail,
          paymentMethodBrand: brand,
          paymentMethodLast4: cleanedLast4,
          nextBillingAt: periodEnd,
          cancelAtPeriodEnd: false,
        })
        .where(eq(organizations.id, oid))
        .returning();

      await db.insert(notifications).values({
        orgId: oid,
        type: 'REPORT_READY',
        title: `Paiement confirmé — ${invoiceNumber}`,
        message: `Plan ${typedPlan} (${cycle === 'ANNUAL' ? 'Annuel' : 'Mensuel'}) activé via ${summary}.`,
        isRead: false,
      });

      await db.insert(activityLogs).values({
        orgId: oid,
        actorName: user.fullName,
        actorEmail: user.email,
        action: 'SUBSCRIPTION_PAID',
        targetType: 'INVOICE',
        targetId: invoiceNumber,
        details: `Plan ${typedPlan} (${cycle}) · TTC ${(pricing.totalCents / 100).toFixed(2)} € via ${summary}`,
      });

      res.status(201).json({
        provider: 'BUILTIN',
        invoice: paidInvoice,
        organization: updatedOrg,
      });
    } catch (error) {
      console.error('Checkout error:', error);
      res.status(500).json({ error: 'Erreur lors du traitement du paiement.' });
    }
  }
);

billingRouter.get('/verify-session', async (req: AuthRequest, res) => {
  try {
    const oid = req.orgId!;
    const user = req.dbUser!;
    const sessionId = String(req.query.session_id || '').trim();
    const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();

    if (!sessionId || !stripeKey) {
      return res.status(400).json({ error: 'Session Stripe ou clé serveur manquante.' });
    }

    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    const session: any = await stripeRes.json();
    if (!stripeRes.ok) {
      return res.status(502).json({ error: session?.error?.message || 'Vérification Stripe impossible.' });
    }

    if (session.payment_status !== 'paid') {
      return res.json({ verified: false, status: session.payment_status });
    }

    const [existingInv] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, oid), eq(invoices.stripeSessionId, sessionId)))
      .limit(1);

    const targetPlan = (['STARTER', 'BUSINESS', 'ENTERPRISE'].includes(session.metadata?.plan)
      ? session.metadata.plan
      : existingInv?.plan || 'BUSINESS') as 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
    const cycle: 'MONTHLY' | 'ANNUAL' =
      session.metadata?.billingCycle === 'MONTHLY' || existingInv?.billingCycle === 'MONTHLY'
        ? 'MONTHLY'
        : 'ANNUAL';
    const pricing = computePricing(targetPlan, cycle);
    const now = new Date();
    const periodEnd = new Date(now.getTime() + pricing.periodDays * 86400000);

    let finalInvoice = existingInv;
    if (existingInv) {
      if (existingInv.status !== 'PAID') {
        const [upd] = await db
          .update(invoices)
          .set({
            status: 'PAID',
            paymentMethodSummary: 'Stripe Checkout (Carte vérifiée)',
            paidAt: now,
          })
          .where(eq(invoices.id, existingInv.id))
          .returning();
        finalInvoice = upd;
      }
    } else {
      const [created] = await db
        .insert(invoices)
        .values({
          orgId: oid,
          invoiceNumber: session.metadata?.invoiceNumber || generateInvoiceNumber(),
          plan: targetPlan,
          billingCycle: cycle,
          amountCents: pricing.amountCents,
          taxCents: pricing.taxCents,
          totalCents: pricing.totalCents,
          currency: 'EUR',
          status: 'PAID',
          paymentProvider: 'STRIPE',
          paymentMethodSummary: 'Stripe Checkout',
          stripeSessionId: sessionId,
          periodStart: now,
          periodEnd,
          paidAt: now,
        })
        .returning();
      finalInvoice = created;
    }

    const [updatedOrg] = await db
      .update(organizations)
      .set({
        plan: targetPlan,
        billingCycle: cycle,
        mrrCents: pricing.unitMonthlyCents,
        maxAgents: pricing.spec.maxAgents,
        status: 'ACTIVE',
        trialEndsAt: null,
        billingEmail: session.customer_details?.email || session.customer_email || user.email,
        paymentMethodBrand: 'Stripe Checkout',
        paymentMethodLast4: 'STRP',
        stripeCustomerId: String(session.customer || ''),
        nextBillingAt: periodEnd,
        cancelAtPeriodEnd: false,
      })
      .where(eq(organizations.id, oid))
      .returning();

    res.json({ verified: true, invoice: finalInvoice, organization: updatedOrg });
  } catch (error) {
    console.error('Verify stripe session error:', error);
    res.status(500).json({ error: 'Erreur lors de la validation Stripe.' });
  }
});

billingRouter.post(
  '/cancel',
  requireRole(['ORG_ADMIN', 'SUPER_ADMIN']),
  async (req: AuthRequest, res) => {
    try {
      const oid = req.orgId!;
      const user = req.dbUser!;
      const cancelAtPeriodEnd = req.body.cancelAtPeriodEnd !== undefined ? Boolean(req.body.cancelAtPeriodEnd) : true;
      const [updatedOrg] = await db
        .update(organizations)
        .set({ cancelAtPeriodEnd })
        .where(eq(organizations.id, oid))
        .returning();

      await db.insert(activityLogs).values({
        orgId: oid,
        actorName: user.fullName,
        actorEmail: user.email,
        action: cancelAtPeriodEnd ? 'SUBSCRIPTION_CANCEL_SCHEDULED' : 'SUBSCRIPTION_REACTIVATED',
        targetType: 'ORGANIZATION',
        targetId: updatedOrg.name,
        details: cancelAtPeriodEnd ? 'Renouvellement automatique suspendu' : 'Renouvellement réactivé',
      });

      res.json({ organization: updatedOrg });
    } catch (error) {
      res.status(500).json({ error: 'Impossible de modifier le renouvellement.' });
    }
  }
);

export default billingRouter;
