// Background service worker for managing tabs and API calls
import { getAllTabsInfo, extractTextFromTab } from './tab';
import { BackgroundService } from './service';
import { RefactorService } from './refactor_service';

// Message handling
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const service = BackgroundService.getInstance();

  switch (request.action) {
    case 'getAllTabs':
      getAllTabsInfo().then(sendResponse);
      return true;

    case 'extractTabText':
      extractTextFromTab(request.tabId).then(sendResponse);
      return true;

    case 'startSummarize':
      // Start async summarization and return request ID immediately
      console.log('Start summarize request received:', {
        url: request.url,
        hasData: !!request.data,
        forceFresh: request.forceFresh
      });
      const dataWithUrl = { ...request.data, url: request.url, forceFresh: request.forceFresh };
      service
        .startLLMRequest(dataWithUrl, request.requestId)
        .then(requestId => {
          sendResponse({ requestId });
        })
        .catch(error => {
          sendResponse({ error: error.message });
        });
      return true;

    case 'getRequestStatus':
      // Check status of a request by ID
      const status = service.getRequestStatus(request.requestId);
      sendResponse(status);
      return true;

    case 'summarizeText':
      // Legacy synchronous method (kept for compatibility)
      console.log('Summarize request received:', {
        url: request.url,
        hasData: !!request.data,
        forceFresh: request.forceFresh
      });
      const legacyDataWithUrl = {
        ...request.data,
        url: request.url,
        forceFresh: request.forceFresh
      };
      const refactorService = RefactorService.getInstance();
      refactorService.callLLMAPI(legacyDataWithUrl).then(sendResponse);
      return true;


    case 'getCacheStats':
      service.getCacheStats().then(sendResponse);
      return true;

    case 'clearCache':
      service.clearCache().then(() => sendResponse({ success: true }));
      return true;

    case 'chatMessage':
      // Include tab ID for context tracking
      const chatRequest = { ...request.data, tabId: request.tabId };
      service.callChatAPI(chatRequest).then(sendResponse);
      return true;

    case 'getConversationContext':
      // Get stored conversation context for a tab
      const context = service.getConversationContext(request.tabId);
      sendResponse({ context });
      return true;

    case 'clearConversationContext':
      // Clear conversation context for a tab
      service.clearConversationContext(request.tabId);
      sendResponse({ success: true });
      return true;

    default:
      sendResponse({ error: 'Unknown action' });
      return true;
  }
});

// The extension now uses default popup behavior defined in manifest.json
// No need for custom action click handler

// Extension installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI Page Summarizer extension installed');
});
