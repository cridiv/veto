"use client";

import React, { useState } from "react";

interface Scenario {
  id: string;
  name: string;
  tool: string;
  args: Record<string, unknown>;
  description: string;
  expectedVerdict: "allow" | "needs_approval" | "block";
  layer: string;
  ruleName: string;
  reason: string;
  latencyMs: number;
}

const SCENARIOS: Scenario[] = [
  {
    id: "read-inbox",
    name: "Read Inbox (Read-Only Tool)",
    tool: "read_inbox",
    args: { limit: 10 },
    description: "Agent inspects unread support messages",
    expectedVerdict: "allow",
    layer: "rules",
    ruleName: "allow-read-tools",
    reason: "Permitted read-only operation with zero friction",
    latencyMs: 0.38,
  },
  {
    id: "transfer-allowed",
    name: "Transfer ₦45k to PHCN",
    tool: "transfer_money",
    args: { to: "PHCN", amount: 45000 },
    description: "Approved vendor transfer under single & 24h quotas",
    expectedVerdict: "allow",
    layer: "quota",
    ruleName: "daily-spending-quota",
    reason: "Transfer within ₦500,000 rolling 24h quota & verified vendor",
    latencyMs: 0.42,
  },
  {
    id: "transfer-approval",
    name: "Transfer ₦250k (High-Value Escalation)",
    tool: "transfer_money",
    args: { to: "Offshore Shell Corp", amount: 250000 },
    description: "Exceeds ₦100k threshold & unverified recipient",
    expectedVerdict: "needs_approval",
    layer: "rules",
    ruleName: "high-value-transfers",
    reason: "Transfer exceeds ₦100,000 or recipient not in approved_vendors list",
    latencyMs: 0.51,
  },
  {
    id: "block-sandbox",
    name: "Delete /etc/passwd (Sandbox Escape)",
    tool: "delete_files",
    args: { path: "/etc/passwd" },
    description: "Attempted file deletion outside /workspace/",
    expectedVerdict: "block",
    layer: "rules",
    ruleName: "block-sandbox-escape",
    reason: "Security Violation: Destructive action outside permitted /workspace/ sandbox",
    latencyMs: 0.35,
  },
  {
    id: "block-bash",
    name: "Execute Bash: whoami (Zero-Trust)",
    tool: "execute_bash",
    args: { cmd: "whoami" },
    description: "Unwhitelisted tool invocation",
    expectedVerdict: "block",
    layer: "zero_trust",
    ruleName: "default-deny-unwhitelisted-actions",
    reason: "Zero-Trust Barrier: Tool 'execute_bash' is not whitelisted in veto-policy.yaml",
    latencyMs: 0.29,
  },
];

export function Simulator() {
  const [selectedScenario, setSelectedScenario] = useState<Scenario>(SCENARIOS[0]);
  const [approvalResolved, setApprovalResolved] = useState<"approved" | "denied" | null>(null);

  const handleSelect = (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setApprovalResolved(null);
  };

  const isApproval = selectedScenario.expectedVerdict === "needs_approval";
  const currentVerdict =
    isApproval && approvalResolved === "approved"
      ? "allow"
      : isApproval && approvalResolved === "denied"
      ? "block"
      : selectedScenario.expectedVerdict;

  return (
    <section id="simulator" className="simulator-section">
      <div className="content-wrapper">
        <div className="simulator-card">
          {/* Header */}
          <div className="simulator-header">
            <div className="simulator-title-group">
              <h3>
                ⚡ Interactive Firewall Interceptor
                <span className="live-badge">
                  <span className="pulse-indicator"></span>
                  Live Simulator
                </span>
              </h3>
              <p>
                Click any agent tool call below to observe real-time policy evaluation and layer execution.
              </p>
            </div>
          </div>

          {/* Scenario Buttons */}
          <div className="scenario-buttons-grid">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelect(s)}
                className={`scenario-btn ${selectedScenario.id === s.id ? "active" : ""}`}
              >
                <span className="scenario-label">
                  <span>{s.tool}()</span>
                  <span
                    style={{
                      fontSize: "11px",
                      textTransform: "uppercase",
                      color:
                        s.expectedVerdict === "allow"
                          ? "var(--accent-emerald)"
                          : s.expectedVerdict === "needs_approval"
                          ? "var(--accent-amber)"
                          : "var(--accent-rose)",
                    }}
                  >
                    {s.expectedVerdict.replace("_", " ")}
                  </span>
                </span>
                <span>{s.name}</span>
              </button>
            ))}
          </div>

          {/* Result Box */}
          <div className="simulator-result-box">
            <div className="result-status-row">
              <div
                className={`verdict-tag ${
                  currentVerdict === "allow"
                    ? "verdict-allow"
                    : currentVerdict === "needs_approval"
                    ? "verdict-approval"
                    : "verdict-block"
                }`}
              >
                {currentVerdict === "allow" && "✔ ALLOW: EXECUTED"}
                {currentVerdict === "needs_approval" && "⏳ NEEDS OPERATOR APPROVAL"}
                {currentVerdict === "block" && "🚫 BLOCKED: FAIL-CLOSED"}
              </div>

              <div className="latency-metric">
                Engine Latency: <span>{selectedScenario.latencyMs}ms</span>
              </div>
            </div>

            {/* Evaluation Layers Pipeline */}
            <div className="pipeline-layers">
              <span className={`pipeline-step ${selectedScenario.layer === "zero_trust" ? "active-layer" : ""}`}>
                Layer 1: Zero-Trust
              </span>
              <span className="pipeline-arrow">→</span>
              <span className={`pipeline-step ${selectedScenario.layer === "quota" ? "active-layer" : ""}`}>
                Layer 2: Quota
              </span>
              <span className="pipeline-arrow">→</span>
              <span className={`pipeline-step ${selectedScenario.layer === "rules" ? "active-layer" : ""}`}>
                Layer 3: Policy Rules
              </span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step">Layer 4: Risk</span>
              <span className="pipeline-arrow">→</span>
              <span className="pipeline-step">Layer 5: Taint</span>
            </div>

            {/* Details */}
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "8px" }}>
              <strong>Matched Rule:</strong>{" "}
              <code style={{ color: "var(--accent-cyan)" }}>{selectedScenario.ruleName}</code>
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginTop: "4px" }}>
              <strong>Reason:</strong> {selectedScenario.reason}
            </p>

            {/* Approval Interactive Banner */}
            {isApproval && (
              <div className="approval-interactive-banner">
                <div>
                  <h4 style={{ color: "var(--accent-amber)", fontSize: "14px", fontWeight: "700" }}>
                    Human-in-the-Loop Ticket: ticket-8f4b-2201
                  </h4>
                  <p style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "2px" }}>
                    Agent paused. Waiting for operator decision to resume or terminate tool execution.
                  </p>
                </div>
                <div className="approval-btn-group">
                  <button
                    onClick={() => setApprovalResolved("approved")}
                    className="btn-approve"
                    disabled={approvalResolved === "approved"}
                  >
                    {approvalResolved === "approved" ? "✔ Approved" : "Approve Ticket"}
                  </button>
                  <button
                    onClick={() => setApprovalResolved("denied")}
                    className="btn-deny"
                    disabled={approvalResolved === "denied"}
                  >
                    {approvalResolved === "denied" ? "✕ Denied" : "Deny Ticket"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
