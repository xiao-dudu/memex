import type { MemexApi } from '@memex/shared/ipc';

declare global {
  interface Window {
    memex: MemexApi;
  }
}

export {};
