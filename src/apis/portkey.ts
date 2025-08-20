import Portkey from 'portkey-ai';

interface LLMResponse {
  summary: string;
  error?: string;
  fromCache?: boolean;
  cachedAt?: number;
}

interface PromptConfig {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
}

function getPromptConfig(language: 'chinese' | 'english', customPrompts?: any): PromptConfig {
  const defaultConfig = {
    chinese: {
      systemPrompt:
        '你是一个有用的助手，专门总结网页内容。请提供简洁、结构清晰的摘要，突出主要观点和关键信息。',
      userPrompt:
        '请为以下网页内容提供一个简洁、结构清晰的中文摘要，突出主要观点和关键信息：\n\n{text}',
      temperature: 0.5,
      maxTokens: 1000
    },
    english: {
      systemPrompt:
        'You are a helpful assistant that summarizes web page content. Provide a concise, well-structured summary highlighting the main points and key information.',
      userPrompt:
        'Please provide a concise, well-structured summary of this webpage content, highlighting the main points and key information:\n\n{text}',
      temperature: 0.5,
      maxTokens: 1000
    }
  };

  if (customPrompts && customPrompts[language]) {
    return customPrompts[language];
  }

  return defaultConfig[language];
}

function createPrompt(text: string, language: 'chinese' | 'english', customPrompts?: any): string {
  const promptConfig = getPromptConfig(language, customPrompts);
  return promptConfig.userPrompt.replace('{text}', text);
}

function getModelIdentifier(
  model: 'claude' | 'openai' | 'portkey',
  modelIdentifier?: string
): string {
  if (modelIdentifier) {
    return modelIdentifier;
  }

  // Default model identifiers for each provider
  switch (model) {
    case 'claude':
      return 'claude-sonnet-4-20250514';
    case 'openai':
      return 'gpt-4';
    case 'portkey':
      return 'gpt-4'; // Default for Portkey, can be overridden by virtual key
    default:
      return 'gpt-4';
  }
}

