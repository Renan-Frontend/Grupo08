const resolveRawAccessValue = (user) => {
  const candidates = [
    user?.nivel,
    user?.accessLevel,
    user?.nivelAcesso,
    user?.nivel_acesso,
    user?.access_level,
    user?.level,
    user?.permissao,
    user?.permissionLevel,
    user?.roleLevel,
    user?.usuario?.nivel,
    user?.usuario?.accessLevel,
    user?.user?.nivel,
    user?.user?.accessLevel,
    user?.acesso?.nivel,
    user?.acesso?.level,
    user?.perfil?.nivel,
    user?.perfil?.accessLevel,
    user?.permissions?.level,
    user?.permissions?.accessLevel,
    user?.claims?.nivel,
    user?.claims?.accessLevel,
  ];

  const resolved = candidates.find(
    (value) => value !== null && value !== undefined && String(value).trim(),
  );

  return resolved ?? null;
};

const resolveRoleValue = (user) => {
  const candidates = [
    user?.role,
    user?.papel,
    user?.perfil,
    user?.tipo,
    user?.usuario?.role,
    user?.usuario?.papel,
    user?.user?.role,
    user?.acesso?.role,
    user?.claims?.role,
  ];

  const resolved = candidates.find(
    (value) => value !== null && value !== undefined && String(value).trim(),
  );

  return String(resolved || '')
    .trim()
    .toLowerCase();
};

const hasReadOnlyFlag = (user) => {
  const candidates = [
    user?.somenteVisualizacao,
    user?.somente_visualizacao,
    user?.readOnly,
    user?.read_only,
    user?.viewOnly,
    user?.view_only,
    user?.usuario?.somenteVisualizacao,
    user?.usuario?.readOnly,
    user?.acesso?.somenteVisualizacao,
    user?.acesso?.readOnly,
    user?.permissions?.readOnly,
    user?.permissions?.viewOnly,
    user?.claims?.readOnly,
  ];

  return candidates.some((value) => value === true);
};

const parseAccessLevel = (value) => {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const directNumber = Number(normalized);
  if (Number.isFinite(directNumber)) return directNumber;

  const matchedDigits = normalized.match(/\d+/);
  if (!matchedDigits) return null;

  const extracted = Number(matchedDigits[0]);
  return Number.isFinite(extracted) ? extracted : null;
};

export const getUserAccessLevel = (user) =>
  parseAccessLevel(resolveRawAccessValue(user));

export const isReadOnlyAccessLevelOne = (user) => {
  const level = getUserAccessLevel(user);
  if (level === 1) return true;

  if (hasReadOnlyFlag(user)) return true;

  const role = resolveRoleValue(user);
  if (
    role === 'viewer' ||
    role === 'readonly' ||
    role === 'read_only' ||
    role === 'visualizacao' ||
    role === 'somente_visualizacao' ||
    role === 'somente visualizacao'
  ) {
    return true;
  }

  return false;
};
