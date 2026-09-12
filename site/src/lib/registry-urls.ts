export type RegistryItemLike = {
  name: string;
  registryDependencies?: string[];
  [key: string]: unknown;
};

/**
 * Rewrites this registry's own dependency names into absolute URLs, so an item
 * resolves for a consumer who has not registered the @blueprint namespace.
 * Upstream shadcn names and entries that are already URLs are left untouched.
 *
 * Not named registry.ts: the specifier "./registry" resolves to the catalogue
 * JSON at the Vite root (site/registry.json) when this file is absent.
 */
export function absolutiseDependencies<T extends RegistryItemLike>(
  item: T,
  origin: string,
  ownNames: Set<string>,
): T & { registryDependencies?: string[] } {
  if (!item.registryDependencies) return { ...item };

  return {
    ...item,
    registryDependencies: item.registryDependencies.map((dep) =>
      ownNames.has(dep) ? `${origin}/r/${dep}.json` : dep,
    ),
  };
}
