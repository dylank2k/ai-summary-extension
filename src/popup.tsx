import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { marked } from 'marked';
import './styles.css';

interface Settings {
  model: 'claude' | 'openai';
  apiKey: string;
  apiUrl?: string;
  language: 'chinese' | 'english';
}

interface TabInfo {
  id: number;
  url: string;
  title: string;
}

type TabType = 'current' | 'all-tabs' | 'settings';

const Popup: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('current');
  const [currentTab, setCurrentTab] = useState<chrome.tabs.Tab | null>(null);
  const [settings, setSettings] = useState<Settings>({ 
    model: 'claude', 
    apiKey: '', 
    language: 'chinese' 
  });
  const [summary, setSummary] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [allTabs, setAllTabs] = useState<TabInfo[]>([]);
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  

  useEffect(() => {
    loadSettings();
    loadCurrentTab();
    loadAllTabs();
  }, []);

  // Separate useEffect for auto-summarization that waits for currentTab and settings to be loaded
  useEffect(() => {
    if (currentTab && settings.apiKey && !summary && !error && !isLoading) {
      // Auto-summarize when popup opens and currentTab is available
      const timer = setTimeout(() => {
        summarizeCurrentPage();
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [currentTab, settings.apiKey]);

  const loadSettings = async () => {
    try {
      const result = await chrome.storage.local.get(['settings']);
      if (result.settings) {
        setSettings(prev => ({ ...prev, ...result.settings }));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async (newSettings: Settings) => {
    try {
      await chrome.storage.local.set({ settings: newSettings });
      showStatus('Settings saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      showStatus('Error saving settings', 'error');
    }
  };

  const loadCurrentTab = async () => {
    try {
      // Try multiple approaches to find the active tab
      let activeTab = null;
      
      // First try: Get active tab from the current window
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          activeTab = tab;
        }
      } catch (e) {
        console.log('Method 1 failed:', e);
      }
      
      // Second try: Get active tab from any normal window
      if (!activeTab) {
        try {
          const [tab] = await chrome.tabs.query({ active: true, windowType: 'normal' });
          if (tab && tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
            activeTab = tab;
          }
        } catch (e) {
          console.log('Method 2 failed:', e);
        }
      }
      
      // Third try: Get the last active tab from normal windows
      if (!activeTab) {
        try {
          const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
          for (const window of windows) {
            if (window.tabs) {
              const tab = window.tabs.find(t => t.active && t.url && 
                !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'));
              if (tab) {
                activeTab = tab;
                break;
              }
            }
          }
        } catch (e) {
          console.log('Method 3 failed:', e);
        }
      }
      
      // Fourth try: Get any valid tab if still no active tab found
      if (!activeTab) {
        try {
          const tabs = await chrome.tabs.query({});
          activeTab = tabs.find(tab => tab.url && 
            !tab.url.startsWith('chrome://') && 
            !tab.url.startsWith('chrome-extension://') &&
            !tab.url.startsWith('moz-extension://'));
        } catch (e) {
          console.log('Method 4 failed:', e);
        }
      }
      
      console.log('Active tab found:', activeTab);
      setCurrentTab(activeTab || null);
    } catch (error) {
      console.error('Error loading current tab:', error);
    }
  };

  const loadAllTabs = async () => {
    try {
      const tabs = await chrome.runtime.sendMessage({ action: 'getAllTabs' });
      setAllTabs(tabs);
    } catch (error) {
      console.error('Error loading tabs:', error);
    }
  };

  const summarizeCurrentPage = async () => {
    // Refresh current tab info before attempting summarization
    await loadCurrentTab();
    
    if (!currentTab || !currentTab.id) {
      setError('No suitable tab found. Please navigate to a webpage and try again.');
      return;
    }

    // Check if the tab URL is valid for summarization
    if (!currentTab.url || 
        currentTab.url.startsWith('chrome://') || 
        currentTab.url.startsWith('chrome-extension://') ||
        currentTab.url.startsWith('moz-extension://')) {
      setError('Cannot summarize this page. Please navigate to a regular webpage.');
      return;
    }

    if (!settings.apiKey) {
      setError('Please configure your API key in Settings');
      setActiveTab('settings'); // Switch to settings tab
      return;
    }

    setIsLoading(true);
    setError('');
    setSummary('');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'extractTabText',
        tabId: currentTab.id
      });

      if (!response || response.length === 0) {
        throw new Error('Could not extract text from the page. The page might be empty or blocked.');
      }

      if (response.length < 50) {
        throw new Error('Page content is too short to summarize meaningfully.');
      }

      const llmResponse = await chrome.runtime.sendMessage({
        action: 'summarizeText',
        url: currentTab.url,
        data: {
          text: response,
          model: settings.model,
          apiKey: settings.apiKey,
          apiUrl: settings.apiUrl,
          language: settings.language
        }
      });

      if (llmResponse.error) {
        throw new Error(llmResponse.error);
      }

      setSummary(llmResponse.summary);
    } catch (error) {
      console.error('Summarization error:', error);
      setError(error instanceof Error ? error.message : 'Summarization failed');
    } finally {
      setIsLoading(false);
    }
  };

  const testApiConnection = async () => {
    if (!settings.apiKey) {
      showStatus('Please enter an API key first', 'error');
      return;
    }

    setIsTestingApi(true);
    
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'summarizeText',
        data: {
          text: 'This is a test message to verify API connectivity.',
          model: settings.model,
          apiKey: settings.apiKey,
          apiUrl: settings.apiUrl
        }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      showStatus('API connection successful!', 'success');
    } catch (error) {
      console.error('API test failed:', error);
      
      let errorMessage = 'API test failed';
      
      if (error instanceof Error) {
        errorMessage += `:\n\nError: ${error.message}`;
        
        if (error.message.includes('404')) {
          errorMessage += '\n\nThis usually means the API endpoint URL is incorrect.';
        } else if (error.message.includes('401') || error.message.includes('403')) {
          errorMessage += '\n\nThis usually means your API key is invalid or has insufficient permissions.';
        } else if (error.message.includes('429')) {
          errorMessage += '\n\nRate limit exceeded. Please wait before trying again.';
        } else if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
          errorMessage += '\n\nServer error. The API service may be temporarily unavailable.';
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          errorMessage += '\n\nNetwork error. Check your internet connection and firewall settings.';
        }
        
        errorMessage += `\n\nDebug Info:`;
        errorMessage += `\nModel: ${settings.model}`;
        if (settings.model === 'claude') {
          errorMessage += `\nAPI: Anthropic Claude API`;
        } else {
          errorMessage += `\nAPI URL: ${settings.apiUrl || 'Default (OpenRouter)'}`;
        }
        errorMessage += `\nAPI Key: ${settings.apiKey ? `${settings.apiKey.substring(0, 8)}...` : 'Not set'}`;
      } else {
        errorMessage += ': Unknown error occurred';
      }
      
      showStatus(errorMessage, 'error');
    } finally {
      setIsTestingApi(false);
    }
  };

  const openDetachedWindow = async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'openDetachedWindow' });
      window.close();
    } catch (error) {
      console.error('Error opening detached window:', error);
      showStatus('Error opening detached window', 'error');
    }
  };

  const focusTab = async (tabId: number) => {
    try {
      await chrome.tabs.update(tabId, { active: true });
    } catch (error) {
      console.error('Error focusing tab:', error);
    }
  };

  const showStatus = (message: string, type: 'success' | 'error') => {
    setStatus({ message, type });
    setTimeout(() => setStatus(null), type === 'error' ? 10000 : 3000);
  };

  const handleSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings.apiKey) {
      showStatus('API key is required', 'error');
      return;
    }
    saveSettings(settings);
  };


  const renderSummary = () => {
    if (!summary) return null;

    try {
      const htmlContent = marked.parse(summary) as string;
      return (
        <div 
          className="prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      );
    } catch (error) {
      console.error('Markdown parsing error:', error);
      return <div className="whitespace-pre-wrap">{summary}</div>;
    }
  };

  return (
    <div className="chrome-popup bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 pb-3 mb-3">
        <h1 className="text-lg font-semibold text-blue-600 m-0">AI Page Summarizer</h1>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-gray-200 mb-3">
        <nav className="flex space-x-0 -mb-px">
          <button
            className={`tab-button ${activeTab === 'current' ? 'active' : ''}`}
            onClick={() => setActiveTab('current')}
          >
            Current Page
          </button>
          <button
            className={`tab-button ${activeTab === 'all-tabs' ? 'active' : ''}`}
            onClick={() => setActiveTab('all-tabs')}
          >
            All Tabs
          </button>
          <button
            className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Current Page Tab */}
        {activeTab === 'current' && (
          <div className="flex flex-col h-full space-y-3">
            {/* Page Info Card */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex justify-between items-start">
                <div className="flex-1 mr-2 min-w-0">
                  <h2 className="text-sm font-medium text-gray-900 truncate mb-1">
                    {currentTab?.title || 'Loading...'}
                  </h2>
                  <p className="text-xs text-gray-500 break-all">
                    {currentTab?.url || ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={loadCurrentTab}
                    className="p-1.5 text-gray-400 hover:text-gray-600 border border-gray-300 rounded text-xs"
                    title="Refresh current tab"
                  >
                    ⟳
                  </button>
                  <button
                    onClick={openDetachedWindow}
                    className="p-1.5 text-blue-500 hover:text-blue-700 border border-blue-300 rounded text-xs"
                    title="Open in detached window"
                  >
                    ↗
                  </button>
                </div>
              </div>
            </div>

            {/* Action Controls */}
            <div className="flex gap-2 items-end">
              <div className="flex-shrink-0">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Language
                </label>
                <select
                  value={settings.language}
                  onChange={(e) => setSettings(prev => ({ ...prev, language: e.target.value as 'chinese' | 'english' }))}
                  className="block w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="chinese">中文</option>
                  <option value="english">English</option>
                </select>
              </div>
              <div className="flex-1">
                <button
                  onClick={summarizeCurrentPage}
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-md text-sm transition-colors"
                >
                  {isLoading ? (
                    <>
                      <span className="inline-block animate-spin mr-2">⟳</span>
                      Auto-summarizing...
                    </>
                  ) : (
                    'Summarize Page'
                  )}
                </button>
              </div>
            </div>

            {/* Summary Result */}
            {summary && (
              <div className="flex-1 bg-white border border-gray-200 rounded-lg shadow-sm flex flex-col min-h-0">
                <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 rounded-t-lg">
                  <h3 className="text-sm font-medium text-gray-900 m-0">Summary</h3>
                </div>
                <div className="flex-1 p-3 overflow-y-auto min-h-0">
                  {renderSummary()}
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        {/* All Tabs Tab */}
        {activeTab === 'all-tabs' && (
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-medium text-gray-900 m-0">All Tabs</h2>
              <button
                onClick={loadAllTabs}
                className="px-2 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {allTabs.length === 0 ? (
                <div className="text-center text-gray-500 text-sm">Loading tabs...</div>
              ) : (
                allTabs.map(tab => (
                  <div
                    key={tab.id}
                    onClick={() => focusTab(tab.id)}
                    className="border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50 hover:border-blue-300 transition-colors"
                  >
                    <h4 className="text-sm font-medium text-gray-900 mb-1 truncate">
                      {tab.title}
                    </h4>
                    <p className="text-xs text-gray-500 break-all">
                      {tab.url}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSettingsSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AI Model
              </label>
              <select
                value={settings.model}
                onChange={(e) => setSettings(prev => ({ ...prev, model: e.target.value as 'claude' | 'openai' }))}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="claude">Claude (Anthropic)</option>
                <option value="openai">GPT-4 (OpenAI)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key
              </label>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="Enter your API key"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Uses OpenRouter API - get your key at openrouter.ai
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API URL (optional)
              </label>
              <input
                type="text"
                value={settings.apiUrl || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, apiUrl: e.target.value }))}
                placeholder="https://openrouter.ai/api/v1/chat/completions"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md text-sm transition-colors"
              >
                Save Settings
              </button>
              <button
                type="button"
                onClick={testApiConnection}
                disabled={isTestingApi}
                className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-md text-sm border border-gray-300 transition-colors"
              >
                {isTestingApi ? 'Testing...' : 'Test API'}
              </button>
            </div>

            {status && (
              <div className={`px-3 py-2 rounded-md text-sm whitespace-pre-line ${
                status.type === 'success' 
                  ? 'bg-green-50 border border-green-200 text-green-700'
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {status.message}
              </div>
            )}
          </form>
        )}
      </div>

    </div>
  );
};

// Initialize React app
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(<Popup />);
  }
});