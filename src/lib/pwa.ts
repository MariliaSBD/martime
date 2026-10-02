export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV || import.meta.env.VITE_NO_SW === '1') return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL, type: 'classic' });
  });
}
