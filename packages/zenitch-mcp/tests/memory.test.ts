import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { generateId, isValidId } from '../src/memory/id-generator.js';
import { resolveProjectIdentity } from '../src/memory/project-identity.js';
import {
  StorageEngine,
  ConcurrencyConflictError,
  MemoryCorruptionError,
  redactSecrets
} from '../src/memory/storage-engine.js';
import {
  RequirementStateMachine,
  InvalidStateTransitionError
} from '../src/memory/state-machine.js';
import { ApprovalManager } from '../src/memory/approval-manager.js';
import { AuthorityEngine } from '../src/memory/authority-engine.js';
import { MemoryManager } from '../src/memory/memory-manager.js';
import { MigrationEngine } from '../src/memory/migration-engine.js';
import { ZenitchServer } from '../src/server.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import {
  RequirementsFileSchema,
  PreferencesFileSchema,
  ConstraintsFileSchema,
  VerificationFileSchema
} from '../src/schemas/memory.schema.js';
import { RequirementsContainerFile, VerificationFile, ConstraintsFile } from '../src/memory/types.js';

test('1. ID Generation: generates collision-resistant monotonic IDs with prefix validation', () => {
  const ids = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const id = generateId('REQ');
    assert.match(id, /^REQ-[0-9a-f]+-[0-9a-f]{4}$/);
    assert.equal(isValidId(id, 'REQ'), true);
    assert.equal(isValidId(id, 'DEC'), false);
    ids.add(id);
  }
  assert.equal(ids.size, 500, 'All 500 IDs must be strictly unique');

  const decId = generateId('DEC');
  assert.match(decId, /^DEC-[0-9a-f]+-[0-9a-f]{4}$/);

  const cstId = generateId('CST');
  assert.match(cstId, /^CST-[0-9a-f]+-[0-9a-f]{4}$/);
});

test('2. Project Identity: resolves stable hierarchy and maintains ID across folder moves (path independence)', () => {
  const tempDirA = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-id-test-a-'));
  const tempDirB = path.join(os.tmpdir(), 'zenitch-id-test-b-' + Date.now());
  try {
    const idA1 = resolveProjectIdentity(tempDirA);
    assert.ok(idA1.projectId.startsWith('PRJ-'));

    // Move folder to tempDirB (with retry for transient Windows directory locks)
    let renamed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        fs.renameSync(tempDirA, tempDirB);
        renamed = true;
        break;
      } catch (e) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
    if (!renamed) fs.renameSync(tempDirA, tempDirB);

    // Project ID must remain strictly identical even though directory path changed
    const idB1 = resolveProjectIdentity(tempDirB);
    assert.equal(idB1.projectId, idA1.projectId, 'Moving directory must not change project ID when persisted fallback UUID exists');

    // Package manifest takes precedence over local fallback
    const pkgPath = path.join(tempDirB, 'package.json');
    fs.writeFileSync(pkgPath, JSON.stringify({ name: 'my-custom-saas' }));
    const idWithPkg = resolveProjectIdentity(tempDirB);
    assert.equal(idWithPkg.projectName, 'my-custom-saas');
  } finally {
    try { fs.rmSync(tempDirA, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(tempDirB, { recursive: true, force: true }); } catch {}
  }
});

