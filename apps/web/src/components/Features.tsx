"use client";

import React from "react";

const FEATURES = [
  {
    icon: "🛡️",
    title: "Zero Security Code in the Agent",
    desc: "Your agent code contains zero regexes, zero if/else checks, and zero prompt pleadings. Security is declared purely in veto-policy.yaml.",
  },
  {
    icon: "🔒",
    title: "Strict Security Ratchet Invariant",
    desc: "Evaluation progresses across layers: Mode → Quotas → Rules → Risk → Taint. A later layer can keep a verdict or make it stricter, never looser.",
  },
  {
    icon: "⚡",
    title: "Sub-Millisecond Interception",
    desc: "Engine checks execute in sub-millisecond latency. Zero perceptible overhead on agent response times.",
  },
  {
    icon: "📊",
    title: "Sliding-Window Quotas & Budgets",
    desc: "Persistent SQLite WAL limits frequency or sum metrics (e.g. ₦500k over 24h) to eliminate looping runaway costs.",
  },
  {
    icon: "👤",
    title: "Automated Human Approvals",
    desc: "High-risk actions pause execution automatically, polling until an operator approves or denies from the dashboard or REST API.",
  },
  {
    icon: "🧬",
    title: "Taint Tracking & Provenance",
    desc: "Tracks the flow of untrusted external content (emails, web scrapes) into sensitive tool arguments to neutralize indirect prompt injections.",
  },
];

export function Features() {
  return (
    <section id="features" className="features-section">
      <div className="content-wrapper">
        <div className="section-header">
          <span className="section-eyebrow">Enterprise Security</span>
          <h2 className="section-title">Engineered for Fail-Closed Certainty</h2>
          <p className="section-desc">
            Veto is built on mathematical invariants rather than prompt-based hope.
          </p>
        </div>

        <div className="features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon-wrapper">{f.icon}</div>
              <h4>{f.title}</h4>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
