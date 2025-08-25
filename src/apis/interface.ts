// Common interface for all LLM API providers
import type { LLMResponse } from '../service';

export interface PromptConfig {
    systemPrompt: string;
    userPrompt: string;
    temperature: number;
    maxTokens: number;
}

export interface APIConfig {
    apiKey: string;
    apiUrl?: string;
    virtualKey?: string;
    modelIdentifier?: string;
}

export interface TextRequest {
    text: string;
    language: 'chinese' | 'english';
    customPrompts?: {
        chinese: PromptConfig;
        english: PromptConfig;
    };
}

export interface ChatRequest {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    language: 'chinese' | 'english';
    customPrompts?: {
        chinese: PromptConfig;
        english: PromptConfig;
    };
}

export interface LLMProvider {
    // Text summarization
    summarizeText(request: TextRequest, config: APIConfig): Promise<LLMResponse>;

    // Chat completion
    chatCompletion(request: ChatRequest, config: APIConfig): Promise<LLMResponse>;

    // Get provider name
    getProviderName(): string;
}

// Factory for creating API providers
export class APIProviderFactory {
    private static providers = new Map<string, LLMProvider>();

    static registerProvider(name: string, provider: LLMProvider): void {
        this.providers.set(name, provider);
    }

    static getProvider(name: string): LLMProvider | undefined {
        return this.providers.get(name);
    }

    static getAvailableProviders(): string[] {
        return Array.from(this.providers.keys());
    }
}

// Common utility functions
export function getDefaultPromptConfig(language: 'chinese' | 'english', customPrompts?: any): PromptConfig {
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

export function createPrompt(text: string, language: 'chinese' | 'english', customPrompts?: any): string {
    const promptConfig = getDefaultPromptConfig(language, customPrompts);
    return promptConfig.userPrompt.replace('{text}', text);
}

export function getModelIdentifier(
    provider: string,
    modelIdentifier?: string
): string {
    if (modelIdentifier) {
        return modelIdentifier;
    }

    // Default model identifiers for each provider
    switch (provider) {
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

// Error handling utilities
export function handleAPIError(error: any, providerName: string): Error {
    if (error instanceof TypeError && error.message.includes('fetch')) {
        return new Error(
            `Network error: Unable to connect to ${providerName} API. Check your internet connection.`
        );
    }

    if (error.message) {
        return new Error(`${providerName} API error: ${error.message}`);
    }

    return new Error(`${providerName} API request failed: Unknown error`);
}

export function handleHTTPError(response: Response, providerName: string): Error {
    const statusCode = response.status;
    const statusText = response.statusText;

    let errorMessage = `${providerName} API request failed (${statusCode} ${statusText})`;

    if (statusCode === 401) {
        errorMessage += '\n\nTip: Check if your API key is valid and active.';
    } else if (statusCode === 429) {
        errorMessage += '\n\nTip: You have hit rate limits. Please wait before trying again.';
    } else if (statusCode >= 500) {
        errorMessage += '\n\nTip: This is a server error. The API service may be temporarily unavailable.';
    }

    return new Error(errorMessage);
}
