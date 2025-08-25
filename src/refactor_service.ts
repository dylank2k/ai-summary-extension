// Refactor service for API calls
import { SummaryCache } from './cache';
import Portkey from 'portkey-ai';
import {
    callPortkeyAPI,
    callPortkeyDirectAPI,
    callPortkeyDirectLargeContextAPI
} from './apis/portkey';
import { callOpenRouterAPI, callOpenRouterChatAPI } from './apis/openrouter';
import { callClaudeAPI, callClaudeChatAPI } from './apis/claude';

interface LLMRequest {
    text: string;
    model: 'claude' | 'openai' | 'portkey';
    modelIdentifier?: string;
    apiKey: string;
    apiUrl?: string;
    virtualKey?: string;
    language?: 'chinese' | 'english';
    customPrompts?: {
        chinese: {
            systemPrompt: string;
            userPrompt: string;
            temperature: number;
            maxTokens: number;
        };
        english: {
            systemPrompt: string;
            userPrompt: string;
            temperature: number;
            maxTokens: number;
        };
    };
}

interface ChatRequest {
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    model: 'claude' | 'openai' | 'portkey';
    modelIdentifier?: string;
    apiKey: string;
    apiUrl?: string;
    virtualKey?: string;
    language?: 'chinese' | 'english';
    customPrompts?: {
        chinese: {
            systemPrompt: string;
            userPrompt: string;
            temperature: number;
            maxTokens: number;
        };
        english: {
            systemPrompt: string;
            userPrompt: string;
            temperature: number;
            maxTokens: number;
        };
    };
}

interface LLMResponse {
    summary: string;
    error?: string;
    fromCache?: boolean;
    cachedAt?: number;
}

class RefactorService {
    private static instance: RefactorService;
    private conversationContexts = new Map<
        string,
        Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    >();

    static getInstance(): RefactorService {
        if (!this.instance) {
            this.instance = new RefactorService();
        }
        return this.instance;
    }

    private async getCacheEntry(url: string, language: string): Promise<any> {
        try {
            const result = await chrome.storage.local.get(['summary_cache']);
            const cache = result['summary_cache'] || {};
            const cacheKey = `${url}|${language}`;
            return cache[cacheKey] || null;
        } catch (error) {
            console.error('Error getting cache entry:', error);
            return null;
        }
    }

