"use client";

import React from "react";

export function Navbar() {
  return (
    <header className="nav-header">
      <div className="content-wrapper">
        <div className="nav-inner">
          {/* Logo brand matching the screenshot */}
          <a href="#" className="nav-brand">
            <div className="nav-brand-icon">
              <img src="/veto-logo.jpg" alt="Veto" />
            </div>
            <span className="nav-brand-title">
              veto<span className="nav-brand-dot">•</span>
            </span>
          </a>

          {/* Center Navigation Links */}
          <nav>
            <ul className="nav-links">
              <li>
                <a href="#features" className="nav-link">
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="nav-link">
                  How it works
                </a>
              </li>
              <li>
                <a href="#simulator" className="nav-link">
                  Live Demo
                </a>
              </li>
              <li>
                <a href="#faq" className="nav-link">
                  FAQ
                </a>
              </li>
            </ul>
          </nav>

          {/* Right Action Buttons */}
          <div className="nav-actions">
            <a
              href="https://github.com/cridiv/veto"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-github-link"
            >
              Github
            </a>
            <a href="#simulator" className="btn-launch-pill">
              Launch App ↗
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
