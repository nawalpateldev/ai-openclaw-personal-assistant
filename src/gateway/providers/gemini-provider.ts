import { GoogleGenerativeAI } from '@google/generative-ai';
import { ModelMessage, ModelResponse, ToolDefinition } from '../../types/index.js';

export class GeminiProvider {
  private client: GoogleGenerativeAI | null = null;
  private modelName: string;
  private apiKey: string;

  constructor(apiKey: string, modelName: string = 'gemini-2.5-flash') {
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

    const model = this.client.getGenerativeModel({
      model: this.modelName,
      systemInstruction: systemMessage?.content,
    });

    // Format history for Gemini chat
    // Role mapping: 'user' -> 'user', 'assistant' -> 'model'
    const contents = conversationMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content || '' }],
    }));

    const result = await model.generateContent({
      contents,
    });

    const responseText = result.response.text();
    const latencyMs = Date.now() - startTime;

    return {
      content: responseText,
      providerUsed: 'gemini',
      modelUsed: this.modelName,
      latencyMs,
    };
  }
}
