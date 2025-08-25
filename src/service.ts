// Background service worker for managing tabs and API calls
import { SummaryCache } from './cache';
import { RefactorService } from './refactor_service';

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

interface PendingRequest {
  id: string;
  tabUrl: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: LLMResponse;
  error?: string;
  timestamp: number;
}

class BackgroundService {
  private static instance: BackgroundService;
  private pendingRequests = new Map<string, PendingRequest>();

  static getInstance(): BackgroundService {
    if (!this.instance) {
      this.instance = new BackgroundService();
      this.instance.startCleanupTimer();
    }
    return this.instance;
  }

  private startCleanupTimer() {
    // Clean up old requests every 5 minutes
    setInterval(
      () => {
        this.cleanupOldRequests();
      },
      5 * 60 * 1000
    );
  }


  private cleanupOldRequests() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes

    for (const [id, request] of this.pendingRequests) {
      if (now - request.timestamp > maxAge) {
        console.log('Cleaning up old request:', id);
        this.pendingRequests.delete(id);
      }
    }
  }



  async startLLMRequest(
    request: LLMRequest & { url?: string; forceFresh?: boolean },
    requestId?: string
  ): Promise<string> {
    const id = requestId || this.generateRequestId();
    const pendingRequest: PendingRequest = {
      id,
      tabUrl: request.url || '',
      status: 'pending',
      timestamp: Date.now()
    };

    this.pendingRequests.set(id, pendingRequest);

    // Process request asynchronously
    this.processLLMRequest(id, request).catch(error => {
      console.error('LLM request processing failed:', error);
      const req = this.pendingRequests.get(id);
      if (req) {
        req.status = 'error';
        req.error = error instanceof Error ? error.message : 'Unknown error';
        this.pendingRequests.set(id, req);
      }
    });

    return id;
  }

  async processLLMRequest(
    requestId: string,
    request: LLMRequest & { url?: string; forceFresh?: boolean }
  ): Promise<void> {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      return;
    }

    pendingRequest.status = 'processing';
    this.pendingRequests.set(requestId, pendingRequest);

    try {
      const refactorService = RefactorService.getInstance();
      const result = await refactorService.callLLMAPI(request);
      pendingRequest.status = 'completed';
      pendingRequest.result = result;
      this.pendingRequests.set(requestId, pendingRequest);
    } catch (error) {
      pendingRequest.status = 'error';
      pendingRequest.error = error instanceof Error ? error.message : 'Unknown error';
      this.pendingRequests.set(requestId, pendingRequest);
    }
  }

  getRequestStatus(requestId: string): PendingRequest | null {
    return this.pendingRequests.get(requestId) || null;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }



  async getCacheStats() {
    return await SummaryCache.getStats();
  }

  async clearCache() {
    return await SummaryCache.clear();
  }

  async callChatAPI(request: ChatRequest & { tabId?: number }): Promise<LLMResponse> {
    const refactorService = RefactorService.getInstance();
    return await refactorService.callChatAPI(request);
  }




  getConversationContext(
    tabId: number
  ): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> | null {
    const refactorService = RefactorService.getInstance();
    return refactorService.getConversationContext(tabId);
  }

  clearConversationContext(tabId: number): void {
    const refactorService = RefactorService.getInstance();
    refactorService.clearConversationContext(tabId);
  }

  clearAllConversationContexts(): void {
    const refactorService = RefactorService.getInstance();
    refactorService.clearAllConversationContexts();
  }
}

export { BackgroundService };
export type { LLMRequest, ChatRequest, LLMResponse, PendingRequest };
