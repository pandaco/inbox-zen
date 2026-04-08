const BUTTON_ID = 'inbox-zen-btn';
const PANEL_ID = 'inbox-zen-panel';
const PANEL_WIDTH = '420px';
const PANEL_HEIGHT = '580px';

function createButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.title = 'Gmail Assistant';
  btn.setAttribute('aria-label', 'Open Gmail Assistant');
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06
               a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09
               A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83
               l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09
               A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83
               l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09
               a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83
               l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09
               a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  `;

  Object.assign(btn.style, {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: '99998',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: 'none',
    background: '#1a73e8',
    color: '#fff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    transition: 'background 0.15s, transform 0.15s',
  });

  btn.addEventListener('mouseover', () => {
    btn.style.background = '#1557b0';
    btn.style.transform = 'scale(1.05)';
  });
  btn.addEventListener('mouseout', () => {
    btn.style.background = '#1a73e8';
    btn.style.transform = 'scale(1)';
  });

  btn.addEventListener('click', togglePanel);
  return btn;
}

function createPanel(): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.id = PANEL_ID;

  Object.assign(wrapper.style, {
    position: 'fixed',
    bottom: '84px',
    right: '24px',
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    zIndex: '99999',
    overflow: 'hidden',
    display: 'none',
    border: '1px solid #e0e0e0',
    background: '#fff',
  });

  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('index.html');
  iframe.setAttribute('title', 'Gmail Assistant');
  Object.assign(iframe.style, {
    width: '100%',
    height: '100%',
    border: 'none',
  });

  wrapper.appendChild(iframe);
  return wrapper;
}

function togglePanel(): void {
  const panel = document.getElementById(PANEL_ID) as HTMLDivElement | null;
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
}

function inject(): void {
  if (document.getElementById(BUTTON_ID)) return;
  document.body.appendChild(createButton());
  document.body.appendChild(createPanel());
}

// Listen for search requests from the iframe
window.addEventListener('message', (event: MessageEvent) => {
  if (event.data?.type === 'GMAIL_SEARCH' && typeof event.data.query === 'string') {
    const encoded = encodeURIComponent(event.data.query as string).replace(/%20/g, '+');
    window.location.hash = `#search/${encoded}`;
  }
});

// Gmail is a SPA — body is available immediately but inject once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inject);
} else {
  inject();
}
