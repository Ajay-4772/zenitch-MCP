import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ApprovalTicket, RequirementRecord } from '../schemas/memory.schema.js';
import { generateId } from './id-generator.js';
import { StorageEngine } from './storage-engine.js';
import { RequirementsContainerFile } from './types.js';
import { RequirementsFileSchema } from '../schemas/memory.schema.js';

export class ApprovalManager {
  /**
   * Sanitizes an approval ticket before delivering it to an AI caller.
   * Strictly strips the secret humanApprovalToken so the AI cannot obtain it.
   */
  public static sanitizeTicketForAI(ticket: ApprovalTicket): Omit<ApprovalTicket, 'humanApprovalToken'> {
    const { humanApprovalToken, ...safeTicket } = ticket;
    return safeTicket;
  }

  public static async createTicket(
    zenitchDir: string,
    requirementId: string,
    evidenceSummary: string[] = []
  ): Promise<ApprovalTicket> {
    return StorageEngine.withLock(zenitchDir, async () => {
      const doc = StorageEngine.readDocument<RequirementsContainerFile>(
        zenitchDir,
        'requirements.json',
        RequirementsFileSchema,
        () => ({
          schemaVersion: '1.0.0',
          projectId: 'unknown',
          _version: 0,
          updatedAt: new Date().toISOString(),
          items: {},
          tickets: {}
        })
      );

      const req = doc.items[requirementId];
      if (!req) {
        throw new Error(`Requirement ${requirementId} not found in project memory.`);
      }

      if (req.status !== 'VERIFIED') {
        throw new Error(`Cannot request approval for requirement ${requirementId}: status is ${req.status}, must be VERIFIED.`);
      }

      const ticketId = generateId('TKT');
      const humanApprovalToken = `HTKT-${crypto.randomBytes(6).toString('hex')}`;
      const ticket: ApprovalTicket = {
        ticketId,
        requirementId,
        title: `Approval Request: ${req.title}`,
        proposedState: 'ACCEPTED',
        evidenceSummary: evidenceSummary.length > 0 ? evidenceSummary : ['Objective verification passed'],
        affectedFiles: req.relatedFiles || [],
        status: 'PENDING',
        humanApprovalToken,
        createdAt: new Date().toISOString()
      };

      doc.tickets[ticketId] = ticket;
      req.activeApprovalTicketId = ticketId;
      req.status = 'PENDING_APPROVAL';
      req.updatedAt = new Date().toISOString();

      // Write token to host-only channel file (.zenitch/.approval_tokens/<ticketId>.token)
      try {
        const tokensDir = path.join(zenitchDir, '.approval_tokens');
        if (!fs.existsSync(tokensDir)) {
          fs.mkdirSync(tokensDir, { recursive: true, mode: 0o700 });
        }
        const tokenFilePath = path.join(tokensDir, `${ticketId}.token`);
        fs.writeFileSync(tokenFilePath, humanApprovalToken, { encoding: 'utf8', mode: 0o600 });
      } catch {}

      StorageEngine.writeDocument(zenitchDir, 'requirements.json', doc, doc._version);
      return ticket;
    });
  }

  public static async resolveTicket(
    zenitchDir: string,
    ticketId: string,
    action: 'APPROVE' | 'REJECT',
    feedback?: string,
    humanApprovalToken?: string,
    approverRole?: 'HUMAN_USER' | 'AI_AGENT'
  ): Promise<{ ticket: ApprovalTicket; requirement: RequirementRecord }> {
    if (approverRole === 'AI_AGENT') {
      throw new Error('AI agents and automated tools cannot self-approve requirements. Human authorization is strictly required.');
    }

    return StorageEngine.withLock(zenitchDir, async () => {
      const doc = StorageEngine.readDocument<RequirementsContainerFile>(
        zenitchDir,
        'requirements.json',
        RequirementsFileSchema,
        () => ({
          schemaVersion: '1.0.0',
          projectId: 'unknown',
          _version: 0,
          updatedAt: new Date().toISOString(),
          items: {},
          tickets: {}
        })
      );

      const ticket = doc.tickets[ticketId];
      if (!ticket) {
        throw new Error(`Approval ticket ${ticketId} not found.`);
      }

      if (ticket.status !== 'PENDING') {
        throw new Error(`Approval ticket ${ticketId} is already resolved with status ${ticket.status}.`);
      }

      const req = doc.items[ticket.requirementId];
      if (!req) {
        throw new Error(`Associated requirement ${ticket.requirementId} not found for ticket ${ticketId}.`);
      }

      if (action === 'APPROVE') {
        if (!humanApprovalToken || humanApprovalToken !== ticket.humanApprovalToken) {
          throw new Error('Approval denied: humanApprovalToken is missing or invalid. AI tools cannot self-approve requirements without verified human confirmation.');
        }
        ticket.status = 'APPROVED';
        ticket.resolvedBy = 'HUMAN_USER';
        ticket.resolvedAt = new Date().toISOString();
        req.status = 'ACCEPTED';
      } else {
        ticket.status = 'REJECTED';
        ticket.resolvedBy = 'HUMAN_USER';
        ticket.resolvedAt = new Date().toISOString();
        ticket.rejectionFeedback = feedback || 'Rejected by user during approval review.';
        req.status = 'IMPLEMENTED'; // Revert back to IMPLEMENTED for remediation
      }

      req.updatedAt = new Date().toISOString();
      delete req.activeApprovalTicketId;

      // Clean up host token file once resolved
      try {
        const tokenFilePath = path.join(zenitchDir, '.approval_tokens', `${ticketId}.token`);
        if (fs.existsSync(tokenFilePath)) {
          fs.unlinkSync(tokenFilePath);
        }
      } catch {}

      StorageEngine.writeDocument(zenitchDir, 'requirements.json', doc, doc._version);
      return { ticket, requirement: req };
    });
  }
}
