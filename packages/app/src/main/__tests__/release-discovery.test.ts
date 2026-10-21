import { describe, expect, it } from 'vitest';
import { buildReleaseAssetUrl, extractReleaseTag } from '../release-discovery';

describe('extractReleaseTag', () => {
  it('reads the tag from a followed release URL', () => {
    expect(extractReleaseTag('https://github.com/xiao-dudu/memex/releases/tag/v1.1.7')).toBe('v1.1.7');
  });

  it('decodes an encoded tag', () => {
    expect(extractReleaseTag('https://github.com/o/r/releases/tag/v1.0.0-beta.1')).toBe('v1.0.0-beta.1');
  });

  it('returns null when the URL is not a release tag page', () => {
    expect(extractReleaseTag('https://github.com/xiao-dudu/memex/releases')).toBeNull();
    expect(extractReleaseTag('')).toBeNull();
  });

  it('ignores query strings and fragments', () => {
    expect(extractReleaseTag('https://github.com/o/r/releases/tag/v2.0.0?x=1#notes')).toBe('v2.0.0');
  });
});

describe('buildReleaseAssetUrl', () => {
  it('builds a download URL with an encoded file name', () => {
    expect(buildReleaseAssetUrl('o', 'r', 'v1.1.7', 'Memex-Setup-1.1.7.exe')).toBe(
      'https://github.com/o/r/releases/download/v1.1.7/Memex-Setup-1.1.7.exe',
    );
  });

  it('encodes spaces in the file name', () => {
    expect(buildReleaseAssetUrl('o', 'r', 'v1', 'Memex Setup.exe')).toBe(
      'https://github.com/o/r/releases/download/v1/Memex%20Setup.exe',
    );
  });
});