    private getPromptConfig(language: 'chinese' | 'english', customPrompts?: any) {
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

    // Add this new method for large context conversations
    private async callPortkeyLargeContextAPI(
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        apiKey: string,
        apiUrl?: string,
        virtualKey?: string,
        language: 'chinese' | 'english' = 'chinese',
        customPrompts?: any,
        modelIdentifier?: string
    ): Promise<LLMResponse> {
        try {
            // Try SDK approach first
            try {
                const portkeyConfig: any = {
                    apiKey: apiKey
                };

                if (virtualKey) {
                    portkeyConfig.virtualKey = virtualKey;
                }

                if (apiUrl) {
                    portkeyConfig.baseURL = apiUrl;
                }

                const portkey = new Portkey(portkeyConfig);

                // Get prompt configuration
                const promptConfig = this.getPromptConfig(language, customPrompts);

                // For large context, we need to manage token limits
                // Most models have limits, so we'll implement smart truncation
                const processedMessages = this.processLargeContext(messages, promptConfig.maxTokens);

                const response = await portkey.chat.completions.create({
                    messages: processedMessages,
                    model: 'gpt-4', // or use virtual key to route to specific model
                    max_tokens: promptConfig.maxTokens,
                    temperature: promptConfig.temperature
                });

                const summary =
                    response.choices?.[0]?.message?.content?.toString() || 'No response generated';
                return { summary };
            } catch (sdkError: any) {
                console.log('Portkey SDK failed, falling back to direct API call:', sdkError.message);
                return await callPortkeyDirectLargeContextAPI(
                    messages,
                    apiKey,
                    apiUrl,
                    virtualKey,
                    language,
                    customPrompts,
                    modelIdentifier
                );
            }
        } catch (error: any) {
            let errorMessage = 'Portkey large context API request failed';

            if (error.message) {
                errorMessage += `: ${error.message}`;
            }

            throw new Error(errorMessage);
        }
    }

    // Process large context by implementing smart truncation
    private processLargeContext(
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        maxTokens: number
    ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
        // Rough token estimation (4 characters per token)
        const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

        // Calculate total tokens in current messages
        let totalTokens = 0;
        const processedMessages = [];

        // Always keep system message
        if (messages.length > 0 && messages[0].role === 'system') {
            processedMessages.push(messages[0]);
            totalTokens += estimateTokens(messages[0].content);
        }

        // Process remaining messages from newest to oldest (keep most recent)
        const remainingMessages = messages.slice(1).reverse();

        for (const message of remainingMessages) {
            const messageTokens = estimateTokens(message.content);

            // Reserve space for response (roughly 1/3 of max tokens)
            const reservedTokens = Math.floor(maxTokens / 3);
            const availableTokens = maxTokens - reservedTokens;

            if (totalTokens + messageTokens <= availableTokens) {
                processedMessages.unshift(message); // Add to beginning (maintain order)
                totalTokens += messageTokens;
            } else {
                // If message is too long, truncate it
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

    // Handle extremely large contexts (1M+ tokens) with smart chunking
    private async handleExtremelyLargeContext(
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        apiKey: string,
        apiUrl?: string,
        virtualKey?: string,
        language: 'chinese' | 'english' = 'chinese',
        customPrompts?: any,
        modelIdentifier?: string
    ): Promise<LLMResponse> {
        // If context is manageable, use regular large context API
        const totalLength = messages.reduce((sum, msg) => sum + msg.content.length, 0);
        const estimatedTokens = Math.ceil(totalLength / 4);

        // If under 100K tokens, use regular processing
        if (estimatedTokens < 100000) {
            return await this.callPortkeyLargeContextAPI(
                messages,
                apiKey,
                apiUrl,
                virtualKey,
                language,
                customPrompts,
                modelIdentifier
            );
        }

        console.log(`Processing extremely large context: ~${estimatedTokens} tokens`);

        // For extremely large contexts, implement smart chunking
        const chunkedMessages = this.chunkLargeContext(messages);

        // Process each chunk and maintain conversation flow
        let processedContext = '';
        let conversationSummary = '';

        for (let i = 0; i < chunkedMessages.length; i++) {
            const chunk = chunkedMessages[i];

            // Create a summary of previous chunks if we have them
            if (i > 0 && processedContext.length > 0) {
                try {
                    const summaryResponse = await callPortkeyDirectAPI(
                        processedContext,
                        apiKey,
                        apiUrl,
                        virtualKey,
                        language,
                        customPrompts,
                        modelIdentifier
                    );
                    conversationSummary = summaryResponse.summary;
                } catch (error) {
                    console.warn('Failed to create conversation summary:', error);
                }
            }

            // Process current chunk
            const chunkWithSummary = this.integrateSummaryWithChunk(chunk, conversationSummary, language);

            try {
                const response = await this.callPortkeyLargeContextAPI(
                    chunkWithSummary,
                    apiKey,
                    apiUrl,
                    virtualKey,
                    language,
                    customPrompts,
                    modelIdentifier
                );

                // Update processed context
                processedContext += '\n\n' + chunk.map(msg => `${msg.role}: ${msg.content}`).join('\n');

                // If this is the last chunk, return the response
                if (i === chunkedMessages.length - 1) {
                    return response;
                }
            } catch (error) {
                console.error(`Error processing chunk ${i}:`, error);
                throw error;
            }
        }

        throw new Error('Failed to process large context');
    }

    // Chunk large context into manageable pieces
    private chunkLargeContext(
        messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    ): Array<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> {
        const maxChunkSize = 50000; // ~50K tokens per chunk
        const chunks: Array<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> = [];
        let currentChunk: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
        let currentChunkSize = 0;

        for (const message of messages) {
            const messageSize = message.content.length;

            // If adding this message would exceed chunk size, start a new chunk
            if (currentChunkSize + messageSize > maxChunkSize && currentChunk.length > 0) {
                chunks.push([...currentChunk]);
                currentChunk = [];
                currentChunkSize = 0;
            }

            // Add message to current chunk
            currentChunk.push(message);
            currentChunkSize += messageSize;
        }

        // Add the last chunk if it has content
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }

        return chunks;
    }

    // Integrate conversation summary with current chunk
    private integrateSummaryWithChunk(
        chunk: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
        summary: string,
        language: 'chinese' | 'english'
    ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
        if (!summary) {
            return chunk;
        }

        const summaryMessage = {
            role: 'system' as const,
            content:
                language === 'chinese'
                    ? `之前的对话摘要：${summary}\n\n请基于这个摘要和当前对话继续回答。`
                    : `Previous conversation summary: ${summary}\n\nPlease continue the conversation based on this summary and the current dialogue.`
        };

        return [summaryMessage, ...chunk];
    }

    async callLLMAPI(
        request: LLMRequest & { url?: string; forceFresh?: boolean }
    ): Promise<LLMResponse> {
        try {
            const {
                text,
                model,
                apiKey,
                apiUrl,
                url,
                language = 'chinese',
                forceFresh = false
            } = request;

            console.log('🔥🔥🔥 === CACHE DEBUG START === 🔥🔥🔥');
            console.log('LLM API called with:', { url, model, language, hasText: !!text, forceFresh });

            // Check cache first if URL is provided and not forcing fresh
            if (url && !forceFresh) {
                console.log('🔍🔍🔍 ABOUT TO CHECK CACHE 🔍🔍🔍');
                console.log('Checking cache for URL and language:', url, language);
                const cachedSummary = await SummaryCache.get(url, language);
                if (cachedSummary) {
                    console.log('🎯 CACHE HIT - Returning cached summary for:', `${url}|${language}`);
                    // Get cache entry details for timestamp
                    const cacheEntry = await this.getCacheEntry(url, language);
                    return {
                        summary: cachedSummary,
                        fromCache: true,
                        cachedAt: cacheEntry?.timestamp
                    };
                }
                console.log('❌ CACHE MISS - No cached summary found for:', `${url}|${language}`);
            } else if (forceFresh) {
                console.log('🔄 FORCE FRESH - Skipping cache check due to forceFresh flag');
            } else {
                console.log('⚠️ No URL provided, skipping cache check');
            }

            // Cache miss or no URL provided, make API call
            console.log('🌐 Making fresh API call...');
            let apiResponse: LLMResponse;

            if (model === 'claude') {
                console.log('Using Anthropic Claude API');
                apiResponse = await callClaudeAPI(
                    text,
                    apiKey,
                    language,
                    request.customPrompts,
                    request.modelIdentifier
                );
            } else if (model === 'portkey') {
                console.log('Using Portkey API');
                apiResponse = await callPortkeyAPI(
                    text,
                    apiKey,
                    apiUrl,
                    request.virtualKey,
                    language,
                    request.customPrompts,
                    request.modelIdentifier
                );
            } else {
                console.log('Using OpenRouter API');
                apiResponse = await callOpenRouterAPI(
                    text,
                    model,
                    apiKey,
                    apiUrl,
                    language,
                    request.customPrompts,
                    request.modelIdentifier
                );
            }

            // Cache the response if successful and URL is provided
            if (url && apiResponse.summary && !apiResponse.error) {
                console.log('💾💾💾 ABOUT TO STORE IN CACHE 💾💾💾');
                console.log('💾 Storing in cache:', {
                    url,
                    language,
                    responseLength: apiResponse.summary.length
                });
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



    async callChatAPI(request: ChatRequest & { tabId?: number }): Promise<LLMResponse> {
        try {
            const {
                messages,
                model,
                apiKey,
                apiUrl,
                virtualKey,
                language = 'chinese',
                customPrompts,
                tabId
            } = request;

            console.log('Chat API called with:', {
                model,
                language,
                messageCount: messages.length,
                tabId
            });

            // Store conversation context for this tab if provided
            if (tabId !== undefined) {
                this.conversationContexts.set(`tab_${tabId}`, messages);
                console.log(
                    `Stored conversation context for tab ${tabId}, total messages: ${messages.length}`
                );
            }

            let apiResponse: LLMResponse;

            if (model === 'claude') {
                console.log('Using Anthropic Claude API for chat');
                apiResponse = await callClaudeChatAPI(
                    messages,
                    apiKey,
                    language,
                    customPrompts,
                    request.modelIdentifier
                );
            } else if (model === 'portkey') {
                console.log('Using Portkey Large Context API for chat');
                // Check if we need extremely large context handling
                const totalLength = messages.reduce((sum, msg) => sum + msg.content.length, 0);
                const estimatedTokens = Math.ceil(totalLength / 4);

                if (estimatedTokens > 100000) {
                    console.log(
                        `Detected extremely large context (~${estimatedTokens} tokens), using chunked processing`
                    );
                    apiResponse = await this.handleExtremelyLargeContext(
                        messages,
                        apiKey,
                        apiUrl,
                        virtualKey,
                        language,
                        customPrompts,
                        request.modelIdentifier
                    );
                } else {
                    apiResponse = await this.callPortkeyLargeContextAPI(
                        messages,
                        apiKey,
                        apiUrl,
                        virtualKey,
                        language,
                        customPrompts,
                        request.modelIdentifier
                    );
                }
            } else {
                console.log('Using OpenRouter API for chat');
                apiResponse = await callOpenRouterChatAPI(
                    messages,
                    model,
                    apiKey,
                    apiUrl,
                    language,
                    customPrompts,
                    request.modelIdentifier
                );
            }

            return apiResponse;
        } catch (error) {
            console.error('Chat API call failed:', error);
            return {
                summary: '',
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    getConversationContext(
        tabId: number
    ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> | null {
        const key = `tab_${tabId}`;
        return this.conversationContexts.get(key) || null;
    }

    clearConversationContext(tabId: number): void {
        const key = `tab_${tabId}`;
        this.conversationContexts.delete(key);
        console.log(`Cleared conversation context for tab ${tabId}`);
    }

    clearAllConversationContexts(): void {
        this.conversationContexts.clear();
        console.log('Cleared all conversation contexts');
    }
}

export { RefactorService };
export type { LLMRequest, ChatRequest, LLMResponse };