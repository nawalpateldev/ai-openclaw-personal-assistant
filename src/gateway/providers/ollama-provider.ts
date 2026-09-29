import { ModelMessage, ModelResponse, ToolDefinition } from '../../types/index.js';

export class OllamaProvider {
  private baseUrl: string;
  private modelName: string;

  constructor(baseUrl: string = 'http://127.0.0.1:11434', modelName: string = 'llama3.2') {
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

  async generate(
    messages: ModelMessage[],
    tools?: ToolDefinition[]
  ): Promise<ModelResponse> {
    const startTime = Date.now();

    const formattedMessages = messages.map((m) => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: m.content,
    }));

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelName,
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
      modelUsed: this.modelName,
      tokensUsed: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      latencyMs,
    };
  }
}
