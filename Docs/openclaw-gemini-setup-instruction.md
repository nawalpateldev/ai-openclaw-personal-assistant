# Google AI Studio & Gemini Setup for OpenClaw

Reference: [Google AI Studio Getting Started with OpenClaw](https://aistudio.google.com/learn/getting-started-with-open-claw-and-gemini)

---

## 1. Overview & Google AI Studio Quickstart

OpenClaw supports "Bring Your Own API Key" for Google Gemini via Google AI Studio. 

### Quick API Verification (curl)
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=YOUR_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          {
            "text": "Explain how AI works in a few words"
          }
        ]
      }
    ]
  }'
```

---

## 2. Why `503 Service Unavailable` or `429 Quota Exceeded` Happens

When calling Google Generative Language API, you may encounter:
- `[503 Service Unavailable] This model is currently experiencing high demand. Spikes in demand are usually temporary.`
- `[429 Too Many Requests] You exceeded your current quota... limit: 20 requests/day for gemini-3.8-flash.`
- `[404 Not Found] Model models/gemini-2.5-flash is no longer available to new users.`

### Recommended & Available Models for AI Studio Keys:
1. **`gemini-flash-lite-latest`** *(Fastest, ultra-high availability, abundant quota)*
2. **`gemini-3.5-flash`** *(High intelligence, active and healthy)*
3. **`gemini-flash-latest`** *(Official latest flash alias)*
4. **`gemini-3.1-pro-preview`** *(Complex multi-step reasoning)*

---

## 3. OpenClaw Multi-Model Automatic Failover

OpenClaw features **dual-layer resiliency**:

1. **Intra-Gemini Candidate Fallback (`GeminiProvider`)**:
   If the primary Gemini model encounters `503` (high demand spike), `429` (quota limit), or `404` (retired alias), `GeminiProvider` automatically and immediately tries backup Gemini models (`gemini-flash-lite-latest` $\rightarrow$ `gemini-3.5-flash`) before throwing an error.

2. **Cross-Gateway Cascade (`ModelGateway`)**:
   If Google Gemini is completely unreachable, the gateway falls back in order:
   $$\text{Gemini} \longrightarrow \text{OpenAI} \longrightarrow \text{Anthropic} \longrightarrow \text{Local Offline Ollama (qwen2.5:0.5b)}$$

---

## 4. Configuration

In `.env`:
```env
GEMINI_API_KEY=your_google_ai_studio_key_here
GEMINI_MODEL=gemini-flash-latest
```

In `config/env.ts`, `gemini-flash-lite-latest` is also pre-configured as the instant zero-downtime candidate.