test('3. Storage Engine: atomic writes, optimistic versioning, and secret redaction', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-storage-test-'));
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);

    const initial = StorageEngine.readDocument<RequirementsContainerFile>(
      zenitchDir,
      'requirements.json',
      RequirementsFileSchema,
      () => ({
        schemaVersion: '1.0.0',
        projectId: 'PRJ-TEST',
        _version: 0,
        updatedAt: new Date().toISOString(),
        items: {},
        tickets: {}
      })
    );
    assert.equal(initial._version, 0);

    const reqId = generateId('REQ');
    initial.items[reqId] = {
      id: reqId,
      title: 'Initial requirement',
      description: 'Test requirement',
      category: 'functional',
      status: 'REQUESTED',
      priority: 'must_have',
      provenance: {
        source: 'USER',
        verificationLevel: 'USER_CONFIRMED',
        confidence: 1.0,
        timestamp: new Date().toISOString()
      },
      acceptanceCriteria: [],
      relatedFiles: [],
      relatedDecisions: [],
      verificationEvidenceIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const saved = StorageEngine.writeDocument(zenitchDir, 'requirements.json', initial, 0);
    assert.equal(saved._version, 1);

    // Stale version throws ConcurrencyConflictError
    assert.throws(
      () => {
        StorageEngine.writeDocument(zenitchDir, 'requirements.json', initial, 0);
      },
      (err: any) => err instanceof ConcurrencyConflictError
    );

    // Secret redaction
    const secretObj = {
      apiKey: 'api_key: "sk-ant-api03-secret1234567890abcdef"',
      jwt: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakSignatureHere12345'
    };
    const redacted = redactSecrets(secretObj);
    assert.ok(!redacted.apiKey.includes('secret1234567890abcdef'));
    assert.ok(redacted.apiKey.includes('[REDACTED SENSITIVE CONTENT]'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('4. Corruption Handling: blocks writes, rejects silent empty reads, requires explicit recovery', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-corrupt-test-'));
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const reqPath = path.join(zenitchDir, 'requirements.json');
    fs.writeFileSync(reqPath, '{ invalid json content !!!');

    // 1. Initial read throws MemoryCorruptionError and preserves corrupt file
    assert.throws(
      () => {
        StorageEngine.readDocument(
          zenitchDir,
          'requirements.json',
          RequirementsFileSchema,
          () => ({ schemaVersion: '1.0.0', projectId: 'PRJ-TEST', _version: 0, updatedAt: '', items: {}, tickets: {} })
        );
      },
      (err: any) => err instanceof MemoryCorruptionError && err.report.status === 'DEGRADED_CORRUPTION_DETECTED'
    );

    assert.equal(StorageEngine.isDegraded(zenitchDir, 'requirements.json'), true);

    // 2. Subsequent read MUST NOT return a silent empty default container; it must reject with structured error
    assert.throws(
      () => {
        StorageEngine.readDocument(
          zenitchDir,
          'requirements.json',
          RequirementsFileSchema,
          () => ({ schemaVersion: '1.0.0', projectId: 'PRJ-TEST', _version: 0, updatedAt: '', items: {}, tickets: {} })
        );
      },
      (err: any) => err instanceof MemoryCorruptionError
    );

    // 3. Writes MUST BE BLOCKED while document is in degraded corruption state
    assert.throws(
      () => {
        StorageEngine.writeDocument(zenitchDir, 'requirements.json', { _version: 1, items: {} } as any);
      },
      (err: any) => err instanceof MemoryCorruptionError && err.message.includes('Writes are blocked')
    );

    // 4. Explicit recovery removes degraded status and restores write capability
    StorageEngine.recoverDocument(zenitchDir, 'requirements.json', {
      schemaVersion: '1.0.0',
      projectId: 'PRJ-TEST',
      _version: 0,
      updatedAt: new Date().toISOString(),
      items: {},
      tickets: {}
    });

    assert.equal(StorageEngine.isDegraded(zenitchDir, 'requirements.json'), false);

    // Read succeeds normally after explicit recovery
    const recovered = StorageEngine.readDocument(
      zenitchDir,
      'requirements.json',
      RequirementsFileSchema,
      () => ({ schemaVersion: '1.0.0', projectId: 'PRJ-TEST', _version: 0, updatedAt: '', items: {}, tickets: {} })
    );
    assert.equal(recovered._version, 1);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('5. State Machine: enforces deterministic transitions and blocks invalid leaps', () => {
  // Valid transitions
  assert.doesNotThrow(() => {
    RequirementStateMachine.validateTransition({ currentStatus: 'REQUESTED', targetStatus: 'PLANNED' });
  });

  assert.doesNotThrow(() => {
    RequirementStateMachine.validateTransition({
      currentStatus: 'PLANNED',
      targetStatus: 'IMPLEMENTED',
      hasRelatedFiles: true
    });
  });

  assert.doesNotThrow(() => {
    RequirementStateMachine.validateTransition({ currentStatus: 'IMPLEMENTED', targetStatus: 'TESTED' });
  });

  assert.doesNotThrow(() => {
    RequirementStateMachine.validateTransition({
      currentStatus: 'TESTED',
      targetStatus: 'VERIFIED',
      hasVerificationEvidence: true
    });
  });

  assert.doesNotThrow(() => {
    RequirementStateMachine.validateTransition({ currentStatus: 'VERIFIED', targetStatus: 'PENDING_APPROVAL' });
  });

  assert.doesNotThrow(() => {
    RequirementStateMachine.validateTransition({
      currentStatus: 'PENDING_APPROVAL',
      targetStatus: 'ACCEPTED',
      isApprovalTicketResolved: true
    });
  });

  // Forbidden jump: REQUESTED -> VERIFIED
  assert.throws(
    () => {
      RequirementStateMachine.validateTransition({ currentStatus: 'REQUESTED', targetStatus: 'VERIFIED' });
    },
    (err: any) => err instanceof InvalidStateTransitionError && err.message.includes('Cannot jump from REQUESTED')
  );

  // Forbidden jump: REQUESTED -> ACCEPTED
  assert.throws(
    () => {
      RequirementStateMachine.validateTransition({ currentStatus: 'REQUESTED', targetStatus: 'ACCEPTED' });
    },
    (err: any) => err instanceof InvalidStateTransitionError
  );

  // Forbidden jump: IMPLEMENTED -> ACCEPTED
  assert.throws(
    () => {
      RequirementStateMachine.validateTransition({ currentStatus: 'IMPLEMENTED', targetStatus: 'ACCEPTED' });
    },
    (err: any) => err instanceof InvalidStateTransitionError && err.message.includes('Cannot transition from IMPLEMENTED directly to ACCEPTED')
  );

  // Transition to VERIFIED without passing evidence fails
  assert.throws(
    () => {
      RequirementStateMachine.validateTransition({
        currentStatus: 'TESTED',
        targetStatus: 'VERIFIED',
        hasVerificationEvidence: false
      });
    },
    (err: any) => err instanceof InvalidStateTransitionError && err.message.includes('requires linking valid objective verification evidence')
  );
});

test('6. Human Approval Trust Boundary: AI cannot obtain credential from tool responses or self-approve', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-approval-boundary-test-'));
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const reqId = generateId('REQ');

    const reqDoc: RequirementsContainerFile = {
      schemaVersion: '1.0.0',
      projectId: 'PRJ-TEST',
      _version: 0,
      updatedAt: new Date().toISOString(),
      items: {
        [reqId]: {
          id: reqId,
          title: 'Critical Payment Gateway',
          description: 'Payment integration',
          category: 'functional',
          status: 'VERIFIED',
          priority: 'must_have',
          provenance: {
            source: 'USER',
            verificationLevel: 'USER_CONFIRMED',
            confidence: 1.0,
            timestamp: new Date().toISOString()
          },
          acceptanceCriteria: ['pass tests'],
          relatedFiles: ['src/payment.ts'],
          relatedDecisions: [],
          verificationEvidenceIds: ['VER-001'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      },
      tickets: {}
    };
    StorageEngine.writeDocument(zenitchDir, 'requirements.json', reqDoc, 0);

    // 1. AI calls REQUEST_APPROVAL via MemoryManager
    const requestRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'REQUEST_APPROVAL',
      requirementId: reqId
    });

    assert.equal(requestRes.action, 'REQUEST_APPROVAL');
    assert.equal(requestRes.requiresHumanAction, true);

    // 2. PROVE AI CANNOT OBTAIN THE humanApprovalToken FROM THE REQUEST_APPROVAL RESPONSE
    assert.equal(
      (requestRes.ticket as any).humanApprovalToken,
      undefined,
      'AI tool response must strictly omit humanApprovalToken'
    );

    const ticketId = requestRes.ticket.ticketId;

    // Verify token exists on the host filesystem channel
    const tokenFile = path.join(zenitchDir, '.approval_tokens', `${ticketId}.token`);
    assert.ok(fs.existsSync(tokenFile), 'Token must be isolated in host channel');
    const secretHostToken = fs.readFileSync(tokenFile, 'utf8').trim();
    assert.ok(secretHostToken.startsWith('HTKT-'));

    // 3. AI attempts RESOLVE_APPROVAL without legitimate host-mediated human approval token
    await assert.rejects(
      async () => {
        await MemoryManager.manageRequirement({
          projectRoot: tempDir,
          action: 'RESOLVE_APPROVAL',
          approvalTicketId: ticketId,
          approvalAction: 'APPROVE'
        });
      },
      (err: any) => err.message.includes('humanApprovalToken is missing or invalid')
    );

    // AI attempts RESOLVE_APPROVAL with guessed or forged token
    await assert.rejects(
      async () => {
        await MemoryManager.manageRequirement({
          projectRoot: tempDir,
          action: 'RESOLVE_APPROVAL',
          approvalTicketId: ticketId,
          approvalAction: 'APPROVE',
          humanApprovalToken: 'FORGED_AI_TOKEN_12345'
        });
      },
      (err: any) => err.message.includes('humanApprovalToken is missing or invalid')
    );

    // 4. Requirement must remain in PENDING_APPROVAL state
    const ctx = await MemoryManager.getProjectContext({ projectRoot: tempDir, mode: 'standard' });
    assert.equal(ctx.requirements[0].status, 'PENDING_APPROVAL', 'Requirement must remain PENDING_APPROVAL');

    // 5. Legitimate host-mediated human approval providing the host token succeeds
    const resolveRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'RESOLVE_APPROVAL',
      approvalTicketId: ticketId,
      approvalAction: 'APPROVE',
      humanApprovalToken: secretHostToken
    });

    assert.equal(resolveRes.action, 'RESOLVE_APPROVAL');
    assert.equal(resolveRes.requirement.status, 'ACCEPTED');
    assert.equal(resolveRes.resolvedTicket.status, 'APPROVED');
    // Ensure token is not leaked even in resolve response
    assert.equal((resolveRes.resolvedTicket as any).humanApprovalToken, undefined);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('7. Authority Engine & Negative Constraints: rejected decisions generate STRICT_BLOCK constraints', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-auth-test-'));
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const cstId = generateId('CST');

    const cstDoc: ConstraintsFile = {
      schemaVersion: '1.0.0',
      projectId: 'PRJ-TEST',
      _version: 0,
      updatedAt: new Date().toISOString(),
      items: {
        [cstId]: {
          id: cstId,
          title: 'No Bootstrap Framework',
          rule: 'Do not use bootstrap or jquery',
          rationale: 'Project standardizes on modern vanilla design tokens',
          enforcementLevel: 'STRICT_BLOCK',
          applicableSubsystems: ['policy'],
          provenance: {
            source: 'SYSTEM_RULE',
            verificationLevel: 'TEST_VERIFIED',
            confidence: 1.0,
            timestamp: new Date().toISOString()
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
    };
    StorageEngine.writeDocument(zenitchDir, 'constraints.json', cstDoc, 0);

    const conflict = AuthorityEngine.checkProposalAgainstConstraints(zenitchDir, 'Add bootstrap styling for modal');
    assert.equal(conflict.hasConflict, true);
    assert.equal(conflict.conflictingConstraint?.id, cstId);

    const clean = AuthorityEngine.checkProposalAgainstConstraints(zenitchDir, 'Implement modal dialog with accessible semantic dialog tag');
    assert.equal(clean.hasConflict, false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('8. End-to-end memory workflows via MemoryManager: requirements, verification, decisions & tickets', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-e2e-test-'));
  try {
    const ctx1 = await MemoryManager.getProjectContext({
      projectRoot: tempDir,
      mode: 'standard'
    });
    assert.equal(ctx1.mode, 'standard');
    assert.equal(ctx1.requirements.length, 0);

    const reqRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'User Authentication Flow',
      description: 'Implement token-based login and session check',
      category: 'functional',
      acceptanceCriteria: ['Pass auth tests']
    });
    assert.equal(reqRes.action, 'CREATE');
    const reqId = reqRes.requirement.id;

    // Record REJECTED decision -> auto-generates STRICT_BLOCK constraint
    const decRes = await MemoryManager.recordDecision({
      projectRoot: tempDir,
      title: 'Reject Redux Toolkit',
      decision: 'Do not use Redux Toolkit for state management',
      rationale: 'Redux introduces unnecessary complexity and boilerplate',
      disposition: 'REJECTED',
      scope: 'global'
    });
    assert.equal(decRes.type, 'PROJECT_DECISION');
    assert.ok(decRes.generatedConstraint);
    assert.equal(decRes.generatedConstraint.enforcementLevel, 'STRICT_BLOCK');

    // Context reflects constraint
    const ctx2 = await MemoryManager.getProjectContext({
      projectRoot: tempDir,
      mode: 'standard'
    });
    assert.equal(ctx2.activeNegativeConstraints.length, 1);
    assert.equal(ctx2.activeNegativeConstraints[0].enforcementLevel, 'STRICT_BLOCK');

    // Transition to PLANNED -> IMPLEMENTED -> TESTED
    await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'UPDATE_STATUS',
      requirementId: reqId,
      newStatus: 'PLANNED'
    });

    await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'UPDATE_STATUS',
      requirementId: reqId,
      newStatus: 'IMPLEMENTED',
      relatedFiles: ['src/auth.ts']
    });

    await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'UPDATE_STATUS',
      requirementId: reqId,
      newStatus: 'TESTED'
    });

    // Write passing verification evidence
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const verId = generateId('VER');
    const verDoc: VerificationFile = {
      schemaVersion: '1.0.0',
      projectId: 'PRJ-TEST',
      _version: 0,
      updatedAt: new Date().toISOString(),
      items: {
        [verId]: {
          id: verId,
          requirementId: reqId,
          verificationMethod: 'AUTOMATED_TEST',
          verdict: 'PASSED',
          evidenceSummary: '12 unit and integration tests passing with 0 failures',
          provenance: {
            source: 'TEST_RESULT',
            verificationLevel: 'TEST_VERIFIED',
            confidence: 1.0,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        }
      }
    };
    StorageEngine.writeDocument(zenitchDir, 'verification.json', verDoc, 0);

    // Link verification and transition to VERIFIED
    await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'LINK_VERIFICATION',
      requirementId: reqId,
      verificationEvidenceId: verId
    });

    const verifiedRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'UPDATE_STATUS',
      requirementId: reqId,
      newStatus: 'VERIFIED',
      verificationEvidenceId: verId
    });
    assert.equal(verifiedRes.requirement.status, 'VERIFIED');

    // Request human approval
    const ticketRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'REQUEST_APPROVAL',
      requirementId: reqId
    });
    assert.equal(ticketRes.action, 'REQUEST_APPROVAL');
    const ticket = ticketRes.ticket;

    // Read secret token from host token directory
    const hostTokenPath = path.join(zenitchDir, '.approval_tokens', `${ticket.ticketId}.token`);
    const hostToken = fs.readFileSync(hostTokenPath, 'utf8').trim();

    // Resolve approval with host token
    const resolveRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'RESOLVE_APPROVAL',
      approvalTicketId: ticket.ticketId,
      approvalAction: 'APPROVE',
      humanApprovalToken: hostToken
    });
    assert.equal(resolveRes.action, 'RESOLVE_APPROVAL');
    assert.equal(resolveRes.requirement.status, 'ACCEPTED');

    // Detailed context check
    const ctxDetailed = await MemoryManager.getProjectContext({
      projectRoot: tempDir,
      mode: 'detailed'
    });
    assert.equal(ctxDetailed.mode, 'detailed');
    assert.equal(ctxDetailed.requirements.length, 1);
    assert.equal(ctxDetailed.requirements[0].status, 'ACCEPTED');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('9. Storage Engine: Stale lock recovery after 5000ms threshold', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-lock-test-'));
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const lockPath = path.join(zenitchDir, '.lock');

    fs.writeFileSync(lockPath, JSON.stringify({ pid: 99999, createdAt: Date.now() - 10000 }), 'utf8');

    const lockAcquired = await StorageEngine.withLock(zenitchDir, async () => {
      return true;
    });
    assert.equal(lockAcquired, true);
    assert.equal(fs.existsSync(lockPath), false, 'Lock must be cleaned up on finish');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('10. Concurrency Evidence: Simultaneous locked async writes maintain serialization without corruption', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-simultaneous-write-test-'));
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);

    // Initial document
    StorageEngine.writeDocument(zenitchDir, 'preferences.json', {
      schemaVersion: '1.0.0',
      projectId: 'PRJ-CONCURRENCY-TEST',
      _version: 0,
      updatedAt: new Date().toISOString(),
      items: {}
    }, 0);

    // Launch 8 simultaneous asynchronous write operations under advisory lock
    const operations = Array.from({ length: 8 }, (_, i) => {
      return StorageEngine.withLock(zenitchDir, async () => {
        const current = StorageEngine.readDocument<any>(
          zenitchDir,
          'preferences.json',
          PreferencesFileSchema,
          () => ({ schemaVersion: '1.0.0', projectId: 'PRJ-CONCURRENCY-TEST', _version: 0, updatedAt: '', items: {} })
        );
        const prefId = generateId('PRF');
        current.items[prefId] = {
          id: prefId,
          category: 'visual_style',
          preference: `Preference ${i}`,
          rationale: 'Concurrency test entry',
          scope: 'global_user',
          provenance: {
            source: 'USER',
            verificationLevel: 'USER_CONFIRMED',
            confidence: 1.0,
            timestamp: new Date().toISOString()
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        StorageEngine.writeDocument(zenitchDir, 'preferences.json', current, current._version);
        return i;
      });
    });

    const results = await Promise.all(operations);
    assert.equal(results.length, 8);

    // Read back final document: must have exactly 8 items and version 8, zero data loss
    const finalDoc = StorageEngine.readDocument<any>(
      zenitchDir,
      'preferences.json',
      PreferencesFileSchema,
      () => ({ schemaVersion: '1.0.0', projectId: 'PRJ-CONCURRENCY-TEST', _version: 0, updatedAt: '', items: {} })
    );

    assert.equal(Object.keys(finalDoc.items).length, 8, 'All 8 concurrent updates must be safely committed without data loss');
    assert.equal(finalDoc._version, 9, 'Version must be incremented for initial write + 8 concurrent updates (1 + 8 = 9)');
    assert.equal(StorageEngine.isDegraded(zenitchDir, 'preferences.json'), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('11. State Machine: handles UNVERIFIED and BLOCKED lifecycle states', () => {
  assert.throws(() => {
    RequirementStateMachine.validateTransition({
      currentStatus: 'PLANNED',
      targetStatus: 'BLOCKED'
    });
  }, (err: any) => err instanceof InvalidStateTransitionError && err.message.includes('blocker rationale'));

  assert.doesNotThrow(() => {
    RequirementStateMachine.validateTransition({
      currentStatus: 'PLANNED',
      targetStatus: 'BLOCKED',
      blockerRationale: 'Awaiting design token decision'
    });
  });

  assert.doesNotThrow(() => {
    RequirementStateMachine.validateTransition({
      currentStatus: 'VERIFIED',
      targetStatus: 'UNVERIFIED'
    });
  });

  assert.doesNotThrow(() => {
    RequirementStateMachine.validateTransition({
      currentStatus: 'UNVERIFIED',
      targetStatus: 'TESTED'
    });
  });
});

test('12. Client Codebase Safety: read-only boundary leaves all non-.zenitch files untouched', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-readonly-test-'));
  try {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const appFile = path.join(srcDir, 'App.tsx');
    const originalContent = 'export default function App() { return <div>Original App</div>; }';
    fs.writeFileSync(appFile, originalContent, 'utf8');

    await MemoryManager.getProjectContext({ projectRoot: tempDir, mode: 'detailed' });
    await MemoryManager.recordDecision({
      projectRoot: tempDir,
      title: 'Adopt Pure CSS Tokens',
      decision: 'Use vanilla CSS tokens without build preprocessors',
      rationale: 'Maximum portability',
      disposition: 'ACCEPTED'
    });
    await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'Preserve client files intact',
      description: 'Ensure client code is never modified by memory system'
    });

    const currentContent = fs.readFileSync(appFile, 'utf8');
    assert.equal(currentContent, originalContent, 'Client application files must remain strictly unmodified');

    const files = fs.readdirSync(tempDir);
    assert.ok(files.includes('.zenitch'));
    assert.ok(files.includes('src'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('13. Migration Evidence: transforms legacy v0.9.0 schema fixture to v1.0.0 with full data preservation', () => {
  // Realistic v0.9.0 legacy fixture with old field names and enums
  const legacyV090Doc = {
    schemaVersion: '0.9.0',
    projectId: 'PRJ-LEGACY-001',
    _version: 3,
    items: {
      'REQ-OLD-1': {
        id: 'REQ-OLD-1',
        req_title: 'Legacy Dark Mode Theme',
        req_description: 'Enable dark mode support using CSS variables',
        category: 'VISUAL',
        state: 'REQUESTED',
        priority: 'HIGH',
        createdAt: '2026-09-01T10:00:00.000Z'
      },
      'REQ-OLD-2': {
        id: 'REQ-OLD-2',
        req_title: 'Legacy Monospace Font',
        req_description: 'Ensure code blocks use monospace font stack',
        category: 'ERGONOMICS',
        state: 'REQUESTED',
        priority: 'LOW',
        createdAt: '2026-09-02T10:00:00.000Z'
      }
    }
  };

  // Run through MigrationEngine pipeline
  const migrated = MigrationEngine.migrateDocument<RequirementsContainerFile>('requirements.json', legacyV090Doc);

  // 1. Version updated to 1.0.0
  assert.equal(migrated.schemaVersion, '1.0.0');

  // 2. Data preserved
  assert.equal(Object.keys(migrated.items).length, 2);
  const req1 = migrated.items['REQ-OLD-1'];
  assert.equal(req1.title, 'Legacy Dark Mode Theme');
  assert.equal(req1.description, 'Enable dark mode support using CSS variables');
  assert.equal(req1.category, 'visual');
  assert.equal(req1.status, 'REQUESTED');
  assert.equal(req1.priority, 'must_have'); // 'HIGH' mapped to 'must_have'

  const req2 = migrated.items['REQ-OLD-2'];
  assert.equal(req2.title, 'Legacy Monospace Font');
  assert.equal(req2.priority, 'nice_to_have'); // 'LOW' mapped to 'nice_to_have'

  // 3. Tickets container added
  assert.deepEqual(migrated.tickets, {});

  // 4. Validates cleanly against RequirementsFileSchema
  const validated = RequirementsFileSchema.safeParse(migrated);
  assert.equal(validated.success, true, 'Migrated document must satisfy v1.0.0 Zod schema');
});

test('14. ZenitchServer: default mode lists exactly 10 baseline tools', async () => {
  const server = new ZenitchServer({ enableZenitchTools: false });
  const internalServer = server.getServerInstance();
  const listHandler = (internalServer as any)._requestHandlers.get(ListToolsRequestSchema.shape.method.value);

  const toolList = await listHandler({ method: 'tools/list', params: {} });
  assert.equal(toolList.tools.length, 11, 'Default server without Zenitch enabled must list exactly 11 tools');
  const toolNames = toolList.tools.map((t: any) => t.name);
  assert.equal(toolNames.some((n: string) => ['zenitch_get_project_context', 'zenitch_record_decision', 'zenitch_manage_requirement'].includes(n)), false, 'Default tools must not include memory tools');
});

test('15. ZenitchServer: ZENITCH_ENABLED mode lists all 14 tools and executes calls', async () => {
  const server = new ZenitchServer({ enableZenitchTools: true });
  const internalServer = server.getServerInstance();

  const listHandler = (internalServer as any)._requestHandlers.get(ListToolsRequestSchema.shape.method.value);
  const toolList = await listHandler({ method: 'tools/list', params: {} });
  assert.equal(toolList.tools.length, 14, 'Zenitch enabled server must list exactly 14 tools');

  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  // Ping
  const pingRes = await callHandler({
    method: 'tools/call',
    params: { name: 'zenitch_ping', arguments: {} }
  });
  const pingData = JSON.parse(pingRes.content[0].text);
  assert.equal(pingData.data.status, 'HEALTHY');

  // System info
  const sysRes = await callHandler({
    method: 'tools/call',
    params: { name: 'zenitch_get_system_info', arguments: {} }
  });
  const sysData = JSON.parse(sysRes.content[0].text);
  assert.ok(sysData.data.subsystems.some((s: any) => s.id === 'project_memory'));

  // Get project context
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-server-test-'));
  try {
    const ctxRes = await callHandler({
      method: 'tools/call',
      params: {
        name: 'zenitch_get_project_context',
        arguments: { projectRoot: tempDir, mode: 'concise' }
      }
    });
    const ctxData = JSON.parse(ctxRes.content[0].text);
    assert.equal(ctxData.data.mode, 'concise');
    assert.ok(ctxData.data.projectId.startsWith('PRJ-'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('16. Circular Dependency & Error Semantics Regression: MemoryCorruptionError preserved in types and storage-engine', () => {
  const report = {
    status: 'DEGRADED_CORRUPTION_DETECTED' as const,
    file: 'requirements.json',
    corruptPath: 'requirements.json.corrupt.123',
    errorDetails: 'Invalid JSON',
    detectedAt: new Date().toISOString()
  };
  const err = new MemoryCorruptionError(report);
  assert.equal(err.name, 'MemoryCorruptionError');
  assert.equal(err.report.status, 'DEGRADED_CORRUPTION_DETECTED');
  assert.ok(err.message.includes('Memory file corruption detected in requirements.json'));
  assert.ok(err instanceof Error);
});
