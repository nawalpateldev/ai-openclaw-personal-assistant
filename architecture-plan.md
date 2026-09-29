# OpenClaw Four-Layer Architecture Plan

## Goal

Define clear ownership and contracts for an extensible, multi-channel assistant. Channel-specific behavior stays at the edge; conversation policy and model orchestration stay in the runtime; external actions are exposed as governed capabilities.

## Architecture at a glance

```text
People and devices
        |
        v
L1  Channels: WhatsApp, Telegram, Slack, Discord, iMessage, CLI, Nodes
        |
        v
L2  Adapters, session router, lane queue, pairing, cron/heartbeat
        |
        v
L3  Prompt assembly, model calls, tool dispatch, compaction, lifecycle
        |
        v
L4  Shell/files, browser, skills (ClawHub), MCP, email/calendar, subagents
        |
        v
External services, local machine, and other agents
```

A shared platform substrate supports all four layers: configuration and secrets, durable session/job storage, policy, telemetry, and health checks. It is shared infrastructure, not a fifth request-processing layer.

## Layer responsibilities

### 1. Channels

**Components:** WhatsApp, Telegram, Slack, Discord, iMessage, CLI, and Nodes (paired devices or device-side clients).

**Owns:** Transport connections, platform-specific authentication, receiving/sending messages, attachments, delivery receipts, and translating platform events into the common inbound/outbound contract.

**Must not own:** Agent prompts, model selection, tool policy, or conversation history rules. Channel SDK objects should not leak beyond the adapter boundary.

### 2. Channel and conversation services

- **Channel adapters:** Convert provider events to and from the canonical message envelope. Normalize identities, timestamps, attachments, replies, and delivery errors.
- **Session router:** Resolve an envelope to a stable session using configured account, peer, group, and routing rules. Enforce tenant and channel boundaries; do not infer identity from display names.
- **Lane queue:** Preserve ordering for messages in the same session while allowing separate sessions to run concurrently. Apply bounded concurrency, backpressure, cancellation, retry policy, and dead-letter handling. Define what happens when a message arrives during an active run: queue it, steer the active run, or interrupt it, according to explicit session policy.
- **Session state:** Persist the conversation transcript and run metadata under a stable session identity. Keep channel/account/peer/thread scoping explicit so unrelated conversations cannot share context accidentally.
- **Auth and pairing:** Verify channel credentials and authorize users, groups, and Nodes. Pairing is an explicit trust grant with revocation and audit history, not just device discovery.
- **Cron and heartbeat:** Produce scheduled or periodic trigger events that enter through the same router and queue as channel messages. Apply per-job identity, permissions, deduplication, and missed-run policy.

**Owns:** Ingress validation, identity-to-session mapping, admission control, and trigger scheduling. It does not decide how the assistant reasons or which tools to call.

### 3. Agent runtime

- **Prompt assembly:** Build model input from system policy, agent configuration, session context, relevant history, and the current event. Apply size limits and redact secrets.
- **Memory retrieval and writes:** Treat the session transcript, compacted summaries, and durable cross-session memory as distinct stores with different retention and access rules. Retrieve only relevant, authorized memory for prompt assembly; make memory writes deliberate, attributable, and deletable. Do not treat a model-generated summary as an authorization source.
- **Agent loop and LLM call:** Run a bounded state machine: assemble context, call the model, validate any requested action, dispatch it, append the result, then continue or finalize. Hide provider-specific APIs behind a model interface; enforce step/token/time budgets, cancellation, bounded retries, usage accounting, and model routing.
- **Tool dispatch:** Validate tool names and arguments, check policy and user/session authorization, invoke Layer 4 capabilities, and return bounded results to the model. Every call and result belongs to a specific run step.
- **Steering:** Support explicit control of an active run, such as injecting a new user direction, interrupting the current model/tool cycle, or cancelling the run. Define which states are steerable, how queued messages interact with steering, and how tool calls that have already started are handled. A steering message must pass the same identity and authorization checks as any other input.
- **Compaction:** Summarize or prune conversation context under explicit retention and quality rules. Compaction manages context size; it does not replace durable memory, erase the audit trail, or silently change authorization state.
- **Lifecycle events:** Publish typed events for run start/finish, each model/tool step, steering or cancellation, compaction/memory operations, errors, and outbound response. Events support observability and extensions; consumers should not control the synchronous run path implicitly.

**Owns:** One run's orchestration, model/tool loop, context window management, and response formation. A run is tied to a resolved session and has a traceable run ID.

### 4. Capabilities and integrations

- **Shell and files:** Local execution and filesystem access behind explicit scopes, path restrictions, timeouts, and isolation. Default to least privilege.
- **Browser:** Browser automation or controlled web access using a dedicated session and explicit navigation/action policy.
- **Skills (ClawHub):** Discoverable and versioned capability packages. Treat installed skill instructions and outputs as untrusted input; require provenance, permissions, and update controls.
- **MCP:** Connect to configured MCP servers through a capability adapter. Validate server identity, tool schemas, permissions, and returned content.
- **Email and calendar:** Separate read/write scopes, confirm consequential sends or edits when policy requires, and retain provider audit IDs.
- **Subagents:** Expose child-agent work as a capability to the dispatcher, with a bounded task, inherited or narrower permissions, resource limits, and a result contract. The child run uses the Layer 3 runtime; Layer 4 is its invocation surface, not a second orchestration engine.

**Owns:** Provider-specific execution and capability metadata. Integrations do not bypass Layer 3 dispatch or Layer 2 identity/session authorization.

## Canonical contracts

Define versioned interfaces early so channels and integrations can evolve independently:

