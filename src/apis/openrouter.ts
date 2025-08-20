export async function callOpenRouterChatAPI(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  model: 'claude' | 'openai',
  apiKey: string,
  apiUrl?: string,
  language: 'chinese' | 'english' = 'chinese',
  customPrompts?: any,
  modelIdentifier?: string
): Promise<{ summary: string; error?: string }> {
  const endpoint = apiUrl || 'https://openrouter.ai/api/v1/chat/completions';

  const promptConfig = getPromptConfig(language, customPrompts);

  let modelToUse: string;
  if (modelIdentifier) {
    modelToUse = model === 'claude' ? `anthropic/${modelIdentifier}` : `openai/${modelIdentifier}`;
  } else {
    const modelMap = {
      claude: 'anthropic/claude-sonnet-4-20250514',
      openai: 'openai/gpt-4'
    };
    modelToUse = modelMap[model];
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': chrome.runtime.getURL(''),
        'X-Title': 'AI Page Summarizer'
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: messages,
        max_tokens: promptConfig.maxTokens,
        temperature: promptConfig.temperature
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorDetails = errorData.error?.message || errorData.message || 'Unknown error';
      const statusCode = response.status;
      const statusText = response.statusText;

      let enhancedError = `API request failed (${statusCode} ${statusText}): ${errorDetails}`;

      if (statusCode === 401) {
        enhancedError += '\n\nTip: Check if your API key is valid and active.';
      } else if (statusCode === 429) {
        enhancedError += '\n\nTip: You have hit rate limits. Please wait before trying again.';
      } else if (statusCode >= 500) {
        enhancedError +=
          '\n\nTip: This is a server error. The API service may be temporarily unavailable.';
      }

      throw new Error(enhancedError);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || 'No response generated';
    return { summary };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Network error: Unable to connect to API endpoint. Check your internet connection and URL: ${endpoint}`
      );
    }
    throw error;
  }
}

export async function callOpenRouterAPI(
  text: string,
  model: 'claude' | 'openai',
  apiKey: string,
  apiUrl?: string,
  language: 'chinese' | 'english' = 'chinese',
  customPrompts?: any,
  modelIdentifier?: string
): Promise<{ summary: string; error?: string }> {
  const endpoint = apiUrl || 'https://openrouter.ai/api/v1/chat/completions';

  const promptConfig = getPromptConfig(language, customPrompts);

  let modelToUse: string;
  if (modelIdentifier) {
    modelToUse = model === 'claude' ? `anthropic/${modelIdentifier}` : `openai/${modelIdentifier}`;
  } else {
    const modelMap = {
      claude: 'anthropic/claude-sonnet-4-20250514',
      openai: 'openai/gpt-4'
    };
    modelToUse = modelMap[model];
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': chrome.runtime.getURL(''),
        'X-Title': 'AI Page Summarizer'
      },
      body: JSON.stringify({
        model: modelToUse,
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

      let enhancedError = `API request failed (${statusCode} ${statusText}): ${errorDetails}`;

      if (statusCode === 401) {
        enhancedError += '\n\nTip: Check if your API key is valid and active.';
      } else if (statusCode === 429) {
        enhancedError += '\n\nTip: You have hit rate limits. Please wait before trying again.';
      } else if (statusCode >= 500) {
        enhancedError +=
          '\n\nTip: This is a server error. The API service may be temporarily unavailable.';
      }

      throw new Error(enhancedError);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || 'No summary generated';
    return { summary };
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(
        `Network error: Unable to connect to API endpoint. Check your internet connection and URL: ${endpoint}`
      );
    }
    throw error;
  }
}

function getPromptConfig(language: 'chinese' | 'english', customPrompts?: any) {
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
