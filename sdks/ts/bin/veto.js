#!/usr/bin/env node

/**
 * Veto CLI — Project Initializer & Scaffolder
 * Generates veto.config.ts and veto-policy.yaml on install or when running `npx veto init`.
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const VETO_CONFIG_TEMPLATE = `import { Veto } from '@veto/sdk';

/**
 * Veto AI Agent Security Firewall Configuration
 * Enforces policies defined in veto-policy.yaml at runtime.
 */
export const veto = new Veto({
  baseUrl: process.env.VETO_URL || 'http://localhost:3000',
  agentId: process.env.VETO_AGENT_ID || 'acme-assistant',
});

/**
 * Universal Tool Wrapper:
 * Wrap your agent's tools in one line so every action is checked against veto-policy.yaml.
 *
 * Example:
 *   import { veto } from './veto.config';
 *   export const tools = veto.wrap(myRawTools);
 */
export const wrapTools = <T extends Record<string, (args: any) => any>>(tools: T): T => {
  return veto.wrap(tools);
};
`;

const VETO_POLICY_TEMPLATE = `# ------------------------------------------------------------------------------
# Veto Security Policies
# Top-to-bottom evaluation. Unwhitelisted actions are blocked by Zero-Trust default.
# ------------------------------------------------------------------------------

context:
  known_recipients:
    - "PHCN"
    - "Supplier Ltd"

policies:
  # 1. Allow read-only operations with zero friction
  - name: allow-read-tools
    description: "Allow read tools with zero friction"
    match:
      tools:
        - read_inbox
        - read_file
        - list_files
    action: allow

  # 2. Require approval for high single-value transfers
  - name: high-value-transfers
    description: "Require human approval for single transfers exceeding ₦100,000"
    match:
      tools: [transfer_money]
    when: "args.amount > 100000"
    action: require_approval

  # 3. Prevent destructive operations outside sandbox
  - name: block-sandbox-escape
    description: "Prevent destructive file deletions outside permitted workspace"
    match:
      tools: [delete_files]
    when: 'not args.path startswith "/workspace/"'
    action: block

  # 4. Zero-Trust Default-Deny: Any tool not explicitly whitelisted is blocked
  - name: default-deny-unwhitelisted-actions
    description: "Zero-Trust default: Block any tool call not explicitly whitelisted"
    match:
      tools: ["*"]
    action: block
`;

function init(targetDir = process.cwd()) {
  console.log(`\n${colors.bright}${colors.cyan}🛡️  Veto — AI Agent Security Firewall Setup${colors.reset}`);

  const configPath = path.join(targetDir, 'veto.config.ts');
  const policyPath = path.join(targetDir, 'veto-policy.yaml');

  let createdConfig = false;
  let createdPolicy = false;

  // 1. Create veto.config.ts
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, VETO_CONFIG_TEMPLATE, 'utf8');
    console.log(`  ${colors.green}✔ Created:${colors.reset} veto.config.ts`);
    createdConfig = true;
  } else {
    console.log(`  ${colors.gray}ℹ Exists:${colors.reset}  veto.config.ts (skipped)`);
  }

  // 2. Create veto-policy.yaml
  if (!fs.existsSync(policyPath)) {
    fs.writeFileSync(policyPath, VETO_POLICY_TEMPLATE, 'utf8');
    console.log(`  ${colors.green}✔ Created:${colors.reset} veto-policy.yaml`);
    createdPolicy = true;
  } else {
    console.log(`  ${colors.gray}ℹ Exists:${colors.reset}  veto-policy.yaml (skipped)`);
  }

  if (createdConfig || createdPolicy) {
    console.log(`\n${colors.bright}${colors.green}🎉 Veto is configured and ready!${colors.reset}`);
    console.log(`${colors.gray}Next: Define your policies in veto-policy.yaml and wrap your tools with veto.wrap().${colors.reset}\n`);
  } else {
    console.log(`\n${colors.gray}Veto files are already present in ${targetDir}.${colors.reset}\n`);
  }
}

// CLI entry point
const args = process.argv.slice(2);
const firstArg = args[0] || 'init';

let targetDir = process.cwd();

if (firstArg === 'init') {
  targetDir = args[1] ? path.resolve(args[1]) : process.cwd();
  init(targetDir);
} else if (firstArg === 'postinstall') {
  if (__dirname.includes('node_modules')) {
    const parts = __dirname.split('node_modules');
    targetDir = parts[0];
  }
  init(targetDir);
} else if (fs.existsSync(firstArg) || firstArg.startsWith('.') || firstArg.startsWith('/')) {
  targetDir = path.resolve(firstArg);
  init(targetDir);
} else {
  console.log(`Unknown command: ${firstArg}. Use 'veto init'.`);
}
