const bundledAssets = import.meta.glob('../docs/assets/*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const assetsByProjectPath = new Map(
  Object.entries(bundledAssets).map(([path, url]) => [path.replace(/^\.\.\//, ''), url]),
)

export function resolveAssetSource(source: string): string {
  if (source.startsWith('data:image/')) return source
  const normalized = source.replace(/^\.\//, '').replaceAll('\\', '/')
  return assetsByProjectPath.get(normalized) ?? source
}
