import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { automationRules, notifications, teams, tickets, activityLogs } from '../db/schema.ts';

export async function runAutomationsForTicket(
  orgId: number,
  ticketId: number,
  triggerEvent: 'TICKET_CREATED' | 'TICKET_UPDATED' | 'TICKET_RESOLVED',
  customerType = 'PME'
) {
  try {
    const [ticket] = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.orgId, orgId)))
      .limit(1);
    if (!ticket) return [];

    const rules = await db
      .select()
      .from(automationRules)
      .where(
        and(
          eq(automationRules.orgId, orgId),
          eq(automationRules.isActive, true),
          eq(automationRules.triggerEvent, triggerEvent)
        )
      );

    const executedNames: string[] = [];

    for (const rule of rules) {
      const conditions = rule.conditions || [];
      const matchesAll = conditions.every((cond) => {
        const val = (cond.value || '').toLowerCase();
        const op = cond.operator || 'EQUALS';
        let actual = '';
        if (cond.field === 'priority') actual = ticket.priority.toLowerCase();
        else if (cond.field === 'category') actual = ticket.category.toLowerCase();
        else if (cond.field === 'status') actual = ticket.status.toLowerCase();
        else if (cond.field === 'channel') actual = ticket.channel.toLowerCase();
        else if (cond.field === 'customerType') actual = customerType.toLowerCase();
        else if (cond.field === 'keyword') actual = `${ticket.subject} ${ticket.description}`.toLowerCase();
        else if (cond.field === 'slaBreached') actual = String(ticket.slaBreached);

        if (op === 'EQUALS') return actual === val;
        if (op === 'NOT_EQUALS') return actual !== val;
        if (op === 'IN') {
          return val
            .split(',')
            .map((s) => s.trim())
            .includes(actual);
        }
        if (op === 'CONTAINS') {
          return val
            .split(',')
            .map((s) => s.trim())
            .some((kw) => kw && actual.includes(kw));
        }
        return false;
      });

      if (!matchesAll) continue;

      const updates: Partial<typeof tickets.$inferInsert> = {};
      const currentTags = Array.isArray(ticket.tags) ? [...ticket.tags] : [];

      for (const action of rule.actions || []) {
        if (action.type === 'SET_PRIORITY' && action.value) {
          updates.priority = action.value;
        } else if (action.type === 'SET_STATUS' && action.value) {
          updates.status = action.value;
        } else if (action.type === 'ADD_TAG' && action.value) {
          if (!currentTags.includes(action.value)) {
            currentTags.push(action.value);
            updates.tags = currentTags;
          }
        } else if (action.type === 'ASSIGN_TEAM' && action.value) {
          const [matchedTeam] = await db
            .select()
            .from(teams)
            .where(and(eq(teams.orgId, orgId), eq(teams.name, action.value)))
            .limit(1);
          if (matchedTeam) {
            updates.teamId = matchedTeam.id;
          }
        } else if (action.type === 'ESCALATE') {
          updates.status = 'ESCALADE';
        } else if (action.type === 'CREATE_NOTIFICATION' && action.value) {
          await db.insert(notifications).values({
            orgId,
            type: 'ESCALATION',
            title: `Automatisation : ${rule.name}`,
            message: `${action.value} (${ticket.ticketNumber})`,
            ticketId: ticket.id,
            isRead: false,
          });
        } else if (action.type === 'SEND_SURVEY') {
          await db.insert(notifications).values({
            orgId,
            type: 'REPORT_READY',
            title: `Enquête satisfaction programmée (${ticket.ticketNumber})`,
            message: `Lien d’enquête CSAT/NPS/CES généré suite à la résolution du dossier.`,
            ticketId: ticket.id,
            isRead: false,
          });
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        await db.update(tickets).set(updates).where(eq(tickets.id, ticket.id));
      }

      await db
        .update(automationRules)
        .set({
          executionCount: rule.executionCount + 1,
          lastTriggeredAt: new Date(),
        })
        .where(eq(automationRules.id, rule.id));

      await db.insert(activityLogs).values({
        orgId,
        actorName: 'Moteur Workflows',
        actorEmail: 'automation@clientpulse360.fr',
        action: 'WORKFLOW_TRIGGERED',
        targetType: 'TICKET',
        targetId: ticket.ticketNumber,
        details: `Règle exécutée : ${rule.name}`,
      });

      executedNames.push(rule.name);
    }

    return executedNames;
  } catch (error) {
    console.error('Automation engine error:', error);
    return [];
  }
}
