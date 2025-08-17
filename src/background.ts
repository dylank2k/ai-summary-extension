// Background service worker for managing tabs and API calls
import { SummaryCache } from './cache';

// Test cache import immediately
console.log('🧪 CACHE MODULE IMPORT TEST:', typeof SummaryCache);
console.log('🧪 CACHE HAS GET METHOD:', typeof SummaryCache.get);
console.log('🧪 CACHE HAS SET METHOD:', typeof SummaryCache.set);

interface TabInfo {
  id: number;
  url: string;
  title: string;
  text?: string;
}

interface LLMRequest {
  text: string;
  model: 'claude' | 'openai';
  apiKey: string;
  apiUrl?: string;
  language?: 'chinese' | 'english';
}

interface LLMResponse {
  summary: string;
  error?: string;
}

class BackgroundService {
  private static instance: BackgroundService;

  static getInstance(): BackgroundService {
    if (!this.instance) {
      this.instance = new BackgroundService();
    }
    return this.instance;
  }

  async getAllTabsInfo(): Promise<TabInfo[]> {
    try {
      const tabs = await chrome.tabs.query({});
      return tabs.map(tab => ({
        id: tab.id!,
        url: tab.url || '',
        title: tab.title || 'Untitled'
      }));
    } catch (error) {
      console.error('Error getting tabs info:', error);
      return [];
    }
  }

