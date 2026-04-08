import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GmailSearchService {
  search(query: string): void {
    window.parent.postMessage({ type: 'GMAIL_SEARCH', query }, '*');
  }
}
