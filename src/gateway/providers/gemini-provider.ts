import { GoogleGenerativeAI } from '@google/generative-ai';
import { ModelMessage, ModelResponse, ToolDefinition } from '../../types/index.js';

export class GeminiProvider {
  private client: GoogleGenerativeAI | null = null;
  private modelName: string;
  private apiKey: string;
  // Alternate Gemini models to try if the requested model encounters 503 high demand or 429 quota spikes
  private fallbackModels: string[] = ['gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-flash-latest'];

  constructor(apiKey: string, modelName: string = 'gemini-flash-lite-latest') {
    this.apiKey = apiKey;
    this.modelName = modelName;
    if (apiKey) {
      this.client = new GoogleGenerativeAI(apiKey);
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
      throw new Error('Gemini API key is not configured');
    }

    const startTime = Date.now();
    
    // System instruction extraction
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Build unique model candidates: configured first, followed by fallback models
    const candidateModels = Array.from(new Set([this.modelName, ...this.fallbackModels]));

    // Format history for Gemini chat
    // Role mapping: 'user' -> 'user', 'assistant' -> 'model'
    const contents = conversationMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || '' }],
    }));

    let lastError: any = null;

    for (const modelToTry of candidateModels) {
      try {
        const model = this.client.getGenerativeModel({
          model: modelToTry,
          systemInstruction: systemMessage?.content,
        });

        const result = await model.generateContent({
          contents,
        });

        const responseText = result.response.text();
        const latencyMs = Date.now() - startTime;

        return {
          content: responseText,
          providerUsed: 'gemini',
          modelUsed: modelToTry,
          latencyMs,
        };
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const isTransient = errMsg.includes('503') || errMsg.includes('429') || errMsg.includes('404');
        if (isTransient) {
          console.warn(`[GeminiProvider] Model '${modelToTry}' returned transient error (${errMsg.substring(0, 120)}...). Trying next Gemini candidate...`);
          continue;
        }
        // If it's another non-transient error, break and throw
        break;
      }
    }

    throw lastError;
  }
}