  async extractTextFromTab(tabId: number): Promise<string> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          // Extract text content from the page
          const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode: (node) => {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;

                const style = window.getComputedStyle(parent);
                if (style.display === 'none' || style.visibility === 'hidden') {
                  return NodeFilter.FILTER_REJECT;
                }

                const ignoredTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME']);
                if (ignoredTags.has(parent.tagName)) {
                  return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
              }
            }
          );

          const textNodes: string[] = [];
          let node;

          while (node = walker.nextNode()) {
            const text = node.textContent?.trim();
            if (text && text.length > 0) {
              textNodes.push(text);
            }
          }

          return textNodes.join(' ').replace(/\s+/g, ' ').trim();
        }
      });

      return results[0]?.result || '';
    } catch (error) {
      console.error('Error extracting text from tab:', error);
      return '';
    }
  }

  async callLLMAPI(request: LLMRequest & { url?: string }): Promise<LLMResponse> {
    try {
      const { text, model, apiKey, apiUrl, url, language = 'chinese' } = request;

      console.log('🔥🔥🔥 === CACHE DEBUG START === 🔥🔥🔥');
      console.log('LLM API called with:', { url, model, language, hasText: !!text });

      // Check cache first if URL is provided
      if (url) {
        console.log('🔍🔍🔍 ABOUT TO CHECK CACHE 🔍🔍🔍');
        console.log('Checking cache for URL and language:', url, language);
        const cachedSummary = await SummaryCache.get(url, language);
        if (cachedSummary) {
          console.log('🎯 CACHE HIT - Returning cached summary for:', `${url}|${language}`);
          return { summary: cachedSummary };
        }
        console.log('❌ CACHE MISS - No cached summary found for:', `${url}|${language}`);
      } else {
        console.log('⚠️ No URL provided, skipping cache check');
      }

      // Cache miss or no URL provided, make API call
      console.log('🌐 Making fresh API call...');
      let apiResponse: LLMResponse;

      if (model === 'claude') {
        console.log('Using Anthropic Claude API');
        apiResponse = await this.callClaudeAPI(text, apiKey, language);
      } else {
        console.log('Using OpenRouter API');
        apiResponse = await this.callOpenRouterAPI(text, model, apiKey, apiUrl, language);
      }

      // Cache the response if successful and URL is provided
      if (url && apiResponse.summary && !apiResponse.error) {
        console.log('💾💾💾 ABOUT TO STORE IN CACHE 💾💾💾');
        console.log('💾 Storing in cache:', { url, language, responseLength: apiResponse.summary.length });
        await SummaryCache.set(url, language, apiResponse.summary, model);
        console.log('✅ Successfully cached response for:', `${url}|${language}`);
      } else {
        console.log('❌ Not caching because:', {
          hasUrl: !!url,
          hasSummary: !!apiResponse.summary,
          hasError: !!apiResponse.error
        });
      }

      return apiResponse;
    } catch (error) {
      console.error('LLM API call failed:', error);
      return {
        summary: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async callClaudeAPI(text: string, apiKey: string, language: 'chinese' | 'english' = 'chinese'): Promise<LLMResponse> {
    const endpoint = 'https://api.anthropic.com/v1/messages';

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
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: this.createPrompt(text, language)
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
        throw new Error(`Network error: Unable to connect to Claude API. Check your internet connection.`);
      }
      throw error;
    }
  }

  private async callOpenRouterAPI(text: string, model: 'claude' | 'openai', apiKey: string, apiUrl?: string, language: 'chinese' | 'english' = 'chinese'): Promise<LLMResponse> {
    const endpoint = apiUrl || 'https://openrouter.ai/api/v1/chat/completions';

    const modelMap = {
      'claude': 'anthropic/claude-sonnet-4-20250514',
      'openai': 'openai/gpt-4'
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': chrome.runtime.getURL(''),
          'X-Title': 'AI Page Summarizer'
        },
        body: JSON.stringify({
          model: modelMap[model],
          messages: [
            {
              role: 'system',
              content: language === 'chinese'
                ? '你是一个有用的助手，专门总结网页内容。请提供简洁、结构清晰的摘要，突出主要观点和关键信息。'
                : 'You are a helpful assistant that summarizes web page content. Provide a concise, well-structured summary highlighting the main points and key information.'
            },
            {
              role: 'user',
              content: this.createPrompt(text, language)
            }
          ],
          max_tokens: 1000,
          temperature: 0.5
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorDetails = errorData.error?.message || errorData.message || 'Unknown error';
        const statusCode = response.status;
        const statusText = response.statusText;

        // Provide more specific error messages
        let enhancedError = `API request failed (${statusCode} ${statusText}): ${errorDetails}`;

        if (statusCode === 401) {
          enhancedError += '\n\nTip: Check if your API key is valid and active.';
        } else if (statusCode === 429) {
          enhancedError += '\n\nTip: You have hit rate limits. Please wait before trying again.';
        } else if (statusCode >= 500) {
          enhancedError += '\n\nTip: This is a server error. The API service may be temporarily unavailable.';
        }

        throw new Error(enhancedError);
      }

      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content || 'No summary generated';
      return { summary };
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error(`Network error: Unable to connect to API endpoint. Check your internet connection and URL: ${endpoint}`);
      }
      throw error;
    }
  }

  async openDetachedWindow(): Promise<void> {
    try {
      // Check if detached popup window already exists
      const existingWindows = await chrome.windows.getAll({ populate: true });
      const popupWindow = existingWindows.find(window =>
        window.type === 'popup' &&
        window.tabs?.some(tab => tab.url?.includes('popup.html'))
      );

      if (popupWindow) {
        // Focus existing popup window
        await chrome.windows.update(popupWindow.id!, { focused: true });
      } else {
        // Create new popup window
        await chrome.windows.create({
          url: chrome.runtime.getURL('popup.html'),
          type: 'popup',
          width: 400,
          height: 500,
          focused: true
        });
      }
    } catch (error) {
      console.error('Error creating detached popup window:', error);
      throw error;
    }
  }

  private createPrompt(text: string, language: 'chinese' | 'english'): string {
    const prompts = {
      chinese: `请为以下网页内容提供一个简洁、结构清晰的中文摘要，突出主要观点和关键信息：\n\n${text}`,
      english: `Please provide a concise, well-structured summary of this webpage content, highlighting the main points and key information:\n\n${text}`
    };

    return prompts[language];
  }
}

// Message handling
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const service = BackgroundService.getInstance();

  switch (request.action) {
    case 'getAllTabs':
      service.getAllTabsInfo().then(sendResponse);
      return true;

    case 'extractTabText':
      service.extractTextFromTab(request.tabId).then(sendResponse);
      return true;

    case 'summarizeText':
      // Add URL to the request for caching
      console.log('Summarize request received:', { url: request.url, hasData: !!request.data });
      const dataWithUrl = { ...request.data, url: request.url };
      service.callLLMAPI(dataWithUrl).then(sendResponse);
      return true;

    case 'openDetachedWindow':
      service.openDetachedWindow().then(sendResponse);
      return true;

    default:
      sendResponse({ error: 'Unknown action' });
  }
});

// The extension now uses default popup behavior defined in manifest.json
// No need for custom action click handler

// Extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Page Summarizer extension installed');
});