"use client";

import React, { useState } from "react";

const STEPS = [
  {
    step: "01",
    title: "Scaffold Your Project",
    desc: "Run the Veto CLI scaffolder to generate your config and policy files in one command.",
    tabTitle: "terminal",
    code: `# Install the client SDK
pnpm add @veto/sdk

# Initialize Veto in your project
npx veto init

✔ Created: veto.config.ts
✔ Created: veto-policy.yaml
🎉 Veto is configured and ready!`,
  },
  {
    step: "02",
    title: "Declare Security Policies",
    desc: "Write declarative rules in veto-policy.yaml. Top-to-bottom evaluation with zero-trust default-deny.",
    tabTitle: "veto-policy.yaml",
    code: `policies:
  # 1. Allow read tools
  - name: allow-read
    match:
      tools: [read_inbox, search_docs]
    action: allow

  # 2. Escalate large financial transfers
  - name: high-value-transfers
    match:
      tools: [transfer_money]
    when: "args.amount > 100000"
    action: require_approval

  # 3. Fail-Closed Zero-Trust default
  - name: default-deny-unwhitelisted
    match:
      tools: ["*"]
    action: block`,
  },
  {
    step: "03",
    title: "Wrap Tools in One Line",
    desc: "Wrap your agent's dictionary of tools with veto.wrap(). Every invocation is intercepted transparently.",
    tabTitle: "src/veto.config.ts",
    code: `import { Veto } from '@veto/sdk';
import { rawTools } from './tools';

export const veto = new Veto({
  baseUrl: process.env.VETO_URL || 'http://localhost:3000',
  agentId: 'acme-assistant',
});

// The ONLY interface exported to your AI Agent:
export const tools = veto.wrap(rawTools);`,
  },
];

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section id="how-it-works" className="how-it-works-section">
      <div className="content-wrapper">
        <div className="section-header">
          <span className="section-eyebrow">Developer Workflow</span>
          <h2 className="section-title">Up and Running in 3 Steps</h2>
          <p className="section-desc">
            Integrate Veto into any TypeScript agent in under five minutes.
          </p>
        </div>

        {/* Step Selector Buttons */}
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          {STEPS.map((s, idx) => (
            <button
              key={s.step}
              onClick={() => setActiveStep(idx)}
              className={`scenario-btn ${activeStep === idx ? "active" : ""}`}
              style={{ maxWidth: "260px" }}
            >
              <span className="scenario-label">
                <span style={{ color: "var(--accent-cyan)" }}>Step {s.step}</span>
              </span>
              <span>{s.title}</span>
            </button>
          ))}
        </div>

        {/* Code Preview Container */}
        <div className="code-preview-container">
          <div className="code-header-bar">
            <div className="window-dots">
              <span className="window-dot" style={{ background: "#ef4444" }}></span>
              <span className="window-dot" style={{ background: "#eab308" }}></span>
              <span className="window-dot" style={{ background: "#22c55e" }}></span>
            </div>
            <span className="window-tab-title">{STEPS[activeStep].tabTitle}</span>
            <span style={{ width: "40px" }}></span>
          </div>
          <pre className="code-content-block">
            <code>{STEPS[activeStep].code}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
