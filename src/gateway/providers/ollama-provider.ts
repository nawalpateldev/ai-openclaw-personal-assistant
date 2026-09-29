import { ModelMessage, ModelResponse, ToolDefinition } from '../../types/index.js';

export class OllamaProvider {
  private baseUrl: string;
  private modelName: string;

  constructor(baseUrl: string = 'http://127.0.0.1:11434', modelName: string = 'qwen2.5:0.5b') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.modelName = modelName;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Fetch list of locally installed models in Ollama
   */
  async getInstalledModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data: any = await res.json();
        if (Array.isArray(data.models)) {
          return data.models.map((m: any) => m.name);
        }
      }
    } catch {}
    return [];
  }

  async generate(
    messages: ModelMessage[],
    tools?: ToolDefinition[]
  ): Promise<ModelResponse> {
    const startTime = Date.now();

    const formattedMessages = messages.map((m) => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: m.content,
    }));

    // Auto-detect installed model if configured model is not available
    let targetModel = this.modelName;
    const installed = await this.getInstalledModels();
    if (installed.length > 0 && !installed.includes(targetModel)) {
      targetModel = installed[0];
      this.modelName = targetModel;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: targetModel,
        messages: formattedMessages,
        stream: false,
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama returned HTTP ${response.status}: ${errText}`);
    }

    const data: any = await response.json();
    const latencyMs = Date.now() - startTime;

    return {
      content: data.message?.content || '',
      providerUsed: 'ollama',
      modelUsed: targetModel,
      tokensUsed: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      latencyMs,
    };
  }
}
