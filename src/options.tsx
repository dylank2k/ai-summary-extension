import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

interface Settings {
  model: 'claude' | 'openai';
  apiKey: string;
  apiUrl?: string;
  language: 'chinese' | 'english';
  autoSummarize?: boolean;
}

const Options: React.FC = () => {
  const [settings, setSettings] = useState<Settings>({
    model: 'claude',
    apiKey: '',
    language: 'chinese',
    autoSummarize: true
  });
  const [status, setStatus] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

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
          apiUrl: settings.apiUrl,
          language: settings.language
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

  const showStatus = (message: string, type: 'success' | 'error') => {
    setStatus({ message, type });
    setTimeout(() => setStatus(null), type === 'error' ? 10000 : 3000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings.apiKey) {
      showStatus('API key is required', 'error');
      return;
    }
    saveSettings(settings);
  };

  return (
    <div className="max-w-4xl mx-auto p-8 bg-white min-h-screen">
      {/* Header */}
      <div className="border-b border-gray-200 pb-6 mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AI Page Summarizer Options</h1>
        <p className="text-gray-600">Configure your AI page summarizer settings</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* AI Model Section */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Model Configuration</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                AI Model Provider
              </label>
              <select
                value={settings.model}
                onChange={(e) => setSettings(prev => ({ ...prev, model: e.target.value as 'claude' | 'openai' }))}
                className="block w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-base"
              >
                <option value="claude">Claude (Anthropic)</option>
                <option value="openai">GPT-4 (OpenAI)</option>
              </select>
              <p className="mt-2 text-sm text-gray-500">
                Choose between Claude (Anthropic) or GPT-4 (OpenAI) for text summarization
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Key
              </label>
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                placeholder="Enter your API key"
                className="block w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-base"
              />
              <p className="mt-2 text-sm text-gray-500">
                Get your API key from <a href="https://openrouter.ai" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">openrouter.ai</a> or 
                <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">console.anthropic.com</a>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API URL (optional)
              </label>
              <input
                type="text"
                value={settings.apiUrl || ''}
                onChange={(e) => setSettings(prev => ({ ...prev, apiUrl: e.target.value }))}
                placeholder="https://openrouter.ai/api/v1/chat/completions"
                className="block w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-base"
              />
              <p className="mt-2 text-sm text-gray-500">
                Custom API endpoint URL. Leave empty to use default endpoints.
              </p>
            </div>
          </div>
        </div>

        {/* Language Section */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Language Settings</h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Default Summary Language
            </label>
            <select
              value={settings.language}
              onChange={(e) => setSettings(prev => ({ ...prev, language: e.target.value as 'chinese' | 'english' }))}
              className="block w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-base"
            >
              <option value="chinese">中文 (Chinese)</option>
              <option value="english">English</option>
            </select>
            <p className="mt-2 text-sm text-gray-500">
              Choose the default language for AI-generated summaries
            </p>
          </div>
        </div>

        {/* Behavior Section */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Extension Behavior</h2>
          
          <div className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id="auto-summarize"
                type="checkbox"
                checked={settings.autoSummarize !== false}
                onChange={(e) => setSettings(prev => ({ ...prev, autoSummarize: e.target.checked }))}
                className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
              />
            </div>
            <div className="ml-3 text-sm">
              <label htmlFor="auto-summarize" className="font-medium text-gray-700">
                Auto-summarize on popup open
              </label>
              <p className="text-gray-500">
                Automatically start summarizing the current page when you click the extension icon
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-6">
          <button
            type="submit"
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-md text-base transition-colors"
          >
            Save Settings
          </button>
          <button
            type="button"
            onClick={testApiConnection}
            disabled={isTestingApi}
            className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 font-medium py-3 px-6 rounded-md text-base border border-gray-300 transition-colors"
          >
            {isTestingApi ? 'Testing Connection...' : 'Test API Connection'}
          </button>
        </div>

        {/* Status Message */}
        {status && (
          <div className={`px-4 py-3 rounded-md text-sm whitespace-pre-line ${
            status.type === 'success' 
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}>
            {status.message}
          </div>
        )}
      </form>

      {/* Footer */}
      <div className="mt-12 pt-8 border-t border-gray-200 text-center text-gray-500 text-sm">
        <p>AI Page Summarizer Extension v1.0.0</p>
        <p className="mt-2">
          Need help? Check the extension popup for quick access to settings and features.
        </p>
      </div>
    </div>
  );
};

// Initialize React app
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('options-root');
  if (container) {
    const root = createRoot(container);
    root.render(<Options />);
  }
});