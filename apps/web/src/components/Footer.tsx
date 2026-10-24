"use client";

import React from "react";

export function Footer() {
  return (
    <footer className="footer-container">
      <div className="content-wrapper">
        <div className="footer-inner">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontWeight: "700", color: "#ffffff", fontSize: "16px" }}>
              veto<span style={{ color: "var(--accent-cyan)" }}>•</span>
            </span>
            <span className="footer-copy">
              © 2026 Veto Security Systems. Open-source runtime firewall for AI agents.
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <span className="status-badge">
              <span className="pulse-indicator"></span>
              All Firewall Systems Operational
            </span>
            <a
              href="https://github.com/cridiv/veto"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-github-link"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
