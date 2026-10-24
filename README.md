# Lintel

**Autonomous Property Bill & Accounts Payable System of Work**  
Built at **Cal Hacks 13.0** (October 23–25, 2026 · Palace of Fine Arts, San Francisco)

---

## Overview

Property management and multi-site operations teams process thousands of recurring utility and vendor bills (electric, water, gas, trash, HVAC, maintenance) across dozens of properties and meters. Bills arrive as inconsistent PDFs and scans, service addresses rarely match legal property names, and manual AP review misses duplicate billings, meter spikes, and vendor anomalies.

**Lintel** is an autonomous corporate AP System of Work that takes property and vendor bills from raw document intake to verified, auditable settlement:

1. **Multi-Format Bill Intake & Extraction** — Extracts vendor details, invoice numbers, billing periods, meter readings, line items, and totals with field-level confidence scores and source citations.
2. **Property, Meter & GL Entity Resolution** — Resolves messy service addresses and account numbers against a multi-property portfolio and chart of accounts.
3. **Deterministic Financial Guardrails** — Enforces pure-code duplicate detection, historical usage/amount spike checks, and policy approval thresholds with zero LLM hallucination risk.
4. **Human-in-the-Loop Exception Queue** — Automatically processes clean, high-confidence bills while escalating low-confidence fields, billing spikes, or unknown vendors to an operator review queue.
5. **Immutable Audit Log & Settlement** — Records every AI proposal, deterministic check, and human decision in a persistent, auditable log before releasing payment.

---

## Repository Structure

```text
lintel/
├── CLAUDE.md        # Behavioral guidelines & core domain rules for coding agents
├── AGENTS.md        # Context reading order & architectural invariants
├── README.md        # Project overview
└── context/         # Master spec, architecture context, workflow rules, and lane specs
```

---

## Team

- **Pranil Lama** ([@Pranillama](https://github.com/Pranillama))
- **Anmol Pandey**
- **Piyush Singh**
