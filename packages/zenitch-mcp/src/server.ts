import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema, Tool } from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from './utils/zod-to-json.js';
import {
  ProductAnalysisInputSchema,
  ProjectInspectionInputSchema,
  PolicyEvaluationInputSchema,
  DesignSystemGenerationInputSchema,
  ComponentResolutionInputSchema,
  PageAuditInputSchema,
  VisualRegressionInputSchema,
  AnimationBudgetInputSchema,
  GetProjectContextInputSchema,
  RecordDecisionInputSchema,
  ManageRequirementInputSchema,
  ManageChangeInputSchema,
  InspectChangesInputSchema,
  VerifyInputSchema,
  InspectVerificationInputSchema,
  CheckReleaseReadinessInputSchema,
  InspectReleaseReadinessInputSchema,
  AnalyzeChangeImpactInputSchema,
  InspectImpactInputSchema,
  AnalyzeArchitectureInputSchema,
  InspectArchitectureInputSchema,
  ExperiencePlannerInputSchema
} from './schemas/index.js';
import { MemoryManager } from './memory/memory-manager.js';
import { VerificationManager } from './verification/verification-manager.js';
import { ReadinessManager } from './readiness/readiness-manager.js';
import { ImpactManager } from './impact/impact-manager.js';
import { ArchitectureManager } from './architecture/architecture-manager.js';
import { ZenitchResponse, ApprovalRequest } from './types.js';
import { analyzeProductContext } from './intelligence/product-analyzer.js';
import { inspectProject } from './intelligence/project-inspector.js';
import { evaluateDesignPolicy } from './policy/policy-evaluator.js';
import { generateDesignSystem } from './intelligence/design-system-generator.js';
import { resolveComponent } from './intelligence/component-resolver.js';
import { auditPageQuality } from './audit/page-auditor.js';
import { compareVisualRegression } from './audit/visual-comparator.js';
import { evaluateAnimationBudget } from './animation/budget-evaluator.js';
import { planProductExperience } from './intelligence/experience-planner.js';

export interface ServerConfig {
  requireApprovalForChanges?: boolean;
  enableZenitchTools?: boolean;
  enablePhase2Tools?: boolean;
  enablePhase3Tools?: boolean;
  enablePhase4Tools?: boolean;
  enablePhase5Tools?: boolean;
  enablePhase6Tools?: boolean;
  logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
}

export class ZenitchServer {
  private server: Server;
  private pendingApprovals: Map<string, ApprovalRequest> = new Map();
  private config: ServerConfig;
  private startTime: number = Date.now();

