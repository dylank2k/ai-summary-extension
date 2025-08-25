# LLM API Abstraction Layer

This directory contains a unified interface for all LLM API providers, making it easy to switch between different providers without changing the calling code.

## Architecture

### Core Interface (`interface.ts`)
- `LLMProvider`: Base interface that all providers must implement
- `APIConfig`: Configuration object for API calls
- `TextRequest`/`ChatRequest`: Request objects for different types of calls
- `APIProviderFactory`: Factory pattern for managing providers
- Common utility functions for error handling and prompt configuration

### Provider Implementations
- `ClaudeProvider`: Anthropic Claude API
- `OpenRouterProvider`: OpenRouter API (supports OpenAI and Claude models)
- `PortkeyProvider`: Portkey API with SDK and direct API fallback

### Unified Service (`unified.ts`)
- `UnifiedAPIService`: Singleton service that manages all providers
- Convenience functions for easy API calls

## Usage Examples

### Basic Text Summarization
```typescript
import { callUnifiedAPI } from './apis/unified';

// Summarize text using Claude
const result = await callUnifiedAPI('claude', 'Your text here', 'your-api-key', {
  language: 'english',
  modelIdentifier: 'claude-sonnet-4-20250514'
});

// Summarize text using Portkey
const result = await callUnifiedAPI('portkey', 'Your text here', 'your-api-key', {
  virtualKey: 'your-virtual-key',
  apiUrl: 'https://your-custom-endpoint.com'
});
```

### Chat Completion
```typescript
import { callUnifiedChatAPI } from './apis/unified';

const messages = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello, how are you?' }
];

const result = await callUnifiedChatAPI('claude', messages, 'your-api-key', {
  language: 'english'
});
```

### Using the Unified Service Directly
```typescript
import { UnifiedAPIService } from './apis/unified';
import { TextRequest, APIConfig } from './apis/interface';

const service = UnifiedAPIService.getInstance();

const request: TextRequest = {
  text: 'Your text here',
  language: 'english'
};

const config: APIConfig = {
  apiKey: 'your-api-key',
  modelIdentifier: 'gpt-4'
};

const result = await service.summarizeText('openai', request, config);
```

### Getting Available Providers
```typescript
import { UnifiedAPIService } from './apis/unified';

const service = UnifiedAPIService.getInstance();
const providers = service.getAvailableProviders();
console.log('Available providers:', providers); // ['claude', 'openai', 'portkey']
```

## Adding New Providers

To add a new provider:

1. Create a new class that implements `LLMProvider`
2. Register it in the factory in `unified.ts`
3. Export any legacy functions for backward compatibility

Example:
```typescript
export class NewProvider implements LLMProvider {
  getProviderName(): string {
    return 'NewProvider';
  }

  async summarizeText(request: TextRequest, config: APIConfig): Promise<LLMResponse> {
    // Implementation here
  }

  async chatCompletion(request: ChatRequest, config: APIConfig): Promise<LLMResponse> {
    // Implementation here
  }
}

// Register in unified.ts
APIProviderFactory.registerProvider('newprovider', new NewProvider());
```

## Backward Compatibility

All existing API functions are preserved for backward compatibility:
- `callClaudeAPI` / `callClaudeChatAPI`
- `callOpenRouterAPI` / `callOpenRouterChatAPI`
- `callPortkeyAPI` / `callPortkeyDirectAPI` / `callPortkeyDirectLargeContextAPI`

These functions now use the new unified interface internally.

## Benefits

1. **Consistency**: All providers use the same interface
2. **Extensibility**: Easy to add new providers
3. **Maintainability**: Common code is centralized
4. **Error Handling**: Unified error handling across all providers
5. **Type Safety**: Full TypeScript support with proper types
6. **Backward Compatibility**: Existing code continues to work
