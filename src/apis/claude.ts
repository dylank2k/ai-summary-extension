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

export async function callClaudeAPI(
  text: string,
  apiKey: string,
  language: 'chinese' | 'english' = 'chinese',
  customPrompts?: any,
  modelIdentifier?: string
): Promise<LLMResponse> {
  const endpoint = 'https://api.anthropic.com/v1/messages';

  // Get prompt configuration
  const promptConfig = getPromptConfig(language, customPrompts);
  const model = getModelIdentifier('claude', modelIdentifier);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
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
            content: createPrompt(text, language, customPrompts)
          }
        ]
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorDetails = errorData.error?.message || errorData.message || 'Unknown error';
      const statusCode = response.status;
      const statusText = response.statusText;

      throw new Error(`Claude API request failed (${statusCode} ${statusText}): ${errorDetails}`);
    }

    const data = await response.json();
    const summary = data.content?.[0]?.text || 'No summary generated';
    return { summary };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Network error: Unable to connect to Claude API. Check your internet connection.`
      );
    }
    throw error;
  }
}

export async function callClaudeChatAPI(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  apiKey: string,
  language: 'chinese' | 'english' = 'chinese',
  customPrompts?: any,
  modelIdentifier?: string
): Promise<LLMResponse> {
  const endpoint = 'https://api.anthropic.com/v1/messages';

  // Get prompt configuration for chat
  const promptConfig = getPromptConfig(language, customPrompts);
  const model = getModelIdentifier('claude', modelIdentifier);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: promptConfig.maxTokens,
        messages: messages
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorDetails = errorData.error?.message || errorData.message || 'Unknown error';
      const statusCode = response.status;
      const statusText = response.statusText;

      throw new Error(`Claude API request failed (${statusCode} ${statusText}): ${errorDetails}`);
    }

    const data = await response.json();
    const summary = data.content?.[0]?.text || 'No response generated';
    return { summary };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Network error: Unable to connect to Claude API. Check your internet connection.`
      );
    }
    throw error;
  }
}
