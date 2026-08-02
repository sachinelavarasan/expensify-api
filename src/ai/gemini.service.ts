import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';

const REQUEST_TIMEOUT_MS = 5000;
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly client: GoogleGenAI | null;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    this.client = apiKey ? new GoogleGenAI({ apiKey }) : null;
    this.model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  }

  // Fails soft: any error, timeout, or missing API key returns null instead of
  // throwing, since callers use this for optional AI suggestions that must
  // never block or error out the underlying user action.
  async generateText(prompt: string): Promise<string | null> {
    if (!this.client) {
      this.logger.warn('GEMINI_API_KEY not configured; skipping Gemini call');
      return null;
    }

    try {
      const result = await Promise.race([
        this.client.models.generateContent({ model: this.model, contents: prompt }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Gemini request timed out')), REQUEST_TIMEOUT_MS),
        ),
      ]);
      return result.text?.trim() || null;
    } catch (error) {
      this.logger.warn(`Gemini call failed: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
}
