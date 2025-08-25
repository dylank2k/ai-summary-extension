interface TabInfo {
  id: number;
  url: string;
  title: string;
  text?: string;
}

export async function getAllTabsInfo(): Promise<TabInfo[]> {
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

export async function extractTextFromTab(tabId: number): Promise<string> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Extract text content from the page
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode: node => {
            const parent = node.parentElement;
            if (!parent) {
              return NodeFilter.FILTER_REJECT;
            }

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
        });

        const textNodes: string[] = [];
        let node;

        while ((node = walker.nextNode())) {
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

export type { TabInfo };