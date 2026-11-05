// Pure attachment-chip selection: show at most three chips plus "N more".

export type AttachmentChipSelection<T> = {
  visible: T[];
  hiddenCount: number;
};

export function selectAttachmentChips<T>(
  items: T[],
  options: { expanded?: boolean; limit?: number } = {},
): AttachmentChipSelection<T> {
  const limit = Math.max(0, options.limit ?? 3);
  if (options.expanded || items.length <= limit) {
    return { visible: items, hiddenCount: 0 };
  }
  return {
    visible: items.slice(0, limit),
    hiddenCount: items.length - limit,
  };
}
