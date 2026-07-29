const PREFIX_PATTERNS: RegExp[] = [
  /^SQ\s?\*\s*/i,
  /^SQUARE\s?\*\s*/i,
  /^TST\*\s*/i,
  /^PAYPAL\s?\*\s*/i,
  /^POS\s+/i,
];

const TRAILING_REFERENCE_CODE = /\s+#?\d{4,}$/;

export function normalizeTransactionTitle(raw: string): string {
  if (!raw) return raw;

  let title = raw.trim();
  for (const pattern of PREFIX_PATTERNS) {
    title = title.replace(pattern, '');
  }
  title = title.replace(TRAILING_REFERENCE_CODE, '');
  title = title.replace(/\s+/g, ' ').trim();

  return title;
}