  constructor(config: ServerConfig = {}) {
    this.config = {
      requireApprovalForChanges: config.requireApprovalForChanges ?? true,
      enableZenitchTools: config.enableZenitchTools ?? false,
      enablePhase2Tools: config.enablePhase2Tools ?? (process.env.ZENITCH_PHASE2 === 'true'),
      enablePhase3Tools: config.enablePhase3Tools ?? (process.env.ZENITCH_PHASE3 === 'true'),
      enablePhase4Tools: config.enablePhase4Tools ?? (process.env.ZENITCH_PHASE4 === 'true'),
      enablePhase5Tools: config.enablePhase5Tools ?? (process.env.ZENITCH_PHASE5 === 'true'),
      enablePhase6Tools: config.enablePhase6Tools ?? (process.env.ZENITCH_PHASE6 === 'true'),
      logLevel: config.logLevel ?? 'INFO'
    };

    this.server = new Server(
      {
        name: 'zenitch-mcp-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.registerHandlers();
  }

  public log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string, meta?: unknown) {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    if (levels.indexOf(level) >= levels.indexOf(this.config.logLevel || 'INFO')) {
      const timestamp = new Date().toISOString();
      const metaStr = meta ? ` | ${JSON.stringify(meta)}` : '';
      console.error(`[${timestamp}] [ZENITCH-${level}] ${message}${metaStr}`);
    }
  }

  private registerHandlers() {
    // 1. List Tools Request Handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools: Tool[] = [
        {
          name: 'zenitch_ping',
          description: 'Health check tool verifying Zenitch MCP server readiness and uptime.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'zenitch_get_system_info',
          description: 'Get operational status of all Zenitch subsystems, registered policies, and active approval modes.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'zenitch_analyze_product_context',
          description: 'Product Intelligence: Analyze product domain, user ergonomics, and functional goals before proposing UI.',
          inputSchema: zodToJsonSchema(ProductAnalysisInputSchema)
        },
        {
          name: 'zenitch_inspect_project',
          description: 'Project Intelligence: Inspect local codebase framework, existing components, and design tokens to prevent breakage.',
          inputSchema: zodToJsonSchema(ProjectInspectionInputSchema)
        },
        {
          name: 'zenitch_evaluate_design_policy',
          description: 'Design Policy Engine: Evaluate proposed UI/markup against anti-cliché, anti-bloat, and accessibility rules.',
          inputSchema: zodToJsonSchema(PolicyEvaluationInputSchema)
        },
        {
          name: 'zenitch_generate_design_system',
          description: 'Design System Intelligence: Generate or preserve accessible design tokens tailored to product context.',
          inputSchema: zodToJsonSchema(DesignSystemGenerationInputSchema)
        },
        {
          name: 'zenitch_resolve_component',
          description: 'Component Intelligence: Recommend reusing existing components before generating new code.',
          inputSchema: zodToJsonSchema(ComponentResolutionInputSchema)
        },
        {
          name: 'zenitch_audit_page_quality',
          description: 'Quality Auditing: Audit running page for overflow, contrast, interactive hit targets, and broken forms.',
          inputSchema: zodToJsonSchema(PageAuditInputSchema)
        },
        {
          name: 'zenitch_compare_visual_regression',
          description: 'Visual Regression: Perform screenshot comparison to detect unintended UI layout shifts.',
          inputSchema: zodToJsonSchema(VisualRegressionInputSchema)
        },
        {
          name: 'zenitch_evaluate_animation_budget',
          description: 'Animation Intelligence: Enforce hardware budgets, clamped DPR, and reduced-motion fallbacks.',
          inputSchema: zodToJsonSchema(AnimationBudgetInputSchema)
        },
        {
          name: 'zenitch_plan_product_experience',
          description: 'Product Experience Intelligence: Plan adaptive application architecture, candidate views, and layout hierarchy before generating code. Use during initial application scaffolding or major feature planning. Do NOT use for bug fixes, single components, or minor refactoring.',
          inputSchema: zodToJsonSchema(ExperiencePlannerInputSchema)
        }
      ];

      if (this.config.enableZenitchTools || process.env.ZENITCH_ENABLED === 'true') {
        tools.push(
          {
            name: 'zenitch_get_project_context',
            description: 'Persistent Memory: Retrieve project context, active negative constraints, user preferences, and pending requirements.',
            inputSchema: zodToJsonSchema(GetProjectContextInputSchema)
          },
          {
            name: 'zenitch_record_decision',
            description: 'Decision Ledger: Record accepted or rejected architectural/design decisions and auto-generate negative project constraints.',
            inputSchema: zodToJsonSchema(RecordDecisionInputSchema)
          },
          {
            name: 'zenitch_manage_requirement',
            description: 'Requirement Lifecycle: Manage strict requirement states, link verification evidence, and request/resolve human approvals.',
            inputSchema: zodToJsonSchema(ManageRequirementInputSchema)
          },
          ...(this.config.enablePhase2Tools || process.env.ZENITCH_PHASE2 === 'true'
            ? [
                {
                  name: 'zenitch_manage_change',
                  description: 'Change Intelligence: Record, update, and link engineering changes to requirements, decisions, and verification evidence.',
                  inputSchema: zodToJsonSchema(ManageChangeInputSchema)
                },
                {
                  name: 'zenitch_inspect_changes',
                  description: 'Change Inspection: Inspect Git status, detect changed files, potentially affected requirements, and unlinked modifications.',
                  inputSchema: zodToJsonSchema(InspectChangesInputSchema)
                }
              ]
            : []),
          ...(this.config.enablePhase3Tools || process.env.ZENITCH_PHASE3 === 'true'
            ? [
                {
                  name: 'zenitch_verify',
                  description: 'Runtime & Functional Verification: Execute progressive static, runtime, or responsive verification for requirements and acceptance criteria.',
                  inputSchema: zodToJsonSchema(VerifyInputSchema)
                },
                {
                  name: 'zenitch_inspect_verification',
                  description: 'Verification Inspection: Inspect concise, standard, or detailed verification records and evidence history for requirements and acceptance criteria.',
                  inputSchema: zodToJsonSchema(InspectVerificationInputSchema)
                }
              ]
            : []),
          ...(this.config.enablePhase4Tools || process.env.ZENITCH_PHASE4 === 'true'
            ? [
                {
                  name: 'zenitch_check_release_readiness',
                  description: 'Release Readiness: Perform deterministic multi-category release readiness assessment across requirements, verification, build, tests, security, configuration, dependencies, deployment, documentation, and source control.',
                  inputSchema: zodToJsonSchema(CheckReleaseReadinessInputSchema)
                },
                {
                  name: 'zenitch_inspect_release_readiness',
                  description: 'Release Inspection: Inspect structured category breakdown, blocking/warning findings, and remediation guidance for release readiness.',
                  inputSchema: zodToJsonSchema(InspectReleaseReadinessInputSchema)
                }
              ]
            : []),
          ...(this.config.enablePhase5Tools || process.env.ZENITCH_PHASE5 === 'true'
            ? [
                {
                  name: 'zenitch_analyze_change_impact',
                  description: 'Engineering Impact Intelligence: Analyze a specific change to determine affected files, components, routes, requirements, criteria, risk levels, and recommended verifications.',
                  inputSchema: zodToJsonSchema(AnalyzeChangeImpactInputSchema)
                },
                {
                  name: 'zenitch_inspect_impact',
                  description: 'Engineering Impact Inspection: Retrieve previously evaluated change impact assessments with deterministic filters (changeId, requirementId, route, component, riskLevel).',
                  inputSchema: zodToJsonSchema(InspectImpactInputSchema)
                }
              ]
            : []),
          ...(this.config.enablePhase6Tools || process.env.ZENITCH_PHASE6 === 'true'
            ? [
                {
                  name: 'zenitch_analyze_architecture',
                  description: 'Architecture Intelligence: Perform deterministic architectural health analysis across dependency cycles, layer rules, complexity boundaries, swallowed exceptions, and unreferenced dependencies.',
                  inputSchema: zodToJsonSchema(AnalyzeArchitectureInputSchema)
                },
                {
                  name: 'zenitch_inspect_architecture',
                  description: 'Architecture Inspection: Inspect architectural assessment findings with deterministic filtering by category, severity, and ruleId with concise, standard, or detailed formatting.',
                  inputSchema: zodToJsonSchema(InspectArchitectureInputSchema)
                }
              ]
            : [])
        );
      }

      return { tools };
    });

    // 2. Call Tool Request Handler with Structured Error Handling & Schema Validation
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};
      const execStart = performance.now();

      this.log('INFO', `Tool invocation: ${toolName}`, { args });

      try {
        let result: unknown;

        switch (toolName) {
          case 'zenitch_ping': {
            result = {
              status: 'HEALTHY',
              uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
              version: '1.0.0',
              timestamp: new Date().toISOString()
            };
            break;
          }

          case 'zenitch_get_system_info': {
            result = {
              server: 'Zenitch Design Intelligence MCP',
              version: '1.0.0',
              subsystems: [
                { id: 'product_intelligence', name: 'Product Intelligence', status: 'ACTIVE_STEP2' },
                { id: 'project_intelligence', name: 'Project Intelligence', status: 'ACTIVE_STEP2' },
                { id: 'design_policy_engine', name: 'Design Policy Engine', status: 'ACTIVE_STEP3' },
                { id: 'design_system_intelligence', name: 'Design System Intelligence', status: 'ACTIVE_STEP4' },
                { id: 'component_intelligence', name: 'Component Intelligence', status: 'ACTIVE_STEP4' },
                { id: 'quality_auditing', name: 'Browser Quality Auditing', status: 'ACTIVE_STEP5' },
                { id: 'visual_regression', name: 'Visual Regression', status: 'ACTIVE_STEP5' },
                { id: 'animation_intelligence', name: 'Animation & Hardware Budget Engine', status: 'ACTIVE_STEP6' },
                ...(this.config.enableZenitchTools || process.env.ZENITCH_ENABLED === 'true'
                  ? [{ id: 'project_memory', name: 'Persistent Project Memory & Decision Foundation', status: 'ACTIVE_STAGE1' },
                { id: 'runtime_verification', name: 'Runtime & Functional Verification', status: 'ACTIVE_PHASE3' },
                { id: 'release_readiness', name: 'Deployment & Release Readiness Intelligence', status: 'ACTIVE_PHASE4' },
                { id: 'engineering_impact', name: 'Engineering Impact Intelligence', status: 'ACTIVE_PHASE5' },
                { id: 'architecture_intelligence', name: 'Architecture & Engineering Intelligence', status: 'ACTIVE_PHASE6' }]
                  : [])
              ],
              approvalModeActive: this.config.requireApprovalForChanges
            };
            break;
          }

          case 'zenitch_analyze_product_context': {
            const parsed = ProductAnalysisInputSchema.parse(args);
            result = analyzeProductContext(parsed);
            break;
          }

          case 'zenitch_inspect_project': {
            const parsed = ProjectInspectionInputSchema.parse(args);
            result = inspectProject(parsed);
            break;
          }

          case 'zenitch_evaluate_design_policy': {
            const parsed = PolicyEvaluationInputSchema.parse(args);
            result = evaluateDesignPolicy(parsed);
            break;
          }

          case 'zenitch_generate_design_system': {
            const parsed = DesignSystemGenerationInputSchema.parse(args);
            result = generateDesignSystem(parsed);
            break;
          }

          case 'zenitch_resolve_component': {
            const parsed = ComponentResolutionInputSchema.parse(args);
            result = resolveComponent(parsed);
            break;
          }

          case 'zenitch_audit_page_quality': {
            const parsed = PageAuditInputSchema.parse(args);
            result = await auditPageQuality(parsed);
            break;
          }

          case 'zenitch_compare_visual_regression': {
            const parsed = VisualRegressionInputSchema.parse(args);
            result = compareVisualRegression(parsed);
            break;
          }

          case 'zenitch_evaluate_animation_budget': {
            const parsed = AnimationBudgetInputSchema.parse(args);
            result = evaluateAnimationBudget(parsed);
            break;
          }

          case 'zenitch_plan_product_experience': {
            const parsed = ExperiencePlannerInputSchema.parse(args);
            result = planProductExperience(parsed);
            break;
          }

          case 'zenitch_get_project_context': {
            const parsed = GetProjectContextInputSchema.parse(args);
            result = await MemoryManager.getProjectContext(parsed);
            break;
          }

          case 'zenitch_record_decision': {
            const parsed = RecordDecisionInputSchema.parse(args);
            result = await MemoryManager.recordDecision(parsed);
            break;
          }

          case 'zenitch_manage_requirement': {
            const parsed = ManageRequirementInputSchema.parse(args);
            result = await MemoryManager.manageRequirement(parsed);
            break;
          }

          case 'zenitch_manage_change': {
            const parsed = ManageChangeInputSchema.parse(args);
            result = await MemoryManager.manageChange(parsed);
            break;
          }

          case 'zenitch_inspect_changes': {
            const parsed = InspectChangesInputSchema.parse(args);
            result = await MemoryManager.inspectChanges(parsed);
            break;
          }

          case 'zenitch_verify': {
            const parsed = VerifyInputSchema.parse(args);
            result = await VerificationManager.verify(parsed);
            break;
          }

          case 'zenitch_inspect_verification': {
            const parsed = InspectVerificationInputSchema.parse(args);
            result = await VerificationManager.inspectVerification(parsed);
            break;
          }

          case 'zenitch_check_release_readiness': {
            const parsed = CheckReleaseReadinessInputSchema.parse(args);
            result = await ReadinessManager.checkReleaseReadiness(parsed);
            break;
          }

          case 'zenitch_inspect_release_readiness': {
            const parsed = InspectReleaseReadinessInputSchema.parse(args);
            result = await ReadinessManager.inspectReleaseReadiness(parsed);
            break;
          }

          case 'zenitch_analyze_change_impact': {
            const parsed = AnalyzeChangeImpactInputSchema.parse(args);
            result = await ImpactManager.analyzeChangeImpact(parsed);
            break;
          }

                    case 'zenitch_analyze_architecture': {
            const parsed = AnalyzeArchitectureInputSchema.parse(args);
            result = await ArchitectureManager.analyzeArchitecture(parsed);
            break;
          }

          case 'zenitch_inspect_architecture': {
            const parsed = InspectArchitectureInputSchema.parse(args);
            result = await ArchitectureManager.inspectArchitecture(parsed);
            break;
          }

          case 'zenitch_inspect_impact': {
            const parsed = InspectImpactInputSchema.parse(args);
            result = await ImpactManager.inspectImpact(parsed);
            break;
          }



          // Backward-compatible alias mappings
          case 'zenitch_ping': {
            result = {
              status: 'HEALTHY',
              uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
              version: '1.0.0',
              timestamp: new Date().toISOString()
            };
            break;
          }

          case 'zenitch_get_system_info': {
            result = {
              server: 'Zenitch Design Intelligence MCP',
              version: '1.0.0',
              subsystems: [
                { id: 'product_intelligence', name: 'Product Intelligence', status: 'ACTIVE_STEP2' },
                { id: 'project_intelligence', name: 'Project Intelligence', status: 'ACTIVE_STEP2' },
                { id: 'design_policy_engine', name: 'Design Policy Engine', status: 'ACTIVE_STEP3' },
                { id: 'design_system_intelligence', name: 'Design System Intelligence', status: 'ACTIVE_STEP4' },
                { id: 'component_intelligence', name: 'Component Intelligence', status: 'ACTIVE_STEP4' },
                { id: 'quality_auditing', name: 'Browser Quality Auditing', status: 'ACTIVE_STEP5' },
                { id: 'visual_regression', name: 'Visual Regression', status: 'ACTIVE_STEP5' },
                { id: 'animation_intelligence', name: 'Animation & Hardware Budget Engine', status: 'ACTIVE_STEP6' },
                { id: 'project_memory', name: 'Persistent Project Memory & Decision Foundation', status: 'ACTIVE_STAGE1' },
                { id: 'runtime_verification', name: 'Runtime & Functional Verification', status: 'ACTIVE_PHASE3' },
                { id: 'release_readiness', name: 'Deployment & Release Readiness Intelligence', status: 'ACTIVE_PHASE4' },
                { id: 'engineering_impact', name: 'Engineering Impact Intelligence', status: 'ACTIVE_PHASE5' }
              ],
              approvalModeActive: this.config.requireApprovalForChanges
            };
            break;
          }

          default:
            throw new Error(`Unknown Zenitch tool: ${toolName}`);
        }

        const executionMs = Math.round(performance.now() - execStart);
        const response: ZenitchResponse = {
          success: true,
          data: result,
          telemetry: {
            executionMs,
            timestamp: new Date().toISOString()
          }
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2)
            }
          ]
        };
      } catch (err: unknown) {
        const executionMs = Math.round(performance.now() - execStart);
        const errorMessage = err instanceof Error ? err.message : String(err);
        this.log('ERROR', `Tool execution failed: ${toolName}`, { error: errorMessage });

        const response: ZenitchResponse = {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_ERROR',
            message: errorMessage,
            details: (err as any).errors || undefined
          },
          telemetry: {
            executionMs,
            timestamp: new Date().toISOString()
          }
        };

        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2)
            }
          ]
        };
      }
    });
  }

  public async connect(transport: any) {
    this.log('INFO', 'Connecting Zenitch MCP server to transport...');
    await this.server.connect(transport);
    this.log('INFO', 'Zenitch MCP server transport connected successfully.');
  }

  public getServerInstance(): Server {
    return this.server;
  }
}

