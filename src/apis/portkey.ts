import Portkey from 'portkey-ai';
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

export class PortkeyProvider implements LLMProvider {
  getProviderName(): string {
    return 'Portkey';
  }

  async summarizeText(request: TextRequest, config: APIConfig): Promise<LLMResponse> {
    // Try SDK approach first
    try {
      const portkeyConfig: any = {
        apiKey: config.apiKey
      };

      // Add virtual key if provided
      if (config.virtualKey) {
        portkeyConfig.virtualKey = config.virtualKey;
      }

      // Add custom base URL if provided
      if (config.apiUrl) {
        portkeyConfig.baseURL = config.apiUrl;
      }

      const portkey = new Portkey(portkeyConfig);

      // Get prompt configuration
      const promptConfig = getDefaultPromptConfig(request.language, request.customPrompts);
      const model = getModelIdentifier('portkey', config.modelIdentifier);

      // Create chat completion using SDK
      const response = await portkey.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: promptConfig.systemPrompt
          },
          {
            role: 'user',
            content: createPrompt(request.text, request.language, request.customPrompts)
          }
        ],
        model: model,
        max_tokens: promptConfig.maxTokens,
        temperature: promptConfig.temperature
      });

      const summary = response.choices?.[0]?.message?.content?.toString() || 'No summary generated';
      return { summary };
    } catch (sdkError: any) {
      console.log('Portkey SDK failed, falling back to direct API call:', sdkError.message);
      return await this.callDirectAPI(request, config);
    }
  }

  async chatCompletion(request: ChatRequest, config: APIConfig): Promise<LLMResponse> {
    // Try SDK approach first
    try {
      const portkeyConfig: any = {
        apiKey: config.apiKey
      };

      // Add virtual key if provided
      if (config.virtualKey) {
        portkeyConfig.virtualKey = config.virtualKey;
      }

      // Add custom base URL if provided
      if (config.apiUrl) {
        portkeyConfig.baseURL = config.apiUrl;
      }

      const portkey = new Portkey(portkeyConfig);

      // Get prompt configuration
      const promptConfig = getDefaultPromptConfig(request.language, request.customPrompts);
      const model = getModelIdentifier('portkey', config.modelIdentifier);

      // Create chat completion using SDK
      const response = await portkey.chat.completions.create({
        messages: request.messages,
        model: model,
        max_tokens: promptConfig.maxTokens,
        temperature: promptConfig.temperature
      });

      const summary = response.choices?.[0]?.message?.content?.toString() || 'No response generated';
      return { summary };
    } catch (sdkError: any) {
      console.log('Portkey SDK failed, falling back to direct API call:', sdkError.message);
      return await this.callDirectLargeContextAPI(request, config);
    }
  }

  async callDirectAPI(request: TextRequest, config: APIConfig): Promise<LLMResponse> {
    const endpoint = config.apiUrl || 'https://api.portkey.ai/v1/chat/completions';

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'AI Page Summarizer'
      };

      // Add virtual key if provided
      if (config.virtualKey) {
        headers['x-portkey-virtual-key'] = config.virtualKey;
      }

      // Get prompt configuration
      const promptConfig = getDefaultPromptConfig(request.language, request.customPrompts);
      const model = getModelIdentifier('portkey', config.modelIdentifier);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: promptConfig.systemPrompt
            },
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

  async callDirectLargeContextAPI(request: ChatRequest, config: APIConfig): Promise<LLMResponse> {
    const endpoint = config.apiUrl || 'https://api.portkey.ai/v1/chat/completions';

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'AI Page Summarizer'
      };

      // Add virtual key if provided
      if (config.virtualKey) {
        headers['x-portkey-virtual-key'] = config.virtualKey;
      }

      // Get prompt configuration
      const promptConfig = getDefaultPromptConfig(request.language, request.customPrompts);
      const model = getModelIdentifier('portkey', config.modelIdentifier);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model,
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
export async function callPortkeyAPI(
  text: string,
  apiKey: string,
  apiUrl?: string,
  virtualKey?: string,
  language: 'chinese' | 'english' = 'chinese',
  customPrompts?: any,
  modelIdentifier?: string
): Promise<LLMResponse> {
  const provider = new PortkeyProvider();
  const request: TextRequest = {
    text,
    language,
    customPrompts
  };
  const config: APIConfig = {
    apiKey,
    apiUrl,
    virtualKey,
    modelIdentifier
  };
  return await provider.summarizeText(request, config);
}

export async function callPortkeyDirectAPI(
  text: string,
  apiKey: string,
  apiUrl?: string,
  virtualKey?: string,
  language: 'chinese' | 'english' = 'chinese',
  customPrompts?: any,
  modelIdentifier?: string
): Promise<LLMResponse> {
  const provider = new PortkeyProvider();
  const request: TextRequest = {
    text,
    language,
    customPrompts
  };
  const config: APIConfig = {
    apiKey,
    apiUrl,
    virtualKey,
    modelIdentifier
  };
  return await provider.callDirectAPI(request, config);
}

export async function callPortkeyDirectLargeContextAPI(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  apiKey: string,
  apiUrl?: string,
  virtualKey?: string,
  language: 'chinese' | 'english' = 'chinese',
  customPrompts?: any,
  modelIdentifier?: string
): Promise<LLMResponse> {
  const provider = new PortkeyProvider();
  const request: ChatRequest = {
    messages,
    language,
    customPrompts
  };
  const config: APIConfig = {
    apiKey,
    apiUrl,
    virtualKey,
    modelIdentifier
  };
  return await provider.callDirectLargeContextAPI(request, config);
}
