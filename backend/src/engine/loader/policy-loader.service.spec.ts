import { Test, TestingModule } from '@nestjs/testing';
import { PolicyLoaderService } from './policy-loader.service';
import * as path from 'path';

describe('PolicyLoaderService', () => {
  let service: PolicyLoaderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PolicyLoaderService],
    }).compile();

    service = module.get<PolicyLoaderService>(PolicyLoaderService);
  });

  it('loads and validates veto-policy.yaml from disk', () => {
    process.env.VETO_POLICY_PATH = path.resolve(process.cwd(), '../veto-policy.yaml');
    const config = service.loadPolicy();

    expect(config.policies.length).toBeGreaterThan(0);
    expect(config.context?.known_recipients).toContain('PHCN');
  });

  it('parses valid YAML string and extracts policies', () => {
    const validYaml = `
context:
  allowed_hosts:
    - "api.internal"

policies:
  - name: allow-reads
    match:
      tools: [read_file]
    action: allow

  - name: block-rm
    match:
      agents: [acme-assistant]
      tools: [delete_files]
    when: 'not args.path startswith "/workspace/"'
    action: block
`;

    const config = service.loadPolicyFromString(validYaml);
    expect(config.policies).toHaveLength(2);
    expect(config.policies[0].name).toBe('allow-reads');
    expect(config.policies[1].action).toBe('block');
  });

  it('fails fast on malformed YAML syntax', () => {
    const brokenYaml = `
policies:
  - name: unclosed quote
    match: "broken
`;
    expect(() => service.loadPolicyFromString(brokenYaml)).toThrow(/YAML syntax error/);
  });

  it('fails fast on invalid policy schema (bad action enum)', () => {
    const invalidSchemaYaml = `
policies:
  - name: invalid-rule
    match:
      tools: [read_inbox]
    action: definitely_not_valid
`;
    expect(() => service.loadPolicyFromString(invalidSchemaYaml)).toThrow(/Policy configuration validation failed/);
  });

  it('filters rules matching specific agent and tool in priority order', () => {
    const multiRuleYaml = `
policies:
  - name: global-read-allow
    match:
      tools: [read_file]
    action: allow

  - name: acme-transfer-spend
    match:
      agents: [acme-assistant]
      tools: [transfer_money]
    quota:
      window: 1h
      sum: args.amount
      max: 300000
    action: require_approval

  - name: devops-only-rm
    match:
      agents: [devops-bot]
      tools: [delete_files]
    action: block

  - name: fallback-judge
    match:
      tools: ["*"]
    action: judge
`;

    service.loadPolicyFromString(multiRuleYaml);

    // 1. acme-assistant calling transfer_money should get acme-transfer-spend and fallback-judge
    const acmeTransferRules = service.getRulesForAction('acme-assistant', 'transfer_money');
    expect(acmeTransferRules.map((r) => r.name)).toEqual(['acme-transfer-spend', 'fallback-judge']);

    // 2. devops-bot calling transfer_money should ONLY get fallback-judge (not acme's rule)
    const devopsTransferRules = service.getRulesForAction('devops-bot', 'transfer_money');
    expect(devopsTransferRules.map((r) => r.name)).toEqual(['fallback-judge']);

    // 3. Anyone calling read_file gets global-read-allow and fallback-judge
    const readRules = service.getRulesForAction('anyone', 'read_file');
    expect(readRules.map((r) => r.name)).toEqual(['global-read-allow', 'fallback-judge']);
  });
});
