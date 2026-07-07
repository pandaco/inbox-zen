import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GmailSearchService {
  search(query: string): void {
    // If we are in an iframe (Gmail side panel)
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'GMAIL_SEARCH', query }, 'https://mail.google.com');
      return;
    }

    // If we are in a standalone tab, we need to talk to Gmail tabs via chrome extension APIs
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ url: '*://mail.google.com/*' }, (tabs) => {
        const gmailTab = tabs[0];
        const searchUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(query)}`;
        
        if (gmailTab?.id) {
          chrome.tabs.update(gmailTab.id, { url: searchUrl, active: true });
        } else {
          // No Gmail tab open, open a new one
          chrome.tabs.create({ url: searchUrl });
        }
      });
    }
  }
}
