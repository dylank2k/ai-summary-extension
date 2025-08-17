// Popup script for the Chrome extension UI
import { marked } from 'marked';

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

class PopupController {
  private currentTab: chrome.tabs.Tab | null = null;
  private settings: Settings = { model: 'claude', apiKey: '', language: 'chinese' };

  constructor() {
    this.initializePopup();
  }

  private async initializePopup(): Promise<void> {
    await this.loadSettings();
    await this.loadCurrentTab();
    this.setupEventListeners();
    this.setupTabs();
    await this.loadAllTabs();
    
    // Setup comprehensive resize handling
    this.setupResizeObserver();
    
    // Initial layout refresh
    this.refreshLayout();
  }

  private async loadSettings(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['settings']);
      if (result.settings) {
        this.settings = { ...this.settings, ...result.settings };
        this.updateSettingsUI();
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  private async saveSettings(): Promise<void> {
    try {
      await chrome.storage.local.set({ settings: this.settings });
      this.showStatus('Settings saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showStatus('Error saving settings', 'error');
    }
  }

  private async loadCurrentTab(): Promise<void> {
    try {
      // Try to get the last focused window's active tab (for detached popup)
      const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
      let activeTab = null;
      
      // Find the most recently focused normal window with an active tab
      const normalWindows = windows
        .filter(w => w.type === 'normal')
        .sort((a, b) => (b.focused ? 1 : 0) - (a.focused ? 1 : 0));
        
      if (normalWindows.length > 0) {
        const focusedWindow = normalWindows[0];
        activeTab = focusedWindow.tabs?.find(tab => tab.active);
      }
      
      // Fallback: get any active tab from any normal window
      if (!activeTab) {
        const [tab] = await chrome.tabs.query({ active: true, windowType: 'normal' });
        activeTab = tab;
      }
      
      this.currentTab = activeTab;
      this.updateCurrentTabUI();
    } catch (error) {
      console.error('Error loading current tab:', error);
    }
  }

  private updateCurrentTabUI(): void {
    const titleEl = document.getElementById('page-title') as HTMLElement;
    const urlEl = document.getElementById('page-url') as HTMLElement;

    if (this.currentTab) {
      titleEl.textContent = this.currentTab.title || 'Untitled';
      urlEl.textContent = this.currentTab.url || '';
    } else {
      titleEl.textContent = 'No active tab';
      urlEl.textContent = '';
    }
  }

  private async openDetachedWindow(): Promise<void> {
    try {
      // Send message to background to open detached window
      await chrome.runtime.sendMessage({ action: 'openDetachedWindow' });
      
      // Close current popup
      window.close();
    } catch (error) {
      console.error('Error opening detached window:', error);
      this.showStatus('Error opening detached window', 'error');
    }
  }

  private async handleLanguageChange(): Promise<void> {
    try {
      const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
      this.settings.language = languageSelect.value as 'chinese' | 'english';
      await this.saveSettings();
    } catch (error) {
      console.error('Error saving language preference:', error);
    }
  }

  private updateSettingsUI(): void {
    const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
    const apiUrlInput = document.getElementById('api-url-input') as HTMLInputElement;
    const languageSelect = document.getElementById('language-select') as HTMLSelectElement;

    modelSelect.value = this.settings.model;
    apiKeyInput.value = this.settings.apiKey;
    apiUrlInput.value = this.settings.apiUrl || '';
    languageSelect.value = this.settings.language;
  }

  private setupEventListeners(): void {
    // Summarize button
    const summarizeBtn = document.getElementById('summarize-btn') as HTMLButtonElement;
    summarizeBtn.addEventListener('click', () => this.summarizeCurrentPage());

    // Refresh current tab button
    const refreshTabBtn = document.getElementById('refresh-tab-btn') as HTMLButtonElement;
    refreshTabBtn.addEventListener('click', () => this.loadCurrentTab());

    // Detach button
    const detachBtn = document.getElementById('detach-btn') as HTMLButtonElement;
    detachBtn.addEventListener('click', () => this.openDetachedWindow());

    // Language selection
    const languageSelect = document.getElementById('language-select') as HTMLSelectElement;
    languageSelect.addEventListener('change', () => this.handleLanguageChange());

    // Settings form
    const saveSettingsBtn = document.getElementById('save-settings-btn') as HTMLButtonElement;
    saveSettingsBtn.addEventListener('click', () => this.handleSaveSettings());

    const testApiBtn = document.getElementById('test-api-btn') as HTMLButtonElement;
    testApiBtn.addEventListener('click', () => this.testApiConnection());

    // Refresh tabs button
    const refreshTabsBtn = document.getElementById('refresh-tabs-btn') as HTMLButtonElement;
    refreshTabsBtn.addEventListener('click', () => this.loadAllTabs());

    // Resize handle
    this.setupResizeHandle();
  }

  private setupTabs(): void {
    // Bootstrap tab switching
    const tabButtons = document.querySelectorAll('[data-bs-toggle="tab"]');
    
    tabButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        
        const targetId = button.getAttribute('data-bs-target')?.substring(1);
        
        // Remove active classes from all tabs and content
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(pane => {
          pane.classList.remove('show', 'active');
        });
        
        // Add active classes to clicked tab and its content
        button.classList.add('active');
        const targetPane = document.getElementById(targetId!);
        if (targetPane) {
          targetPane.classList.add('show', 'active');
        }
      });
    });
  }

  private async summarizeCurrentPage(): Promise<void> {
    if (!this.currentTab || !this.currentTab.id) {
      this.showError('No active tab found');
      return;
    }

    if (!this.settings.apiKey) {
      this.showError('Please configure your API key in Settings');
      return;
    }

    const summarizeBtn = document.getElementById('summarize-btn') as HTMLButtonElement;
    const btnText = summarizeBtn.querySelector('.btn-text') as HTMLElement;
    const loader = summarizeBtn.querySelector('.spinner-border') as HTMLElement;

    try {
      // Show loading state
      summarizeBtn.disabled = true;
      btnText.textContent = 'Summarizing...';
      loader.classList.remove('d-none');
      this.hideElements(['summary-result', 'error-message']);

      // Extract text from current page
      const response = await chrome.runtime.sendMessage({
        action: 'extractTabText',
        tabId: this.currentTab.id
      });

      if (!response || response.length === 0) {
        throw new Error('Could not extract text from the page');
      }

      // Call LLM API with URL for caching
      console.log('🚀 Popup: Sending summarize request with URL:', this.currentTab.url);
      const llmResponse = await chrome.runtime.sendMessage({
        action: 'summarizeText',
        url: this.currentTab.url, // Add URL for caching
        data: {
          text: response,
          model: this.settings.model,
          apiKey: this.settings.apiKey,
          apiUrl: this.settings.apiUrl,
          language: this.settings.language
        }
      });
      console.log('📨 Popup: Received response from background:', { hasError: !!llmResponse.error, summaryLength: llmResponse.summary?.length });

      if (llmResponse.error) {
        throw new Error(llmResponse.error);
      }

      this.showSummary(llmResponse.summary);

    } catch (error) {
      console.error('Summarization error:', error);
      this.showError(error instanceof Error ? error.message : 'Summarization failed');
    } finally {
      // Reset button state
      summarizeBtn.disabled = false;
      btnText.textContent = 'Summarize Page';
      loader.classList.add('d-none');
    }
  }

  private async loadAllTabs(): Promise<void> {
    const container = document.getElementById('tabs-container') as HTMLElement;
    container.innerHTML = '<div class="loading">Loading tabs...</div>';

    try {
      const tabs = await chrome.runtime.sendMessage({ action: 'getAllTabs' });
      this.renderTabsList(tabs);
    } catch (error) {
      console.error('Error loading tabs:', error);
      container.innerHTML = '<div class="error">Error loading tabs</div>';
    }
  }

  private renderTabsList(tabs: TabInfo[]): void {
    const container = document.getElementById('tabs-container') as HTMLElement;
    
    if (tabs.length === 0) {
      container.innerHTML = '<div class="loading">No tabs found</div>';
      return;
    }

    const tabsHtml = tabs.map(tab => `
      <div class="tab-item" data-tab-id="${tab.id}">
        <h4>${this.escapeHtml(tab.title)}</h4>
        <p>${this.escapeHtml(tab.url)}</p>
      </div>
    `).join('');

    container.innerHTML = tabsHtml;

    // Add click handlers for tab items
    container.querySelectorAll('.tab-item').forEach(item => {
      item.addEventListener('click', () => {
        const tabId = parseInt(item.getAttribute('data-tab-id') || '0');
        this.focusTab(tabId);
      });
    });
  }

  private async focusTab(tabId: number): Promise<void> {
    try {
      await chrome.tabs.update(tabId, { active: true });
      // Don't close window automatically - user can close manually if desired
    } catch (error) {
      console.error('Error focusing tab:', error);
    }
  }

  private handleSaveSettings(): void {
    const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
    const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement;
    const apiUrlInput = document.getElementById('api-url-input') as HTMLInputElement;

    this.settings.model = modelSelect.value as 'claude' | 'openai';
    this.settings.apiKey = apiKeyInput.value.trim();
    this.settings.apiUrl = apiUrlInput.value.trim() || undefined;

    if (!this.settings.apiKey) {
      this.showStatus('API key is required', 'error');
      return;
    }

    this.saveSettings();
  }

  private async testApiConnection(): Promise<void> {
    if (!this.settings.apiKey) {
      this.showStatus('Please enter an API key first', 'error');
      return;
    }

    const testBtn = document.getElementById('test-api-btn') as HTMLButtonElement;
    const originalText = testBtn.textContent;
    
    try {
      // Show loading state
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      
      const response = await chrome.runtime.sendMessage({
        action: 'summarizeText',
        // No URL for test calls (don't cache test messages)
        data: {
          text: 'This is a test message to verify API connectivity.',
          model: this.settings.model,
          apiKey: this.settings.apiKey,
          apiUrl: this.settings.apiUrl
        }
      });

      if (response.error) {
        throw new Error(response.error);
      }

      this.showStatus('API connection successful!', 'success');
    } catch (error) {
      console.error('API test failed:', error);
      
      // Create detailed error message
      let errorMessage = 'API test failed';
      
      if (error instanceof Error) {
        errorMessage += `:\n\nError: ${error.message}`;
        
        // Add more context based on error content
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
        
        // Add debug info
        errorMessage += `\n\nDebug Info:`;
        errorMessage += `\nModel: ${this.settings.model}`;
        if (this.settings.model === 'claude') {
          errorMessage += `\nAPI: Anthropic Claude API`;
        } else {
          errorMessage += `\nAPI URL: ${this.settings.apiUrl || 'Default (OpenRouter)'}`;
        }
        errorMessage += `\nAPI Key: ${this.settings.apiKey ? `${this.settings.apiKey.substring(0, 8)}...` : 'Not set'}`;
      } else {
        errorMessage += ': Unknown error occurred';
      }
      
      this.showDetailedStatus(errorMessage, 'error');
    } finally {
      // Reset button state
      testBtn.disabled = false;
      testBtn.textContent = originalText;
    }
  }

  private showSummary(summary: string): void {
    const summaryResult = document.getElementById('summary-result') as HTMLElement;
    const summaryText = document.getElementById('summary-text') as HTMLElement;
    
    // Configure marked options
    marked.setOptions({
      gfm: true,
      breaks: true
    });
    
    // Parse markdown and render as HTML
    try {
      const htmlContent = marked.parse(summary) as string;
      summaryText.innerHTML = htmlContent;
    } catch (error) {
      console.error('Markdown parsing error:', error);
      // Fallback to plain text if markdown parsing fails
      summaryText.textContent = summary;
    }
    
    summaryResult.classList.remove('d-none');
  }

  private showError(message: string): void {
    const errorEl = document.getElementById('error-message') as HTMLElement;
    errorEl.textContent = message;
    errorEl.classList.remove('d-none');
  }

  private showStatus(message: string, type: 'success' | 'error'): void {
    const statusEl = document.getElementById('settings-status') as HTMLElement;
    statusEl.textContent = message;
    statusEl.className = `alert alert-${type === 'success' ? 'success' : 'danger'}`;
    statusEl.classList.remove('d-none');

    // Hide after 3 seconds
    setTimeout(() => {
      statusEl.classList.add('d-none');
    }, 3000);
  }

  private showDetailedStatus(message: string, type: 'success' | 'error'): void {
    const statusEl = document.getElementById('settings-status') as HTMLElement;
    
    // For detailed messages, preserve line breaks
    statusEl.innerHTML = '';
    const lines = message.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) {
        statusEl.appendChild(document.createElement('br'));
      }
      const textNode = document.createTextNode(line);
      statusEl.appendChild(textNode);
    });
    
    statusEl.className = `alert alert-${type === 'success' ? 'success' : 'danger'}`;
    statusEl.classList.remove('d-none');

    // Hide after 10 seconds for detailed messages (longer read time)
    setTimeout(() => {
      statusEl.classList.add('d-none');
    }, 10000);
  }

  private hideElements(ids: string[]): void {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('d-none');
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private setupResizeHandle(): void {
    const resizeHandle = document.getElementById('resize-handle') as HTMLElement;
    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = document.body.offsetWidth;
      startHeight = document.body.offsetHeight;
      
      // Prevent text selection during resize
      e.preventDefault();
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const newWidth = Math.max(300, startWidth + (e.clientX - startX));
      const newHeight = Math.max(400, startHeight + (e.clientY - startY));

      document.body.style.width = `${newWidth}px`;
      document.body.style.height = `${newHeight}px`;
      
      // Trigger complete re-render
      this.reRenderPopup();
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.userSelect = '';
      }
    });

    // Handle mouse leave to stop resizing
    document.addEventListener('mouseleave', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.userSelect = '';
      }
    });
  }

  private reRenderPopup(): void {
    // Get current window dimensions
    const currentWidth = document.body.offsetWidth;
    
    // Force complete re-render by hiding and showing container
    const container = document.querySelector('.container') as HTMLElement;
    if (container) {
      container.style.display = 'none';
      
      // Force reflow
      container.offsetHeight;
      
      // Show container again
      container.style.display = 'flex';
      
      // Ensure all content fits the new width
      this.adjustContentToFitWidth(currentWidth);
    }
  }

  private setupResizeObserver(): void {
    // Use ResizeObserver for modern browsers or fallback to window resize
    if ((window as any).ResizeObserver) {
      const resizeObserver = new (window as any).ResizeObserver((entries: any[]) => {
        for (const entry of entries) {
          if (entry.target === document.body) {
            this.refreshLayout();
          }
        }
      });
      resizeObserver.observe(document.body);
    }

    // Always listen for window resize events as well
    window.addEventListener('resize', () => {
      this.refreshLayout();
    });
  }

  private refreshLayout(): void {
    // Force recalculation of all layout elements
    this.forceFullWidthLayout();
    this.adjustTabLayout();
    this.adjustSummaryLayout();
    this.adjustFormLayout();
    
    // Small delay to ensure DOM has updated
    setTimeout(() => {
      this.ensureNoHorizontalScroll();
    }, 50);
  }

  private forceFullWidthLayout(): void {
    // Force all major containers to full width
    const selectors = [
      '.container-fluid',
      '.nav-tabs',
      '.nav-tabs .nav-item',
      '.nav-tabs .nav-link',
      '.tab-content',
      '.tab-pane',
      '.card',
      '.card-body',
      '.card-header',
      '.summary-content',
      '.form-control',
      '.form-select',
      '.row',
      '.col',
      '.col-auto'
    ];

    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const element = el as HTMLElement;
        element.style.width = '100%';
        element.style.maxWidth = 'none';
        element.style.minWidth = '0';
        element.style.boxSizing = 'border-box';
      });
    });
  }

  private adjustTabLayout(): void {
    const navTabs = document.querySelector('.nav-tabs') as HTMLElement;
    const tabItems = document.querySelectorAll('.nav-tabs .nav-item') as NodeListOf<HTMLElement>;
    
    if (navTabs && tabItems.length > 0) {
      navTabs.style.display = 'flex';
      navTabs.style.width = '100%';
      navTabs.style.flexWrap = 'nowrap';
      
      tabItems.forEach(item => {
        item.style.flex = '1 1 0%';
        item.style.minWidth = '0';
        
        const link = item.querySelector('.nav-link') as HTMLElement;
        if (link) {
          link.style.width = '100%';
          link.style.textAlign = 'center';
          link.style.overflow = 'hidden';
          link.style.textOverflow = 'ellipsis';
          link.style.whiteSpace = 'nowrap';
        }
      });
    }
  }

  private adjustSummaryLayout(): void {
    const summaryContent = document.querySelector('.summary-content') as HTMLElement;
    if (summaryContent) {
      summaryContent.style.width = '100%';
      summaryContent.style.maxWidth = 'none';
      summaryContent.style.wordWrap = 'break-word';
      summaryContent.style.overflowWrap = 'break-word';
      
      // Ensure child elements also expand
      const children = summaryContent.querySelectorAll('*');
      children.forEach(child => {
        const childEl = child as HTMLElement;
        childEl.style.maxWidth = '100%';
        childEl.style.wordWrap = 'break-word';
      });
    }
  }

  private adjustFormLayout(): void {
    const formControls = document.querySelectorAll('.form-control, .form-select') as NodeListOf<HTMLElement>;
    formControls.forEach(control => {
      control.style.width = '100%';
      control.style.maxWidth = 'none';
    });

    const rows = document.querySelectorAll('.row') as NodeListOf<HTMLElement>;
    rows.forEach(row => {
      row.style.width = '100%';
      row.style.marginLeft = '0';
      row.style.marginRight = '0';
    });
  }

  private ensureNoHorizontalScroll(): void {
    // Check for horizontal scroll and fix if present
    const body = document.body;
    if (body.scrollWidth > body.clientWidth) {
      // Force everything to fit within viewport
      const allElements = document.querySelectorAll('*') as NodeListOf<HTMLElement>;
      allElements.forEach(el => {
        if (el.scrollWidth > body.clientWidth) {
          el.style.maxWidth = '100%';
          el.style.overflow = 'hidden';
          el.style.textOverflow = 'ellipsis';
        }
      });
    }
  }

  private adjustContentToFitWidth(_containerWidth: number): void {
    // Deprecated - use refreshLayout() instead
    this.refreshLayout();
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});