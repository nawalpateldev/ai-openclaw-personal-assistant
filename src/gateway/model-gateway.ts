import { config } from '../config/env.js';
import { ModelMessage, ModelProviderName, ModelResponse, ToolDefinition } from '../types/index.js';
import { GeminiProvider } from './providers/gemini-provider.js';
import { OpenAIProvider } from './providers/openai-provider.js';
import { AnthropicProvider } from './providers/anthropic-provider.js';
import { OllamaProvider } from './providers/ollama-provider.js';

export interface ProviderStatus {
  provider: ModelProviderName;
  model: string;
  configured: boolean;
  enabled: boolean;
  healthy: boolean;
  lastError?: string;
  consecutiveFailures: number;
}

export class ModelGateway {
  private gemini: GeminiProvider;
  private openai: OpenAIProvider;
  private anthropic: AnthropicProvider;
  private ollama: OllamaProvider;

  private primaryProvider: ModelProviderName = 'gemini';
  private fallbackChain: ModelProviderName[] = ['gemini', 'openai', 'anthropic', 'ollama'];
  private providerStats: Map<ModelProviderName, ProviderStatus> = new Map();

  constructor() {
    this.gemini = new GeminiProvider(config.models.gemini.apiKey, config.models.gemini.model);
    this.openai = new OpenAIProvider(config.models.openai.apiKey, config.models.openai.model);
    this.anthropic = new AnthropicProvider(config.models.anthropic.apiKey, config.models.anthropic.model);
    this.ollama = new OllamaProvider(config.models.ollama.baseUrl, config.models.ollama.model);

    // Initialize provider statuses
    this.initStatus('gemini', config.models.gemini.model, this.gemini.isConfigured(), config.models.gemini.enabled);
    this.initStatus('openai', config.models.openai.model, this.openai.isConfigured(), config.models.openai.enabled);
    this.initStatus('anthropic', config.models.anthropic.model, this.anthropic.isConfigured(), config.models.anthropic.enabled);
    this.initStatus('ollama', config.models.ollama.model, true, config.models.ollama.enabled);
  }

  private initStatus(provider: ModelProviderName, model: string, configured: boolean, enabled: boolean) {
    this.providerStats.set(provider, {
      provider,
      model,
      configured,
      enabled,
      healthy: configured && enabled,
      consecutiveFailures: 0,
    });
  }

  getStatuses(): ProviderStatus[] {
    return Array.from(this.providerStats.values());
  }

  getPrimaryProvider(): ModelProviderName {
    return this.primaryProvider;
  }

  setProviderEnabled(provider: ModelProviderName, enabled: boolean): void {
    const status = this.providerStats.get(provider);
    if (status) {
      status.enabled = enabled;
      status.healthy = enabled && status.configured;
    }
  }

  setPrimaryProvider(provider: ModelProviderName): void {
    this.primaryProvider = provider;
    // Move primary provider to the front of the fallback chain
    this.fallbackChain = [
      provider,
      ...this.fallbackChain.filter((p) => p !== provider),
    ];
  }

  /**
   * Resilient generation with automatic rate-limit and error fallback cascade.
   * If preferredProvider is specified, it is placed at the front of the cascade.
   * If it fails, the gateway continues to remaining providers and flags fallbackOccurred.
   */
  async generate(
    messages: ModelMessage[],
    tools?: ToolDefinition[],
    preferredProvider?: ModelProviderName
  ): Promise<ModelResponse> {
    const errors: { provider: string; error: string }[] = [];

    // Build the prioritized chain for this generation
    let activeChain = [...this.fallbackChain];
    if (preferredProvider && this.providerStats.has(preferredProvider)) {
      activeChain = [
        preferredProvider,
        ...this.fallbackChain.filter((p) => p !== preferredProvider),
      ];
    }

    // Attempt generation through ordered fallback chain
    for (const providerName of activeChain) {
      const status = this.providerStats.get(providerName);
      if (!status || !status.enabled || !status.configured) {
        if (providerName === preferredProvider) {
          errors.push({
            provider: providerName,
            error: !status?.configured ? 'Provider is not configured (missing API credentials)' : 'Provider is currently disabled',
          });
        }
        continue;
      }

      // If circuit breaker tripped (>3 consecutive errors), skip unless it's explicitly requested or the last fallback
      if (status.consecutiveFailures >= 3 && providerName !== preferredProvider && providerName !== 'ollama') {
        continue;
      }

      try {
        let response: ModelResponse;

        switch (providerName) {
          case 'gemini':
            response = await this.gemini.generate(messages, tools);
            break;
          case 'openai':
            response = await this.openai.generate(messages, tools);
            break;
          case 'anthropic':
            response = await this.anthropic.generate(messages, tools);
            break;
          case 'ollama':
            response = await this.ollama.generate(messages, tools);
            break;
          default:
            continue;
        }

        // Success: Reset failure count and mark healthy
        status.consecutiveFailures = 0;
        status.healthy = true;
        status.lastError = undefined;

        const fallbackOccurred = Boolean(preferredProvider && response.providerUsed !== preferredProvider);

        return {
          ...response,
          fallbackOccurred,
          requestedProvider: preferredProvider,
          failedProviders: errors.length > 0 ? errors : undefined,
        };
      } catch (err: any) {
        const errorMessage = err?.message || String(err);
        status.consecutiveFailures += 1;
        status.lastError = errorMessage;
        
        console.warn(
          `[ModelGateway] Provider '${providerName}' failed: ${errorMessage}. Attempting next fallback in chain...`
        );

        errors.push({ provider: providerName, error: errorMessage });
      }
    }

    // If all configured providers failed, throw a detailed diagnostic error
    throw new Error(
      `All enabled LLM providers in fallback chain failed.\nDetails:\n` +
        errors.map((e) => `  - [${e.provider}]: ${e.error}`).join('\n')
    );
  }
}
