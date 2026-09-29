import Anthropic from '@anthropic-ai/sdk';
import { ModelMessage, ModelResponse, ToolDefinition } from '../../types/index.js';

export class AnthropicProvider {
  private client: Anthropic | null = null;
  private modelName: string;
  private apiKey: string;

  constructor(apiKey: string, modelName: string = 'claude-3-5-sonnet-20241022') {
    this.apiKey = apiKey;
    this.modelName = modelName;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
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
      throw new Error('Anthropic API key is not configured');
    }

    const startTime = Date.now();

    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: m.content,
      }));

    const response = await this.client.messages.create({
      model: this.modelName,
      max_tokens: 4096,
      system: systemMessage?.content,
      messages: conversationMessages,
    });

    const textBlock = response.content.find((c) => c.type === 'text');
    const latencyMs = Date.now() - startTime;

    return {
      content: textBlock ? textBlock.text : '',
      providerUsed: 'anthropic',
      modelUsed: this.modelName,
      tokensUsed: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      latencyMs,
    };
  }
}
