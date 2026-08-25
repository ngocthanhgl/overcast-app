import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {Capacitor} from '@capacitor/core';
import {StatusBar, Style} from '@capacitor/status-bar';
import {App as CapacitorApp} from '@capacitor/app';
import App from './App.tsx';
import './index.css';
import {ErrorBoundary} from './components/ErrorBoundary.tsx';

async function initNativeSystemBars() {
  try {
    if (!Capacitor.isNativePlatform()) return;
    await StatusBar.setOverlaysWebView({overlay: true});
    void CapacitorApp.addListener('backButton', ({canGoBack}) => {
      const handler = (window as unknown as {__overcastBackHandler?: () => void}).__overcastBackHandler;
      if (typeof handler === 'function') {
        handler();
        return;
      }
      if (!canGoBack) {
        CapacitorApp.exitApp();
      } else {
        window.history.back();
      }
    });

    let lastStyle: Style | null = null;

    // Average color of the pixels behind the status bar (top strip of the
    // fullscreen atmosphere canvas), falling back to the painted DOM background.
    const sampleTopLuminance = (): number => {
      let r = 0, g = 0, b = 0, sampled = false;
      const canvas = Array.from(document.querySelectorAll('canvas')).find((cv) => {
        const rect = cv.getBoundingClientRect();
        return (
          getComputedStyle(cv).display !== 'none' &&
          rect.width >= window.innerWidth * 0.9 &&
          rect.height >= window.innerHeight * 0.9
        );
      });
      if (canvas) {
        try {
          const ctx = canvas.getContext('2d');
          if (ctx && canvas.width > 0 && canvas.height > 0) {
            const cw = Math.max(1, Math.min(50, canvas.width));
            const ch = Math.max(1, Math.min(20, canvas.height));
            const px = ctx.getImageData(0, 0, cw, ch).data;
            let sr = 0, sg = 0, sb = 0;
            for (let i = 0; i < px.length; i += 4) {
              sr += px[i]; sg += px[i + 1]; sb += px[i + 2];
            }
            const n = px.length / 4;
            r = sr / n; g = sg / n; b = sb / n;
            sampled = true;
          }
        } catch { /* tainted or zero-sized canvas — use DOM fallback */ }
      }
      if (!sampled) {
        r = g = b = 255;
        let el: HTMLElement | null = document.getElementById('root');
        while (el) {
          const m = getComputedStyle(el).backgroundColor.match(
            /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/
          );
          if (m && (m[4] === undefined || parseFloat(m[4]) > 0.05)) {
            r = +m[1]; g = +m[2]; b = +m[3];
            break;
          }
          el = el.parentElement;
        }
      }
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };

    const applyIcons = () => {
      if (document.hidden) return;
      const style = sampleTopLuminance() < 0.45 ? Style.Light : Style.Dark;
      if (style !== lastStyle) {
        lastStyle = style;
        StatusBar.setStyle({style}).catch(() => {});
      }
    };

    applyIcons();
    window.setInterval(applyIcons, 2000);
    document.addEventListener('visibilitychange', applyIcons);
    new MutationObserver(applyIcons).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme', 'data-color-theme'],
    });
  } catch {
    return;
  }
}
void initNativeSystemBars();

window.addEventListener('error', (event) => {
  const msg = event.message?.toLowerCase() || '';
  if (
    msg.includes('script error') ||
    msg.includes('failed to fetch') || 
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('mime type') ||
    msg.includes('unexpected token') ||
    msg.includes('cross-origin')
  ) {
    return;
  }

  const errorInfo = {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    errorObj: event.error ? {
      message: event.error.message,
      stack: event.error.stack
    } : 'None'
  };
  console.error('Global capture:', JSON.stringify(errorInfo, null, 2));
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.message?.toLowerCase() || String(event.reason).toLowerCase();
  
  // Silence cryptic promise rejections that are already handled by the UI
  if (
    reason.includes('script error') || 
    reason.includes('failed to fetch') || 
    reason.includes('abort') ||
    reason.includes('timeout')
  ) {
    event.preventDefault(); // Prevent browser from logging to console
    return;
  }
  
  console.error('Unhandled Promise Rejection:', event.reason);
});

// Improve scrolling performance in WebView
window.addEventListener('touchstart', () => {}, { passive: true });
window.addEventListener('touchmove', () => {}, { passive: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
