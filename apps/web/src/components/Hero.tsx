"use client";

import React from "react";

export function Hero() {
  return (
    <section className="hero-section">
      <div className="content-wrapper">
        {/* Main Headline */}
        <h1 className="hero-headline">
          Enforce AI agent security in{" "}
          <span className="hero-headline-highlight">
            any runtime, completely fail-closed
          </span>
        </h1>

        {/* Subtitle */}
        <p className="hero-subtitle">
          Intercept autonomous agent tool calls with sub-millisecond latency,
          zero-trust policies, and instant human-in-the-loop approvals without
          writing a single line of security logic in your agent.
        </p>

        {/* Action Buttons Group */}
        <div className="hero-cta-group">
          <a href="#simulator" className="btn-cta-primary">
            Launch App →
          </a>
          <a
            href="https://github.com/cridiv/veto"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-cta-secondary"
          >
            View on GitHub ↗
          </a>
        </div>

        {/* Feature Badges Row (Exact design from screenshot) */}
        <div className="hero-badges-row">
          <div className="hero-badge-pill">
            <span className="badge-dot dot-green"></span>
            <span>Sub-millisecond Interception (&lt; 1ms)</span>
          </div>

          <div className="hero-badge-pill">
            <span className="badge-dot dot-blue"></span>
            <span>Zero-Trust Fail-Closed Invariant</span>
          </div>

          <div className="hero-badge-pill">
            <span className="badge-dot dot-orange"></span>
            <span>Sliding-Window Quotas • Taint Tracking</span>
          </div>
        </div>
      </div>
    </section>
  );
}