- **Inbound envelope:** `event_id`, `channel`, `account_id`, `sender_id`, `conversation_id`, `timestamp`, `content`, `attachments`, and transport metadata. Preserve provider IDs for deduplication and replies.
- **Resolved run request:** `session_id`, `run_id`, validated sender context, trigger type, message, and applicable policy/config version. Active-run control is represented explicitly (for example, queue, steer, interrupt, or cancel), rather than inferred by a channel adapter.
- **Session/memory record:** Session-scoped transcript and summary references, plus separately scoped durable memory records with provenance, access scope, timestamps, and retention/deletion metadata.
- **Run-step event:** `run_id`, monotonic step ID, step kind, state transition, bounded input/output references, timing, and cancellation/steering status. Sensitive content is excluded or redacted from telemetry by default.
- **Capability call/result:** Capability and operation IDs, validated input, authorization context, deadline/cancellation, structured result, and normalized error. Do not return unbounded raw provider payloads to the model.
- **Outbound response:** Session and destination, content/attachments, reply metadata, idempotency key, and delivery status.

Keep transport-specific metadata in an opaque, size-limited field. Persist only fields needed for routing, audit, and replay, with defined retention.

## End-to-end message flow

1. A channel or scheduled trigger emits an event. The adapter authenticates and normalizes it into the inbound envelope.
2. Layer 2 validates the event, checks pairing/access policy, deduplicates it, resolves its session, and applies that session's active-run policy before queueing or steering it.
3. The runtime creates a run, loads authorized session history and relevant durable memory as separate context sources, assembles the prompt, and calls the configured model.
4. The agent loop validates every model-requested action, invokes the appropriate Layer 4 capability, records its result as a run step, and continues until the model finalizes, the budget is reached, or the run is steered/cancelled.
5. The runtime persists the final turn and any permitted memory updates, then emits lifecycle events. Layer 2 routes the response to the originating destination; the channel adapter handles provider delivery and reports status.
6. Failures are classified by stage. Retry only idempotent operations or operations protected by idempotency keys; record terminal failures for inspection. Cancellation or steering must not cause an already completed external side effect to be repeated.

## Cross-cutting requirements

- **Security:** Treat inbound text, attachments, skill content, MCP results, and browser content as untrusted. Use least-privilege capability grants, secret redaction, explicit pairing/revocation, and confirmation policies for consequential actions.
- **Isolation:** Apply process/container or equivalent isolation for shell and filesystem capabilities. Set execution deadlines, output limits, and resource budgets for tools and subagents.
- **Reliability:** Use durable queues where message loss is unacceptable, idempotency for retries, per-session ordering, and explicit behavior for reconnects, rate limits, and provider outages.
- **Privacy:** Define separate retention and deletion rules for transcripts, summaries, durable memory, tool inputs/results, and audit records. Make export/deletion behavior consistent across channels and prevent cross-session memory leakage.
- **Observability:** Correlate channel event, session, run, model call, capability call, and delivery with IDs. Avoid logging secrets or full sensitive content by default.
- **Extensibility:** Register channels and capabilities through typed contracts and manifests; validate compatibility and permissions at install/configuration time.

## Delivery plan

1. **Contracts and threat model:** Specify envelope, run, capability, and outbound contracts; define identity, session, retention, and trust boundaries.
2. **Vertical slice:** Implement one channel, session routing, per-session lane queue, one model provider, a read-only capability, and response delivery. Add tracing and failure tests.
3. **Runtime hardening:** Add tool authorization, the bounded agent loop, active-run steering/cancellation, separate session and durable-memory handling, compaction, durable run-step state, lifecycle events, and idempotent delivery.
4. **Channel expansion:** Add remaining channels and Nodes as adapters against the same contracts; verify pairing and ordering for each.
5. **Capability expansion:** Add shell/files and browser under isolation, then skills/ClawHub and MCP with permission manifests, followed by email/calendar and bounded subagents.
6. **Operations:** Add cron/heartbeat scheduling, queue and provider health, retention/deletion workflows, backup/recovery, and deployment automation.

## Decisions to settle before implementation

The plan can proceed with these as explicit defaults, but implementation needs owner decisions:

- **Deployment:** Default assumption: one self-hosted OpenClaw deployment, with interfaces that can later support multiple workers. Is multi-tenant hosted operation required from the start?
- **State and queue:** Choose the durable database and queue based on deployment scale and recovery requirements. Is a single-node deployment the initial target?
- **Model providers:** Choose the initial provider and whether local models must be supported in the first vertical slice.
- **Execution isolation:** Decide whether shell/browser tools run in containers, a dedicated worker, or are disabled until an isolation boundary is available.
- **Approval policy:** Define which actions require user confirmation, especially email/calendar writes, shell commands, and external messages.
- **Channel scope:** Confirm which channel is the first vertical slice and whether Nodes mean paired companion devices, headless workers, or both.

## Initial acceptance criteria

- A message can be traced from a channel event through a single session run to delivery, with failures attributed to a stage.
- Events in one session remain ordered; independent sessions can make progress concurrently.
- Session history, summaries, and durable memory have distinct scopes; retrieval never crosses an unauthorized session or tenant boundary.
- An active run can be queued behind, steered, interrupted, or cancelled only according to explicit policy, and its step history records the outcome.
- Unauthorized senders and unpaired Nodes cannot invoke agent runs or capabilities.
- Every capability call is policy-checked, bounded by time/output/resource limits, and auditable without exposing secrets.
- Scheduled triggers use the same authorization and execution path as inbound messages.
- A failed delivery or retried event cannot silently duplicate a consequential action.
