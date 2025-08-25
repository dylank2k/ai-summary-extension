// Unified API service that manages all LLM providers
import { APIProviderFactory, LLMProvider, APIConfig, TextRequest, ChatRequest } from './interface';
import { ClaudeProvider } from './claude';
import { OpenRouterProvider } from './openrouter';
import { PortkeyProvider } from './portkey';
import type { LLMResponse } from '../service';

// Register all providers
APIProviderFactory.registerProvider('claude', new ClaudeProvider());
APIProviderFactory.registerProvider('openai', new OpenRouterProvider()); // OpenRouter handles OpenAI models
APIProviderFactory.registerProvider('portkey', new PortkeyProvider());

export class UnifiedAPIService {
    private static instance: UnifiedAPIService;

    static getInstance(): UnifiedAPIService {
        if (!this.instance) {
            this.instance = new UnifiedAPIService();
        }
        return this.instance;
    }

    async summarizeText(
        provider: string,
        request: TextRequest,
        config: APIConfig
    ): Promise<LLMResponse> {
        const apiProvider = APIProviderFactory.getProvider(provider);
        if (!apiProvider) {
            throw new Error(`Unknown provider: ${provider}`);
        }

        return await apiProvider.summarizeText(request, config);
    }

    async chatCompletion(
        provider: string,
        request: ChatRequest,
        config: APIConfig
    ): Promise<LLMResponse> {
        const apiProvider = APIProviderFactory.getProvider(provider);
        if (!apiProvider) {
            throw new Error(`Unknown provider: ${provider}`);
        }

        return await apiProvider.chatCompletion(request, config);
    }

    getAvailableProviders(): string[] {
        return APIProviderFactory.getAvailableProviders();
    }

    getProvider(provider: string): LLMProvider | undefined {
        return APIProviderFactory.getProvider(provider);
    }
}

// Convenience functions for easy access
export async function callUnifiedAPI(
    provider: string,
    text: string,
    apiKey: string,
    options: {
        apiUrl?: string;
        virtualKey?: string;
        language?: 'chinese' | 'english';
        customPrompts?: any;
        modelIdentifier?: string;
    } = {}
): Promise<LLMResponse> {
    const service = UnifiedAPIService.getInstance();
    const request: TextRequest = {
        text,
        language: options.language || 'chinese',
        customPrompts: options.customPrompts
    };
    const config: APIConfig = {
        apiKey,
        apiUrl: options.apiUrl,
        virtualKey: options.virtualKey,
        modelIdentifier: options.modelIdentifier
    };
    return await service.summarizeText(provider, request, config);
}

export async function callUnifiedChatAPI(
    provider: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    apiKey: string,
    options: {
        apiUrl?: string;
        virtualKey?: string;
        language?: 'chinese' | 'english';
        customPrompts?: any;
        modelIdentifier?: string;
    } = {}
): Promise<LLMResponse> {
    const service = UnifiedAPIService.getInstance();
    const request: ChatRequest = {
        messages,
        language: options.language || 'chinese',
        customPrompts: options.customPrompts
    };
    const config: APIConfig = {
        apiKey,
        apiUrl: options.apiUrl,
        virtualKey: options.virtualKey,
        modelIdentifier: options.modelIdentifier
    };
    return await service.chatCompletion(provider, request, config);
}
