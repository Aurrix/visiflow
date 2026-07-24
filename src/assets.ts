let projectAssets = new Map<string, string>()

export function setProjectAssetSources(sources: Map<string, string>) {
  for (const value of projectAssets.values()) {
    if (value.startsWith('blob:')) URL.revokeObjectURL(value)
  }
  projectAssets = sources
}

export function registerProjectAssetSource(path: string, source: string) {
  const normalized = path.replace(/^\.\//, '').replaceAll('\\', '/')
  const previous = projectAssets.get(normalized)
  if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous)
  projectAssets.set(normalized, source)
}

export function resolveAssetSource(source: string): string {
  if (source.startsWith('data:image/')) return source
  const normalized = source.replace(/^\.\//, '').replaceAll('\\', '/')
  return projectAssets.get(normalized) ?? source
}
