const WANTED_FIELDS = new Map([
  ['Store', 'store'],
  ['Alias', 'alias'],
  ['MD5', 'md5'],
  ['SHA-256', 'sha256'],
  ['Valid until', 'validUntil'],
]);

export function parseSigningReport(output) {
  const variants = [];
  let current;

  for (const line of output.split(/\r?\n/)) {
    const variantMatch = line.match(/^\s*>?\s*Variant:\s*(.+?)\s*$/);
    if (variantMatch) {
      if (current) variants.push(current);
      current = { variant: variantMatch[1] };
      continue;
    }

    if (!current) continue;
    const fieldMatch = line.match(/^\s*>?\s*(Store|Alias|MD5|SHA-256|Valid until):\s*(.*?)\s*$/);
    if (!fieldMatch) continue;
    current[WANTED_FIELDS.get(fieldMatch[1])] = normalizeValue(fieldMatch[2]);
  }

  if (current) variants.push(current);

  return variants.filter(({ variant }) => /(?:debug|release)$/i.test(variant));
}

function normalizeValue(value) {
  return value && value.toLowerCase() !== 'null' ? value : 'Not configured';
}

export function formatSigningReport(variants) {
  return variants
    .map(({ variant, store, alias, md5, sha256, validUntil }) => [
      variant,
      `  Store: ${store || 'Not configured'}`,
      `  Alias: ${alias || 'Not configured'}`,
      `  MD5: ${md5 || 'Not configured'}`,
      `  SHA-256: ${sha256 || 'Not configured'}`,
      `  Valid until: ${validUntil || 'Not configured'}`,
    ].join('\n'))
    .join('\n\n');
}
