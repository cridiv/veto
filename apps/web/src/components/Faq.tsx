"use client";

import React, { useState } from "react";

const FAQS = [
  {
    q: "How does Veto differ from prompt guardrails or system instructions?",
    a: "Prompt guardrails rely on the LLM obeying instructions, which attackers easily bypass via prompt injection, jailbreaks, or cognitive overload. Veto intercepts at the runtime boundary: code cannot run unless the firewall explicitly validates the call.",
  },
  {
    q: "What is the latency overhead on tool calls?",
    a: "Veto's policy engine and SQLite sliding-window quota checks run in sub-millisecond latency (typically 0.3ms to 0.6ms), introducing zero noticeable delay into your agent's execution loop.",
  },
  {
    q: "How does Fail-Closed Zero-Trust work in practice?",
    a: "If an action is not explicitly whitelisted in veto-policy.yaml, or if the firewall returns an unexpected response, the client throws a VetoBlockError and terminates the tool call immediately. No tool can execute by accident.",
  },
  {
    q: "Can Veto be used with OpenAI, LangChain, or the Vercel AI SDK?",
    a: "Yes. Veto operates at the JavaScript/TypeScript function boundary using veto.wrap(). It is agnostic to whatever framework orchestrates the LLM.",
  },
  {
    q: "How does human approval pausing work in asynchronous environments?",
    a: "When a tool triggers an approval rule, veto.wrap() suspends execution and polls the ticket in SQLite. An operator approves via the dashboard or REST API, which automatically resumes execution without crashing the agent process.",
  },
];

export function Faq() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section id="faq" className="faq-section">
      <div className="content-wrapper">
        <div className="section-header">
          <span className="section-eyebrow">Frequently Asked Questions</span>
          <h2 className="section-title">Everything You Need to Know</h2>
        </div>

        <div className="faq-list">
          {FAQS.map((faq, idx) => (
            <div key={idx} className="faq-item">
              <button onClick={() => toggle(idx)} className="faq-question">
                <span>{faq.q}</span>
                <span style={{ fontSize: "20px", color: "var(--text-muted)" }}>
                  {openIdx === idx ? "−" : "+"}
                </span>
              </button>
              {openIdx === idx && <div className="faq-answer">{faq.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
