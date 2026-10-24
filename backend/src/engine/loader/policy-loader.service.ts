import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { PolicyConfigSchema, type PolicyConfig, type PolicyRule } from '@veto/contracts';

@Injectable()
export class PolicyLoaderService implements OnModuleInit {
  private readonly logger = new Logger(PolicyLoaderService.name);
  private policyConfig: PolicyConfig = { policies: [] };
  private lastMtimeMs = 0;
  private isLoadedFromString = false;

  onModuleInit() {
    this.loadPolicy();
  }

  /**
   * Reloads policy if modified on disk.
   */
  reloadIfModified(): void {
    if (this.isLoadedFromString) return;
    const policyPath = this.resolvePolicyPath();
    if (!fs.existsSync(policyPath)) return;
    try {
      const stat = fs.statSync(policyPath);
      if (stat.mtimeMs !== this.lastMtimeMs) {
        this.logger.log(`Policy file changed on disk (mtime: ${stat.mtimeMs}), reloading...`);
        this.loadPolicy();
      }
    } catch {
      // Ignore concurrent read errors
    }
  }

  /**
   * Loads and validates the policy file from disk on startup.
   */
  loadPolicy(): PolicyConfig {
    this.isLoadedFromString = false;
    const policyPath = this.resolvePolicyPath();
    this.logger.log(`Loading security policy from: ${policyPath}`);

    if (!fs.existsSync(policyPath)) {
      this.logger.warn(`No policy file found at ${policyPath}. Using empty default policy.`);
      this.policyConfig = { policies: [] };
      return this.policyConfig;
    }

    try {
      const stat = fs.statSync(policyPath);
      this.lastMtimeMs = stat.mtimeMs;
    } catch {
      // Ignore stat error
    }

    const rawContent = fs.readFileSync(policyPath, 'utf8');
    return this.loadPolicyFromStringInternal(rawContent);
  }

  /**
   * Parses raw YAML text and validates it against PolicyConfigSchema.
   */
  loadPolicyFromString(rawYaml: string): PolicyConfig {
    this.isLoadedFromString = true;
    return this.loadPolicyFromStringInternal(rawYaml);
  }

  private loadPolicyFromStringInternal(rawYaml: string): PolicyConfig {
    let parsedJson: unknown;
    try {
      parsedJson = yaml.load(rawYaml);
    } catch (err: any) {
      throw new Error(`YAML syntax error in policy file: ${err.message}`);
    }

    const parseResult = PolicyConfigSchema.safeParse(parsedJson);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((issue) => `[${issue.path.join('.') || 'root'}]: ${issue.message}`)
        .join('; ');
      const errorMsg = `Policy configuration validation failed: ${issues}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    this.policyConfig = parseResult.data;
    this.logger.log(`Successfully loaded ${this.policyConfig.policies.length} security policies.`);
    return this.policyConfig;
  }

  /**
   * Returns all policies in memory.
   */
  getConfig(): PolicyConfig {
    this.reloadIfModified();
    return this.policyConfig;
  }

  /**
   * Returns the global context dictionary (e.g. known_recipients).
   */
  getContext(): Record<string, unknown> {
    this.reloadIfModified();
    return this.policyConfig.context ?? {};
  }

  /**
   * Retrieves all rules matching an incoming action (by agent and tool),
   * preserving the exact top-to-bottom priority order from the YAML file.
   */
  getRulesForAction(agentId: string, tool: string): PolicyRule[] {
    this.reloadIfModified();
    return this.policyConfig.policies.filter((rule) => {
      // 1. Agent Match: Matches if agents is omitted, contains "*", or contains agentId
      const agentList = rule.match.agents ?? ['*'];
      const agentMatches = agentList.includes('*') || agentList.includes(agentId);
      if (!agentMatches) return false;

      // 2. Tool Match: Matches if tools contains "*" or contains tool
      const toolMatches = rule.match.tools.includes('*') || rule.match.tools.includes(tool);
      return toolMatches;
    });
  }

  /**
   * Resolves the policy file path in order:
   * 1. process.env.VETO_POLICY_PATH
   * 2. veto/veto-policy.yaml (workspace root)
   * 3. veto/policy.yaml (fallback)
   */
  private resolvePolicyPath(): string {
    if (process.env.VETO_POLICY_PATH) {
      return path.resolve(process.env.VETO_POLICY_PATH);
    }

    // Check workspace root
    const rootDir = path.resolve(process.cwd(), '..');
    const rootVetoPolicy = path.resolve(rootDir, 'veto-policy.yaml');
    if (fs.existsSync(rootVetoPolicy)) return rootVetoPolicy;

    const rootPolicy = path.resolve(rootDir, 'policy.yaml');
    if (fs.existsSync(rootPolicy)) return rootPolicy;

    // Check current directory
    const localVetoPolicy = path.resolve(process.cwd(), 'veto-policy.yaml');
    if (fs.existsSync(localVetoPolicy)) return localVetoPolicy;

    return path.resolve(process.cwd(), 'policy.yaml');
  }
}
