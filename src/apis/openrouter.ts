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

export class OpenRouterProvider implements LLMProvider {
  getProviderName(): string {
    return 'OpenRouter';
  }

  async summarizeText(request: TextRequest, config: APIConfig): Promise<LLMResponse> {
    const endpoint = config.apiUrl || 'https://openrouter.ai/api/v1/chat/completions';
    const promptConfig = getDefaultPromptConfig(request.language, request.customPrompts);

    // For OpenRouter, we need to determine the model based on the provider
    // Since this is OpenRouter, we'll default to OpenAI models
    const modelToUse = `openai/${getModelIdentifier('openai', config.modelIdentifier)}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': chrome.runtime.getURL(''),
          'X-Title': 'AI Page Summarizer'
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: [
            {
              role: 'user',
              content: createPrompt(request.text, request.language, request.customPrompts)
            }
          ],
          max_tokens: promptConfig.maxTokens,
          temperature: promptConfig.temperature
        })
      });

      if (!response.ok) {
        throw handleHTTPError(response, this.getProviderName());
      }

      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content || 'No summary generated';
      return { summary };
    } catch (error) {
      throw handleAPIError(error, this.getProviderName());
    }
  }

  async chatCompletion(request: ChatRequest, config: APIConfig): Promise<LLMResponse> {
    const endpoint = config.apiUrl || 'https://openrouter.ai/api/v1/chat/completions';
    const promptConfig = getDefaultPromptConfig(request.language, request.customPrompts);

    // For OpenRouter, we need to determine the model based on the provider
    // Since this is OpenRouter, we'll default to OpenAI models
    const modelToUse = `openai/${getModelIdentifier('openai', config.modelIdentifier)}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': chrome.runtime.getURL(''),
          'X-Title': 'AI Page Summarizer'
        },
        body: JSON.stringify({
          model: modelToUse,
          messages: request.messages,
          max_tokens: promptConfig.maxTokens,
          temperature: promptConfig.temperature
        })
      });

      if (!response.ok) {
        throw handleHTTPError(response, this.getProviderName());
      }

      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content || 'No response generated';
      return { summary };
    } catch (error) {
      throw handleAPIError(error, this.getProviderName());
    }
  }
}

// Legacy functions for backward compatibility
export async function callOpenRouterAPI(
  text: string,
  _model: 'claude' | 'openai', // Unused parameter for backward compatibility
  apiKey: string,
  apiUrl?: string,
  language: 'chinese' | 'english' = 'chinese',
  customPrompts?: any,
  modelIdentifier?: string
): Promise<LLMResponse> {
  const provider = new OpenRouterProvider();
  const request: TextRequest = {
    text,
    language,
    customPrompts
  };
  const config: APIConfig = {
    apiKey,
    apiUrl,
    modelIdentifier
  };
  return await provider.summarizeText(request, config);
}

export async function callOpenRouterChatAPI(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  _model: 'claude' | 'openai', // Unused parameter for backward compatibility
  apiKey: string,
  apiUrl?: string,
  language: 'chinese' | 'english' = 'chinese',
  customPrompts?: any,
  modelIdentifier?: string
): Promise<LLMResponse> {
  const provider = new OpenRouterProvider();
  const request: ChatRequest = {
    messages,
    language,
    customPrompts
  };
  const config: APIConfig = {
    apiKey,
    apiUrl,
    modelIdentifier
  };
  return await provider.chatCompletion(request, config);
}