export async function callPortkeyAPI(
  text: string,
  apiKey: string,
  apiUrl?: string,
  virtualKey?: string,
  language: 'chinese' | 'english' = 'chinese',
  customPrompts?: any,
  modelIdentifier?: string
): Promise<LLMResponse> {
  // Try SDK approach first
  try {
    const portkeyConfig: any = {
      apiKey: apiKey
    };

    // Add virtual key if provided
    if (virtualKey) {
      portkeyConfig.virtualKey = virtualKey;
    }

    // Add custom base URL if provided
    if (apiUrl) {
      portkeyConfig.baseURL = apiUrl;
    }

    const portkey = new Portkey(portkeyConfig);

    // Get prompt configuration
    const promptConfig = getPromptConfig(language, customPrompts);
    const model = getModelIdentifier('portkey', modelIdentifier);

    // Create chat completion using SDK
    const response = await portkey.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: promptConfig.systemPrompt
        },
        {
          role: 'user',
          content: createPrompt(text, language, customPrompts)
        }
      ],
      model: model, // Use configurable model identifier
      max_tokens: promptConfig.maxTokens,
      temperature: promptConfig.temperature
    });

    const summary = response.choices?.[0]?.message?.content?.toString() || 'No summary generated';
    return { summary };
  } catch (error: any) {
    // If SDK fails, fall back to direct API call
    console.log('Portkey SDK failed, falling back to direct API call:', error.message);

    try {
      return await callPortkeyDirectAPI(
        text,
        apiKey,
        apiUrl,
        virtualKey,
        language,
        customPrompts,
        modelIdentifier
      );
    } catch (fallbackError: any) {
      // Handle fallback errors
      let errorMessage = 'Portkey API request failed';

      if (fallbackError?.status) {
        const statusCode = fallbackError.status;
        const errorDetails =
          fallbackError.message || fallbackError.error?.message || 'Unknown error';

        errorMessage = `Portkey API request failed (${statusCode}): ${errorDetails}`;

        if (statusCode === 401) {
          errorMessage += '\n\nTip: Check if your Portkey API key is valid and active.';
        } else if (statusCode === 403) {
          errorMessage +=
            '\n\nTip: Check if your virtual key is valid and has the required permissions.';
        } else if (statusCode === 429) {
          errorMessage += '\n\nTip: You have hit rate limits. Please wait before trying again.';
        } else if (statusCode >= 500) {
          errorMessage +=
            '\n\nTip: This is a server error. The Portkey service may be temporarily unavailable.';
        }
      } else if (fallbackError?.message) {
        errorMessage += `: ${fallbackError.message}`;
      }

      throw new Error(errorMessage);
    }
  }
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
  const endpoint = apiUrl || 'https://api.portkey.ai/v1/chat/completions';

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'AI Page Summarizer'
    };

    // Add virtual key if provided
    if (virtualKey) {
      headers['x-portkey-virtual-key'] = virtualKey;
    }

    // Get prompt configuration
    const promptConfig = getPromptConfig(language, customPrompts);
    const model = getModelIdentifier('portkey', modelIdentifier);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model, // Use configurable model identifier
        messages: [
          {
            role: 'system',
            content: promptConfig.systemPrompt
          },
          {
            role: 'user',
            content: createPrompt(text, language, customPrompts)
          }
        ],
        max_tokens: promptConfig.maxTokens,
        temperature: promptConfig.temperature
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorDetails = errorData.error?.message || errorData.message || 'Unknown error';
      const statusCode = response.status;
      const statusText = response.statusText;

      // Provide more specific error messages
      let enhancedError = `Portkey API request failed (${statusCode} ${statusText}): ${errorDetails}`;

      if (statusCode === 401) {
        enhancedError += '\n\nTip: Check if your Portkey API key is valid and active.';
      } else if (statusCode === 403) {
        enhancedError +=
          '\n\nTip: Check if your virtual key is valid and has the required permissions.';
      } else if (statusCode === 429) {
        enhancedError += '\n\nTip: You have hit rate limits. Please wait before trying again.';
      } else if (statusCode >= 500) {
        enhancedError +=
          '\n\nTip: This is a server error. The Portkey service may be temporarily unavailable.';
      }

      throw new Error(enhancedError);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || 'No summary generated';
    return { summary };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Network error: Unable to connect to Portkey API endpoint. Check your internet connection and URL: ${endpoint}`
      );
    }
    throw error;
  }
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
  const endpoint = apiUrl || 'https://api.portkey.ai/v1/chat/completions';

  try {
    const promptConfig = getPromptConfig(language, customPrompts);
    const processedMessages = processLargeContext(messages, promptConfig.maxTokens);
    const model = getModelIdentifier('portkey', modelIdentifier);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };

    if (virtualKey) {
      headers['x-portkey-virtual-key'] = virtualKey;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: model,
        messages: processedMessages,
        max_tokens: promptConfig.maxTokens,
        temperature: promptConfig.temperature
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorDetails = errorData.error?.message || errorData.message || 'Unknown error';
      throw new Error(`Portkey API request failed (${response.status}): ${errorDetails}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || 'No response generated';
    return { summary };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Network error: Unable to connect to Portkey API endpoint: ${endpoint}`);
    }
    throw error;
  }
}

function processLargeContext(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

  let totalTokens = 0;
  const processedMessages = [];

  if (messages.length > 0 && messages[0].role === 'system') {
    processedMessages.push(messages[0]);
    totalTokens += estimateTokens(messages[0].content);
  }

  const remainingMessages = messages.slice(1).reverse();

  for (const message of remainingMessages) {
    const messageTokens = estimateTokens(message.content);

    const reservedTokens = Math.floor(maxTokens / 3);
    const availableTokens = maxTokens - reservedTokens;

    if (totalTokens + messageTokens <= availableTokens) {
      processedMessages.unshift(message);
      totalTokens += messageTokens;
    } else {
      if (messageTokens > availableTokens - totalTokens) {
        const availableChars = (availableTokens - totalTokens) * 4;
        const truncatedContent = message.content.substring(0, availableChars) + '...';
        processedMessages.unshift({
          role: message.role,
          content: truncatedContent
        });
        break;
      }
    }
  }

  return processedMessages;
}
