import type { LLMResponse } from '../service';
import {
  LLMProvider,
  APIConfig,
  TextRequest,
  ChatRequest,
  getDefaultPromptConfig,
  createPrompt,
  getModelIdentifier,
  handleAPIError,
  handleHTTPError
} from './interface';

export class ClaudeProvider implements LLMProvider {
  getProviderName(): string {
    return 'Claude';
  }

  async summarizeText(request: TextRequest, config: APIConfig): Promise<LLMResponse> {
    const endpoint = 'https://api.anthropic.com/v1/messages';
    const promptConfig = getDefaultPromptConfig(request.language, request.customPrompts);
    const model = getModelIdentifier('claude', config.modelIdentifier);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: promptConfig.maxTokens,
          messages: [
            {
              role: 'user',
              content: createPrompt(request.text, request.language, request.customPrompts)
            }
          ]
        })
      });

      if (!response.ok) {
        throw handleHTTPError(response, this.getProviderName());
      }

      const data = await response.json();
      const summary = data.content?.[0]?.text || 'No summary generated';
      return { summary };
    } catch (error) {
      throw handleAPIError(error, this.getProviderName());
    }
  }

  async chatCompletion(request: ChatRequest, config: APIConfig): Promise<LLMResponse> {
    const endpoint = 'https://api.anthropic.com/v1/messages';
    const promptConfig = getDefaultPromptConfig(request.language, request.customPrompts);
    const model = getModelIdentifier('claude', config.modelIdentifier);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-api-key': config.apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: promptConfig.maxTokens,
          messages: request.messages
        })
      });

      if (!response.ok) {
        throw handleHTTPError(response, this.getProviderName());
      }

      const data = await response.json();
      const summary = data.content?.[0]?.text || 'No response generated';
      return { summary };
    } catch (error) {
      throw handleAPIError(error, this.getProviderName());
    }
  }
}

// Legacy functions for backward compatibility
export async function callClaudeAPI(
  text: string,
  apiKey: string,
  language: 'chinese' | 'english' = 'chinese',
  customPrompts?: any,
  modelIdentifier?: string
): Promise<LLMResponse> {
  const provider = new ClaudeProvider();
  const request: TextRequest = {
    text,
    language,
    customPrompts
  };
  const config: APIConfig = {
    apiKey,
    modelIdentifier
  };
  return await provider.summarizeText(request, config);
}

export async function callClaudeChatAPI(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  apiKey: string,
  language: 'chinese' | 'english' = 'chinese',
  customPrompts?: any,
  modelIdentifier?: string
): Promise<LLMResponse> {
  const provider = new ClaudeProvider();
  const request: ChatRequest = {
    messages,
    language,
    customPrompts
  };
  const config: APIConfig = {
    apiKey,
    modelIdentifier
  };
  return await provider.chatCompletion(request, config);
}
