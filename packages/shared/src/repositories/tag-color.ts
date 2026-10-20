export const TAG_COLORS = [
  '#c2410c',
  '#0f766e',
  '#7c3aed',
  '#b45309',
  '#0369a1',
  '#be123c',
  '#4d7c0f',
  '#9333ea',
  '#a16207',
  '#0e7490',
] as const;

export function tagColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length] ?? TAG_COLORS[0];
}
