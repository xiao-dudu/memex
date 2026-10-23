import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// pnpm 下 vitest 存在两份类型副本，jest-dom 自带的模块增强只会落在另一份上，
// 导致 toBeChecked 等 matcher 在 tsc 下不可见。这里按本包解析到的那份补齐同样的增强。
declare module 'vitest' {
  interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}
