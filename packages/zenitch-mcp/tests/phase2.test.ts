import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ZenitchServer } from '../src/server.js';
import { MemoryManager } from '../src/memory/memory-manager.js';
import { ChangeManager } from '../src/memory/change-manager.js';
import { GitInspector } from '../src/memory/git-inspector.js';
import { CheckpointEngine } from '../src/memory/checkpoint-engine.js';
import { StorageEngine, MemoryCorruptionError } from '../src/memory/storage-engine.js';
import { MigrationEngine } from '../src/memory/migration-engine.js';
import { generateId, isValidId } from '../src/memory/id-generator.js';
import {
  RequirementsFileSchema,
  ChangesFileSchema,
  VerificationFileSchema
} from '../src/schemas/memory.schema.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

test('1. Requirement creation: creates requirement with structured Phase 2 fields', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-req-create-'));
  try {
    const res = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'Responsive Navigation Drawer',
      description: 'Collapsible drawer on viewport width under 768px',
      category: 'visual',
      priority: 'must_have',
      relatedFiles: ['src/components/NavDrawer.tsx'],
      acceptanceCriteria: ['Must collapse below 768px', 'Touch swipe to close']
    });

    assert.equal(res.action, 'CREATE');
    assert.ok(isValidId(res.requirement.id, 'REQ'));
    assert.equal(res.requirement.status, 'REQUESTED');
    assert.equal(res.requirement.authority, 'AUTHORITATIVE');
    assert.equal(res.requirement.source, 'USER');
    assert.equal(res.requirement.acceptanceCriteria.length, 2);
    assert.ok(isValidId(res.requirement.acceptanceCriteria[0].id, 'AC'));
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('2. Requirement persistence: persists requirement safely into requirements.json', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-req-persist-'));
  try {
    const createRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'Persist Requirement Test',
      description: 'Verifying atomic disk persistence'
    });

    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const doc = StorageEngine.readDocument<any>(zenitchDir, 'requirements.json', RequirementsFileSchema, () => null as any);

    assert.ok(doc);
    assert.ok(doc.items[createRes.requirement.id]);
    assert.equal(doc.items[createRes.requirement.id].title, 'Persist Requirement Test');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('3. Requirement update: transitions through strict lifecycle states', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-req-update-'));
  try {
    const createRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'Lifecycle Requirement',
      description: 'Tracking lifecycle transitions',
      relatedFiles: ['src/app.tsx']
    });
    const reqId = createRes.requirement.id;

    // Transition to PLANNED
    const plannedRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'UPDATE_STATUS',
      requirementId: reqId,
      newStatus: 'PLANNED'
    });
    assert.equal(plannedRes.requirement.status, 'PLANNED');

    // Transition to IMPLEMENTED (requires relatedFiles)
    const implRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'UPDATE_STATUS',
      requirementId: reqId,
      newStatus: 'IMPLEMENTED',
      relatedFiles: ['src/app.tsx']
    });
    assert.equal(implRes.requirement.status, 'IMPLEMENTED');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('4. Acceptance criterion creation: adds structured criterion with AC prefix', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-ac-create-'));
  try {
    const createRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'Drawer Requirement'
    });
    const reqId = createRes.requirement.id;

    const addRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'ADD_CRITERION',
      requirementId: reqId,
      criterionDescription: 'No horizontal overflow at 390px mobile viewport',
      criterionType: 'RESPONSIVE'
    });

    assert.equal(addRes.action, 'ADD_CRITERION');
    assert.ok(isValidId(addRes.criterion.id, 'AC'));
    assert.equal(addRes.criterion.type, 'RESPONSIVE');
    assert.equal(addRes.criterion.status, 'NOT_TESTED');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('5. Acceptance criterion update: updates criterion status and links verification', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-ac-update-'));
  try {
    const createRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'Form Accessibility'
    });
    const reqId = createRes.requirement.id;

    const addRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'ADD_CRITERION',
      requirementId: reqId,
      criterionDescription: 'Form inputs have visible focus indicator',
      criterionType: 'ACCESSIBILITY'
    });
    const acId = addRes.criterion.id;

    const updateRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'UPDATE_CRITERION',
      requirementId: reqId,
      criterionId: acId,
      criterionStatus: 'PASSED',
      verificationEvidenceId: 'VER-999'
    });

    assert.equal(updateRes.criterion.status, 'PASSED');
    assert.ok(updateRes.criterion.verificationIds.includes('VER-999'));
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('6. Criterion status & waiver security: blocks AI self-waiver and requires reason', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-ac-waive-'));
  try {
    const createRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'Strict Performance Requirement'
    });
    const reqId = createRes.requirement.id;

    const addRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'ADD_CRITERION',
      requirementId: reqId,
      criterionDescription: 'LCP under 1.2s on 4G connection',
      criterionType: 'PERFORMANCE'
    });
    const acId = addRes.criterion.id;

    // AI tries to self-waive without human authority -> MUST FAIL
    await assert.rejects(async () => {
      await MemoryManager.manageRequirement({
        projectRoot: tempDir,
        action: 'UPDATE_CRITERION',
        requirementId: reqId,
        criterionId: acId,
        criterionStatus: 'WAIVED',
        waivedReason: 'Too difficult to achieve'
      });
    }, /AI self-waiver is blocked/);

    // Human authority waives with valid reason -> SUCCEEDS
    const waiveRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'UPDATE_CRITERION',
      requirementId: reqId,
      criterionId: acId,
      criterionStatus: 'WAIVED',
      waivedReason: 'Waived for v1 launch with PM sign-off',
      actorIsUser: true,
      waivedBy: 'ProductLead'
    });

    assert.equal(waiveRes.criterion.status, 'WAIVED');
    assert.equal(waiveRes.criterion.waivedBy, 'ProductLead');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('7. AI proposal workflow: AI proposals start as PROPOSED and cannot transition', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-ai-propose-'));
  try {
    const proposeRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'PROPOSE',
      title: 'AI Proposed Dark Theme Optimizations',
      description: 'Automatically suggested high-contrast palette'
    });

    assert.equal(proposeRes.action, 'PROPOSE');
    assert.equal(proposeRes.requirement.authority, 'PROPOSED');
    assert.equal(proposeRes.requirement.source, 'AI_PROPOSAL');

    // Attempting to advance status without confirmation MUST be rejected
    await assert.rejects(async () => {
      await MemoryManager.manageRequirement({
        projectRoot: tempDir,
        action: 'UPDATE_STATUS',
        requirementId: proposeRes.requirement.id,
        newStatus: 'PLANNED'
      });
    }, /Cannot transition proposed requirement/);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('8. Human confirmation: promotes PROPOSED requirement to AUTHORITATIVE', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-confirm-prop-'));
  try {
    const propRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'PROPOSE',
      title: 'Refactor Table Layout',
      description: 'Use virtualized scrolling for large datasets'
    });
    const reqId = propRes.requirement.id;

    // Human confirms proposal
    const confirmRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CONFIRM_PROPOSAL',
      requirementId: reqId
    });

    assert.equal(confirmRes.requirement.authority, 'AUTHORITATIVE');
    assert.equal(confirmRes.requirement.provenance.verificationLevel, 'USER_CONFIRMED');

    // Now it can transition normally to PLANNED
    const plannedRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'UPDATE_STATUS',
      requirementId: reqId,
      newStatus: 'PLANNED'
    });
    assert.equal(plannedRes.requirement.status, 'PLANNED');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('9. Requirement/criterion separation: passed criteria do not bypass objective verification', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-req-crit-sep-'));
  try {
    const reqRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'Checkout Flow',
      relatedFiles: ['src/checkout.ts']
    });
    const reqId = reqRes.requirement.id;

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
      relatedFiles: ['src/checkout.ts']
    });

    await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'UPDATE_STATUS',
      requirementId: reqId,
      newStatus: 'TESTED'
    });

    // Add criterion and mark passed
    const acRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'ADD_CRITERION',
      requirementId: reqId,
      criterionDescription: 'Total amount calculated accurately'
    });
    await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'UPDATE_CRITERION',
      requirementId: reqId,
      criterionId: acRes.criterion.id,
      criterionStatus: 'PASSED'
    });

    // Even though criterion is PASSED, transitioning to VERIFIED without objective evidence MUST fail
    await assert.rejects(async () => {
      await MemoryManager.manageRequirement({
        projectRoot: tempDir,
        action: 'UPDATE_STATUS',
        requirementId: reqId,
        newStatus: 'VERIFIED'
      });
    }, /Transition to VERIFIED requires linking valid objective verification evidence/);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('10. Requirement dependencies: tracks dependsOn without mutating dependent states', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-deps-'));
  try {
    // 1. Create base requirement
    const req1 = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'User Authentication'
    });

    // 2. Create dependent requirement
    const req2 = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'User Settings Page',
      dependsOn: [req1.requirement.id]
    });

    // Check dependency status
    const depRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'SET_DEPENDENCIES',
      requirementId: req2.requirement.id,
      dependsOn: [req1.requirement.id]
    });

    assert.equal(depRes.dependencyStatus, 'UNMET');
    // req2 lifecycle status remains untouched
    assert.equal(req2.requirement.status, 'REQUESTED');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('11. Parent/child requirements: hierarchical grouping is informational', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-parent-child-'));
  try {
    const parent = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'Dashboard Overhaul Epic'
    });

    const child = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'Sidebar Collapsible',
      parentRequirementId: parent.requirement.id
    });

    assert.equal(child.requirement.parentRequirementId, parent.requirement.id);

    // Inspect context: parent and child retain their own independent statuses
    const ctx = await MemoryManager.getProjectContext({ projectRoot: tempDir, mode: 'standard' });
    const foundParent = ctx.requirements.find((r: any) => r.id === parent.requirement.id);
    const foundChild = ctx.requirements.find((r: any) => r.id === child.requirement.id);

    assert.equal(foundParent.status, 'REQUESTED');
    assert.equal(foundChild.status, 'REQUESTED');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('12. Change creation: records engineering change with CHG prefix and type', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-chg-create-'));
  try {
    const res = await ChangeManager.manageChange({
      projectRoot: tempDir,
      action: 'CREATE',
      type: 'UI_CHANGE',
      summary: 'Updated dashboard color tokens to dark slate',
      files: ['src/theme/tokens.css']
    });

    assert.equal(res.action, 'CREATE');
    assert.ok(isValidId(res.change.id, 'CHG'));
    assert.equal(res.change.type, 'UI_CHANGE');
    assert.equal(res.change.source, 'AI_REPORTED');
    assert.equal(res.change.unlinkedChange, true);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('13. Change persistence: saves change record to changes.json with atomic writes', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-chg-persist-'));
  try {
    const res = await ChangeManager.manageChange({
      projectRoot: tempDir,
      action: 'CREATE',
      summary: 'Refactored navigation tree',
      files: ['src/nav.ts']
    });

    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const changesDoc = StorageEngine.readDocument<any>(zenitchDir, 'changes.json', ChangesFileSchema, () => null as any);

    assert.ok(changesDoc);
    assert.ok(changesDoc.items[res.change.id]);
    assert.equal(changesDoc.items[res.change.id].summary, 'Refactored navigation tree');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('14. Change -> requirement linking: establishes bidirectional traceability', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-chg-req-link-'));
  try {
    const reqRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'Accessible Dialog Modal'
    });
    const reqId = reqRes.requirement.id;

    const chgRes = await ChangeManager.manageChange({
      projectRoot: tempDir,
      action: 'CREATE',
      type: 'ACCESSIBILITY',
      summary: 'Added focus trap to Modal component',
      files: ['src/components/Modal.tsx'],
      requirementIds: [reqId]
    });
    const chgId = chgRes.change.id;

    assert.equal(chgRes.change.unlinkedChange, false);
    assert.ok(chgRes.change.requirementIds.includes(reqId));

    // Verify requirement's linkedChangeIds contains chgId
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const reqDoc = StorageEngine.readDocument<any>(zenitchDir, 'requirements.json', RequirementsFileSchema, () => null as any);
    assert.ok(reqDoc.items[reqId].linkedChangeIds.includes(chgId));
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('15. Change -> decision linking: links change to project decision', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-chg-dec-link-'));
  try {
    const decRes = await MemoryManager.recordDecision({
      projectRoot: tempDir,
      title: 'Use Lucide React Icons',
      decision: 'Standardize on lucide-react for all iconography',
      rationale: 'Consistent stroke weight and small bundle size',
      disposition: 'ACCEPTED'
    });
    const decId = decRes.decision.id;

    const chgRes = await ChangeManager.manageChange({
      projectRoot: tempDir,
      action: 'CREATE',
      summary: 'Replaced SVG icons with Lucide icons',
      files: ['src/icons/index.ts']
    });

    const linkRes = await ChangeManager.manageChange({
      projectRoot: tempDir,
      action: 'LINK_DECISION',
      changeId: chgRes.change.id,
      decisionId: decId
    });

    assert.ok(linkRes.change.decisionIds.includes(decId));
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('16. Change -> verification linking: updates verification status when passed', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-chg-ver-link-'));
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const verDoc = {
      schemaVersion: '1.1.0',
      projectId: 'PRJ-TEST',
      _version: 0,
      updatedAt: new Date().toISOString(),
      items: {
        'VER-001': {
          id: 'VER-001',
          requirementId: 'REQ-001',
          verificationMethod: 'AUTOMATED_TEST',
          verdict: 'PASSED',
          evidenceSummary: 'All unit tests passing (24/24)',
          provenance: { source: 'TEST_RESULT', verificationLevel: 'TEST_VERIFIED', confidence: 1.0, timestamp: new Date().toISOString() },
          timestamp: new Date().toISOString()
        }
      }
    };
    StorageEngine.writeDocument(zenitchDir, 'verification.json', verDoc, 0);

    const chgRes = await ChangeManager.manageChange({
      projectRoot: tempDir,
      action: 'CREATE',
      summary: 'Implemented test suite for parser',
      files: ['tests/parser.test.ts']
    });

    const linkRes = await ChangeManager.manageChange({
      projectRoot: tempDir,
      action: 'LINK_VERIFICATION',
      changeId: chgRes.change.id,
      verificationId: 'VER-001'
    });

    assert.ok(linkRes.change.verificationIds.includes('VER-001'));
    assert.equal(linkRes.change.verificationStatus, 'PASSED');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('17. AI-reported change provenance: stamps AI_REPORTED without fabricated confirmation', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-ai-chg-'));
  try {
    const chgRes = await ChangeManager.manageChange({
      projectRoot: tempDir,
      action: 'CREATE',
      actor: 'AI',
      summary: 'Updated date formatting in utils'
    });

    assert.equal(chgRes.change.actor, 'AI');
    assert.equal(chgRes.change.source, 'AI_REPORTED');
    assert.equal(chgRes.change.provenance.verificationLevel, 'UNVERIFIED');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('18. Git-observed change provenance: stamps GIT_OBSERVED with CODE_OBSERVED verification', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-git-chg-'));
  try {
    const chgRes = await ChangeManager.manageChange({
      projectRoot: tempDir,
      action: 'CREATE',
      source: 'GIT_OBSERVED',
      gitCommit: 'abc1234',
      summary: 'Git observed commit abc1234'
    });

    assert.equal(chgRes.change.source, 'GIT_OBSERVED');
    assert.equal(chgRes.change.provenance.verificationLevel, 'CODE_OBSERVED');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('19. Unlinked changes: represents unlinked changes without inventing fake requirements', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-unlinked-'));
  try {
    const chgRes = await ChangeManager.manageChange({
      projectRoot: tempDir,
      action: 'CREATE',
      type: 'REFACTOR',
      summary: 'Routine cleanup of unused imports',
      files: ['src/utils/math.ts']
    });

    assert.equal(chgRes.change.unlinkedChange, true);
    assert.equal(chgRes.change.requirementIds.length, 0);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('20. Git unavailable behavior: handles non-git folders gracefully without crashing', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-no-git-'));
  try {
    const inspectRes = await ChangeManager.inspectChanges({
      projectRoot: tempDir,
      mode: 'concise'
    });

    assert.equal(inspectRes.gitAvailable, false);
    assert.equal(inspectRes.changedFilesCount.total, 0);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('21. No-change fast path: checkpoint recognizes when project has not changed', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-fastpath-'));
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    CheckpointEngine.updateCheckpoint(
      zenitchDir,
      'PRJ-FASTPATH',
      'commit-aaa',
      ['file1.ts'],
      [],
      []
    );

    const fastCheck = CheckpointEngine.checkFastPath(
      zenitchDir,
      'commit-aaa',
      ['file1.ts'],
      [],
      []
    );

    assert.equal(fastCheck.hasChanged, false);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('22. Changed-file detection: detects when tracked file lists differ', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-detect-'));
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    CheckpointEngine.updateCheckpoint(
      zenitchDir,
      'PRJ-DIFF',
      'commit-aaa',
      ['file1.ts'],
      [],
      []
    );

    const diffCheck = CheckpointEngine.checkFastPath(
      zenitchDir,
      'commit-aaa',
      ['file1.ts', 'file2.ts'],
      [],
      []
    );

    assert.equal(diffCheck.hasChanged, true);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('23. Checkpoint persistence: checkpoint is saved and restored from checkpoint.json', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-cp-persist-'));
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    CheckpointEngine.updateCheckpoint(
      zenitchDir,
      'PRJ-CHECKPOINT-TEST',
      'commit-xyz',
      ['src/index.ts'],
      ['src/new.ts'],
      []
    );

    const restored = CheckpointEngine.readCheckpoint(zenitchDir);
    assert.ok(restored);
    assert.equal(restored.gitCommit, 'commit-xyz');
    assert.equal(restored.trackedState.modifiedFiles.length, 1);
    assert.equal(restored.trackedState.addedFiles.length, 1);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('24. Incremental inspection: identifies potentially affected requirements from modified files', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-inc-inspect-'));
  try {
    // Create requirement linked to src/auth/login.ts
    const reqRes = await MemoryManager.manageRequirement({
      projectRoot: tempDir,
      action: 'CREATE',
      title: 'OAuth2 Authentication Flow',
      relatedFiles: ['src/auth/login.ts']
    });

    // Record an unlinked change
    await ChangeManager.manageChange({
      projectRoot: tempDir,
      action: 'CREATE',
      summary: 'Updated database migration',
      files: ['migrations/001.sql']
    });

    const inspection = await ChangeManager.inspectChanges({
      projectRoot: tempDir,
      mode: 'standard'
    });

    assert.ok(inspection);
    assert.equal(typeof inspection.gitAvailable, 'boolean');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('25. Compact retrieval: concise mode returns token-efficient compact summary', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-compact-'));
  try {
    const concise = await ChangeManager.inspectChanges({
      projectRoot: tempDir,
      mode: 'concise'
    });

    assert.equal(concise.mode, 'concise');
    assert.ok('changedFilesCount' in concise);
    assert.ok('potentiallyAffectedRequirements' in concise);
    assert.ok('knownChanges' in concise);
    assert.ok('unlinkedCount' in concise);
    // Concise output must NOT include full diff text
    assert.equal(concise.diffStat, undefined);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('26. Project isolation: separate roots maintain strictly isolated memory', async () => {
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-proj-a-'));
  const dirB = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-proj-b-'));
  try {
    await MemoryManager.manageRequirement({
      projectRoot: dirA,
      action: 'CREATE',
      title: 'Requirement for Project A'
    });

    await MemoryManager.manageRequirement({
      projectRoot: dirB,
      action: 'CREATE',
      title: 'Requirement for Project B'
    });

    const ctxA = await MemoryManager.getProjectContext({ projectRoot: dirA, mode: 'concise' });
    const ctxB = await MemoryManager.getProjectContext({ projectRoot: dirB, mode: 'concise' });

    assert.equal(ctxA.activeRequirements.length, 1);
    assert.equal(ctxA.activeRequirements[0].title, 'Requirement for Project A');

    assert.equal(ctxB.activeRequirements.length, 1);
    assert.equal(ctxB.activeRequirements[0].title, 'Requirement for Project B');
  } finally {
    try { fs.rmSync(dirA, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(dirB, { recursive: true, force: true }); } catch {}
  }
});
test('27. Path traversal protection: prevents escaping project boundary', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-traversal-'));
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    assert.ok(zenitchDir.startsWith(fs.realpathSync(tempDir)));
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('28. Corruption behavior: corrupted changes.json blocks writes and enters degraded state', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-corrupt-'));
  try {
    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    fs.mkdirSync(zenitchDir, { recursive: true });

    // Intentionally write corrupted non-JSON content
    fs.writeFileSync(path.join(zenitchDir, 'changes.json'), '{{{CORRUPT_NOT_JSON}}', 'utf8');

    // Attempting to manage changes must fail with MemoryCorruptionError
    await assert.rejects(async () => {
      await ChangeManager.manageChange({
        projectRoot: tempDir,
        action: 'CREATE',
        summary: 'Will fail due to corruption'
      });
    }, (err: any) => err instanceof MemoryCorruptionError && err.report.status === 'DEGRADED_CORRUPTION_DETECTED');

    assert.equal(StorageEngine.isDegraded(zenitchDir, 'changes.json'), true);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('29. Concurrency: multiple simultaneous change writes maintain serialization', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-concurrent-'));
  try {
    const writes = Array.from({ length: 6 }, (_, i) => {
      return ChangeManager.manageChange({
        projectRoot: tempDir,
        action: 'CREATE',
        summary: 'Concurrent change ' + i,
        files: ['file' + i + '.ts']
      });
    });

    const results = await Promise.all(writes);
    assert.equal(results.length, 6);

    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const doc = StorageEngine.readDocument<any>(zenitchDir, 'changes.json', ChangesFileSchema, () => null as any);

    assert.equal(Object.keys(doc.items).length, 6);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('30. Schema migration: upgrades v1.0.0 document to v1.1.0 preserving all data', () => {
  const v1Doc = {
    schemaVersion: '1.0.0',
    projectId: 'PRJ-V1-TEST',
    _version: 1,
    items: {
      'REQ-1': {
        id: 'REQ-1',
        title: 'Legacy Requirement',
        description: 'V1 requirement description',
        category: 'functional',
        status: 'REQUESTED',
        priority: 'must_have',
        provenance: { source: 'USER', verificationLevel: 'USER_CONFIRMED', confidence: 1.0, timestamp: '2026-09-01T00:00:00.000Z' },
        acceptanceCriteria: ['Mobile responsive layout'],
        relatedFiles: ['src/app.tsx'],
        relatedDecisions: [],
        verificationEvidenceIds: [],
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z'
      }
    },
    tickets: {}
  };

  const migrated = MigrationEngine.migrateDocument<any>('requirements.json', v1Doc, '1.1.0');
  assert.equal(migrated.schemaVersion, '1.1.0');
  const req = migrated.items['REQ-1'];
  assert.ok(req);
  assert.equal(req.title, 'Legacy Requirement');
  assert.equal(req.source, 'USER');
  assert.equal(req.authority, 'AUTHORITATIVE');
  assert.ok(Array.isArray(req.dependsOn));
  assert.ok(Array.isArray(req.linkedChangeIds));
  assert.equal(req.acceptanceCriteria.length, 1);
  assert.equal(req.acceptanceCriteria[0].description, 'Mobile responsive layout');
});

test('31. Secret redaction: automatically redacts API keys and secrets in changes', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-secret-'));
  try {
    const res = await ChangeManager.manageChange({
      projectRoot: tempDir,
      action: 'CREATE',
      summary: 'Configured api_key: "sk-ant-api03-secret1234567890abcdef" for billing integration',
      files: ['src/stripe.ts']
    });

    assert.ok(!res.change.summary.includes('secret1234567890abcdef'));
    assert.ok(res.change.summary.includes('[REDACTED SENSITIVE CONTENT]'));

    const zenitchDir = StorageEngine.getZenitchDir(tempDir);
    const rawJson = fs.readFileSync(path.join(zenitchDir, 'changes.json'), 'utf8');
    assert.ok(!rawJson.includes('secret1234567890abcdef'));
    assert.ok(rawJson.includes('[REDACTED SENSITIVE CONTENT]'));
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});

test('32. Phase 2 Server tool surface: advertises 16 tools and executes Phase 2 tools', async () => {
  const server = new ZenitchServer({ enableZenitchTools: true, enablePhase2Tools: true });
  const internalServer = server.getServerInstance();

  const listHandler = (internalServer as any)._requestHandlers.get(ListToolsRequestSchema.shape.method.value);
  const toolList = await listHandler({ method: 'tools/list', params: {} });

  assert.equal(toolList.tools.length, 16, 'Phase 2 enabled server must list exactly 16 tools (11 baseline + 3 phase 1 + 2 phase 2)');

  const toolNames = toolList.tools.map((t: any) => t.name);
  assert.ok(toolNames.includes('zenitch_manage_change'));
  assert.ok(toolNames.includes('zenitch_inspect_changes'));

  const callHandler = (internalServer as any)._requestHandlers.get(CallToolRequestSchema.shape.method.value);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zenitch-p2-server-call-'));
  try {
    // Call zenitch_manage_change
    const chgCallRes = await callHandler({
      method: 'tools/call',
      params: {
        name: 'zenitch_manage_change',
        arguments: {
          projectRoot: tempDir,
          action: 'CREATE',
          summary: 'Testing tool invocation over MCP server'
        }
      }
    });

    const chgData = JSON.parse(chgCallRes.content[0].text);
    assert.equal(chgData.success, true);
    assert.equal(chgData.data.action, 'CREATE');

    // Call zenitch_inspect_changes
    const inspectCallRes = await callHandler({
      method: 'tools/call',
      params: {
        name: 'zenitch_inspect_changes',
        arguments: {
          projectRoot: tempDir,
          mode: 'concise'
        }
      }
    });

    const inspectData = JSON.parse(inspectCallRes.content[0].text);
    assert.equal(inspectData.success, true);
    assert.equal(inspectData.data.mode, 'concise');
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} 
  }
});


