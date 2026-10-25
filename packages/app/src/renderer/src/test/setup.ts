import '@testing-library/jest-dom/vitest';

// jsdom 没有实现 matchMedia，而应用用它判断 prefers-reduced-motion。
// 默认返回 matches: false，即「不减少动效」，与真实桌面环境一致。
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}
