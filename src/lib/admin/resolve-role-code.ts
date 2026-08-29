type RoleShape =
  | { codigo?: string | null }
  | Array<{ codigo?: string | null }>
  | null
  | undefined;

export function resolveRoleCode(roles: RoleShape): string | null {
  if (!roles) return null;

  if (Array.isArray(roles)) {
    return roles[0]?.codigo ?? null;
  }

  return roles.codigo ?? null;
}
