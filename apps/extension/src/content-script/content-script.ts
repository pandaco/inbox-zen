const BUTTON_ID = 'inbox-zen-btn';
const PANEL_ID = 'inbox-zen-panel';
const STYLE_ID = 'inbox-zen-styles';
const STORAGE_KEY = 'inbox-zen-dimensions';
const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 580;
const MAX_WIDTH_RATIO = 0.9; // of viewport width
const MAX_HEIGHT_RATIO = 0.8; // of viewport height

// Set when the panel is created; used to authenticate incoming postMessages.
let panelIframe: HTMLIFrameElement | null = null;

/**
 * All theming lives in an injected stylesheet so the widget can follow the
 * OS light/dark preference. Only behavioral styles (visibility, size) are
 * set inline.
 */
function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${BUTTON_ID} {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99998;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      border: none;
      background: #1a73e8;
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      transition: background 0.15s, transform 0.15s;
    }
    #${BUTTON_ID}:hover {
      background: #1557b0;
      transform: scale(1.05);
    }
    #${PANEL_ID} {
      position: fixed;
      bottom: 84px;
      right: 24px;
      min-width: 300px;
      min-height: 400px;
      max-width: ${MAX_WIDTH_RATIO * 100}vw;
      max-height: ${MAX_HEIGHT_RATIO * 100}vh;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
      z-index: 99999;
      overflow: hidden;
      border: 1px solid #e0e0e0;
      background: #fff;
    }
    #${PANEL_ID} .inbox-zen-resize {
      position: absolute;
      top: 0;
      left: 0;
      width: 24px;
      height: 24px;
      cursor: nwse-resize;
      z-index: 100000;
      background: linear-gradient(135deg, #1a73e8 35%, transparent 35%);
      border-radius: 12px 0 0 0;
      opacity: 0.4;
      transition: opacity 0.2s;
    }
    #${PANEL_ID} .inbox-zen-resize:hover {
      opacity: 0.8;
    }
    #${PANEL_ID} iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    @media (prefers-color-scheme: dark) {
      #${BUTTON_ID} {
        background: #8ab4f8;
        color: #202124;
      }
      #${BUTTON_ID}:hover {
        background: #aecbfa;
      }
      #${PANEL_ID} {
        border-color: #3c4043;
        background: #202124;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      }
      #${PANEL_ID} .inbox-zen-resize {
        background: linear-gradient(135deg, #8ab4f8 35%, transparent 35%);
      }
    }
  `;
  document.head.appendChild(style);
}

function createButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.id = BUTTON_ID;
  btn.title = chrome.i18n.getMessage('csOpenAssistant');
  btn.setAttribute('aria-label', chrome.i18n.getMessage('csOpenAssistant'));
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

  btn.addEventListener('click', togglePanel);
  return btn;
}

function clampWidth(width: number): number {
  return Math.min(width, Math.floor(window.innerWidth * MAX_WIDTH_RATIO));
}

function clampHeight(height: number): number {
  return Math.min(height, Math.floor(window.innerHeight * MAX_HEIGHT_RATIO));
}

function createPanel(): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.id = PANEL_ID;
  // Behavioral inline styles only — theming is in the injected stylesheet.
  wrapper.style.width = DEFAULT_WIDTH + 'px';
  wrapper.style.height = DEFAULT_HEIGHT + 'px';
  wrapper.style.display = 'none';

  // Load and apply stored dimensions, clamped to the current viewport
  // (they may have been saved on a larger monitor).
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    const dims = data[STORAGE_KEY] as { width: number; height: number } | undefined;
    if (dims) {
      wrapper.style.width = clampWidth(dims.width) + 'px';
      wrapper.style.height = clampHeight(dims.height) + 'px';
    }
  });

  // Resize handle (top-left) — the panel is anchored bottom-right
  const handle = document.createElement('div');
  handle.className = 'inbox-zen-resize';
  handle.title = chrome.i18n.getMessage('csResize');

  let isResizing = false;
  handle.addEventListener('mousedown', (e) => {
    isResizing = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = parseInt(window.getComputedStyle(wrapper).width);
    const startHeight = parseInt(window.getComputedStyle(wrapper).height);

    // Cover the iframe with a transparent overlay to avoid mouse events being lost
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'absolute', top: '0', left: '0', right: '0', bottom: '0', zIndex: '99999'
    });
    wrapper.appendChild(overlay);

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing) return;

      // Resizing from top-left:
      // moving mouse left (deltaX negative) -> increases width
      // moving mouse up (deltaY negative) -> increases height
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const newWidth = Math.max(300, startWidth - deltaX);
      const newHeight = Math.max(400, startHeight - deltaY);

      wrapper.style.width = newWidth + 'px';
      wrapper.style.height = newHeight + 'px';
    };

    const onMouseUp = () => {
      isResizing = false;
      wrapper.removeChild(overlay);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      // Persist dimensions
      chrome.storage.local.set({
        [STORAGE_KEY]: {
          width: parseInt(wrapper.style.width),
          height: parseInt(wrapper.style.height)
        }
      });
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    e.preventDefault();
  });

  wrapper.appendChild(handle);

  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('index.html');
  iframe.setAttribute('title', 'Gmail Assistant');

  wrapper.appendChild(iframe);
  panelIframe = iframe;
  return wrapper;
}

function togglePanel(): void {
  const panel = document.getElementById(PANEL_ID) as HTMLDivElement | null;
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) {
    // Move focus into the panel so keyboard users land in the app.
    panelIframe?.contentWindow?.focus();
  }
}

function closePanel(): void {
  const panel = document.getElementById(PANEL_ID);
  if (panel) {
    (panel as HTMLDivElement).style.display = 'none';
  }
}

function inject(): void {
  if (document.getElementById(BUTTON_ID)) return;
  injectStyles();
  document.body.appendChild(createButton());
  document.body.appendChild(createPanel());
}

// Listen for search or UI requests from the iframe.
// Only accept messages coming from our own panel iframe — anything else
// (Gmail scripts, other frames) is ignored.
window.addEventListener('message', (event: MessageEvent) => {
  if (!panelIframe || event.source !== panelIframe.contentWindow) return;
  if (event.origin !== `chrome-extension://${chrome.runtime.id}`) return;

  if (event.data?.type === 'GMAIL_SEARCH' && typeof event.data.query === 'string') {
    const encoded = encodeURIComponent(event.data.query as string).replace(/%20/g, '+');
    window.location.hash = `#search/${encoded}`;
  }

  if (event.data?.type === 'CLOSE_PANEL') {
    closePanel();
  }
});

// Escape closes the panel when Gmail itself has focus (the app handles the
// case where focus is inside the iframe).
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const panel = document.getElementById(PANEL_ID) as HTMLDivElement | null;
  if (panel && panel.style.display !== 'none') {
    closePanel();
  }
});

// Gmail is a SPA — body is available immediately but inject once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inject);
} else {
  inject();
}
