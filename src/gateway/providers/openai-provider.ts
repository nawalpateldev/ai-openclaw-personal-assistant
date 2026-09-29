import OpenAI from 'openai';
import { ModelMessage, ModelResponse, ToolDefinition } from '../../types/index.js';

export class OpenAIProvider {
  private client: OpenAI | null = null;
  private modelName: string;
  private apiKey: string;

  constructor(apiKey: string, modelName: string = 'gpt-4o-mini') {
    this.apiKey = apiKey;
    this.modelName = modelName;
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    }
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async generate(
    messages: ModelMessage[],
    tools?: ToolDefinition[]
  ): Promise<ModelResponse> {
    if (!this.client) {
      throw new Error('OpenAI API key is not configured');
    }

    const startTime = Date.now();

    const formattedMessages = messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    const response = await this.client.chat.completions.create({
      model: this.modelName,
      messages: formattedMessages,
    });

    const choice = response.choices[0];
    const latencyMs = Date.now() - startTime;

    return {
      content: choice.message.content || '',
      providerUsed: 'openai',
      modelUsed: this.modelName,
      tokensUsed: {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
        totalTokens: response.usage?.total_tokens,
      },
      latencyMs,
    };
  }
}
