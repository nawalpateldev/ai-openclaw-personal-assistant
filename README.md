# OpenClaw: Smart, Secure & Robust Autonomous Personal Assistant

**OpenClaw** is an enterprise-grade, extensible, multi-channel autonomous assistant designed for personal and business automation. It combines proactive intelligence, strict security boundaries, human-in-the-loop (HITL) safety, and resilient multi-provider AI routing.

---

## 🌟 Vision & Key Capabilities

- **Resilient Multi-Provider LLM Gateway:** Primary routing through **Google Gemini**, with dynamic, automatic fallback to **OpenAI**, **Anthropic Claude**, and local **Ollama** (offline models like Llama 3, Qwen, Mistral). Never stops working due to rate limits or API outages.
- **Multi-Identity Email & Calendar Automation:** Native multi-account management (e.g. `personal@gmail.com`, `business@gmail.com`, `sales@gmail.com`) via Gmail IMAP/SMTP with thread summarization, search, and smart drafting.
- **Human-in-the-Loop (HITL) Security:** Read operations execute autonomously, but high-consequence operations (sending an email, deleting threads, or altering external schedules) mandate explicit approval.
- **Hardened Web Dashboard & Local CLI:**
  - Interactive streaming CLI for instant local workflow execution.
  - Modern Web UI Dashboard protected by **Bcrypt password authentication**, **failed login attempt rate-limiting/lockout**, and **self-hosted zero-tracking SVG CAPTCHA**.
- **Multi-Channel Ingress:** Direct adapters for **Telegram**, **WhatsApp**, WebSockets, and Local Terminal.
- **Cross-Platform & Cloud Ready:** Runs seamlessly on **Windows**, **macOS**, and **Linux VPS** with production-ready **Docker & Docker Compose** containerization.

---

## 🏛️ Four-Layer System Architecture

```text
People and Devices (WhatsApp, Telegram, Web Dashboard, Local CLI)
                         │
                         ▼
Layer 1: Channels
  - Transports, platform authentication, raw message ingress/egress.
                         │
                         ▼
Layer 2: Channel & Conversation Services
  - Canonical envelope normalization, session router, per-session lane queue, cron/heartbeats.
                         │
                         ▼
Layer 3: Agent Runtime
  - Prompt assembly, multi-model fallback gateway (Gemini -> OpenAI -> Anthropic -> Ollama),
  - Bounded state machine loop, tool dispatch, steering, context compaction.
                         │
                         ▼
Layer 4: Capabilities & Integrations
  - Multi-account Gmail (IMAP/SMTP), Calendar sync, HITL approval gate,
  - Shell sandbox, Browser automation, ClawHub skills, MCP servers.
```

---

## 🛡️ Security & Trust

1. **Dashboard Defense:**
   - Brute-force protection: Max 5 failed attempts locks access for 15 minutes with exponential backoff.
   - Self-hosted SVG visual CAPTCHA: 100% offline, zero data leakage to 3rd-party ad or tracking networks.
2. **Credential Blindness:**
   - The LLM never sees raw credentials or App Passwords. Capabilities authenticate internally using an encrypted secrets vault.
3. **Prompt Injection Sanitization:**
   - External untrusted inputs (emails, web pages, attachments) are strictly isolated before prompt assembly.

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 20+ (Node.js 24+ supported)
- npm or pnpm
- Git

### 2. Installation
```bash
git clone git@github.com:nawalpateldev/ai-openclaw-personal-assistant.git
cd ai-openclaw-personal-assistant
npm install
```

### 3. Configuration
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```
Key configuration items:
- `GEMINI_API_KEY`: Primary Google Gemini API key
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`: Optional fallback providers
- `OLLAMA_BASE_URL`: Local Ollama instance (default: `http://127.0.0.1:11434`)
- `DASHBOARD_PASSWORD`: Web dashboard master password
- `EMAIL_ACCOUNTS`: Multi-account Gmail App Password configurations

### 4. Running OpenClaw
- **Start Web Dashboard & API Server:**
  ```bash
  npm run server
  ```
- **Start Interactive CLI:**
  ```bash
  npm run cli
  ```
- **Run in Docker (VPS deployment):**
  ```bash
  docker compose up -d
  ```

---

## 📜 License
MIT License. Built with pride for autonomous personal and business operations.
