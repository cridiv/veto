import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { PolicyConfigSchema, type PolicyConfig, type PolicyRule } from '@veto/contracts';

@Injectable()
export class PolicyLoaderService implements OnModuleInit {
  private readonly logger = new Logger(PolicyLoaderService.name);
  private policyConfig: PolicyConfig = { policies: [] };

  onModuleInit() {
    this.loadPolicy();
  }

  /**
   * Loads and validates the policy file from disk on startup.
   */
  loadPolicy(): PolicyConfig {
    const policyPath = this.resolvePolicyPath();
    this.logger.log(`Loading security policy from: ${policyPath}`);

    if (!fs.existsSync(policyPath)) {
      this.logger.warn(`No policy file found at ${policyPath}. Using empty default policy.`);
      this.policyConfig = { policies: [] };
      return this.policyConfig;
    }

    const rawContent = fs.readFileSync(policyPath, 'utf8');
    return this.loadPolicyFromString(rawContent);
  }

  /**
   * Parses raw YAML text and validates it against PolicyConfigSchema.
   */
  loadPolicyFromString(rawYaml: string): PolicyConfig {
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
    return this.policyConfig;
  }

  /**
   * Returns the global context dictionary (e.g. known_recipients).
   */
  getContext(): Record<string, unknown> {
    return this.policyConfig.context ?? {};
  }

  /**
   * Retrieves all rules matching an incoming action (by agent and tool),
   * preserving the exact top-to-bottom priority order from the YAML file.
   */
  getRulesForAction(agentId: string, tool: string): PolicyRule[] {
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
   * 2. veto/policy.yaml (if exists in root)
   * 3. veto/policy.example.yaml (fallback)
   */
  private resolvePolicyPath(): string {
    if (process.env.VETO_POLICY_PATH) {
      return path.resolve(process.env.VETO_POLICY_PATH);
    }

    // Check workspace root
    const rootDir = path.resolve(process.cwd(), '..');
    const rootPolicy = path.resolve(rootDir, 'policy.yaml');
    if (fs.existsSync(rootPolicy)) return rootPolicy;

    const rootExample = path.resolve(rootDir, 'policy.example.yaml');
    if (fs.existsSync(rootExample)) return rootExample;

    // Check backend directory
    const localPolicy = path.resolve(process.cwd(), 'policy.yaml');
    if (fs.existsSync(localPolicy)) return localPolicy;

    return path.resolve(process.cwd(), 'policy.example.yaml');
  }
}
