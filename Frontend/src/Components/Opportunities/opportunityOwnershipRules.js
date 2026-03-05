export const getUserDisplayName = (user) =>
  user?.nome || user?.name || user?.email || '';

export const isAdminUser = (user) =>
  user?.role === 'admin' || user?.admin === true;

export const getOpportunityOwnerName = (opportunity) =>
  opportunity?.owner || opportunity?.criadoPor || '';

export const getOpportunityAssignedName = (opportunity) =>
  opportunity?.assignedTo ||
  opportunity?.responsavel ||
  getOpportunityOwnerName(opportunity) ||
  '';

export const resolveSelectedOwner = ({ opportunity, fallbackOwner }) =>
  getOpportunityOwnerName(opportunity) || fallbackOwner;

export const buildOwnerPayloadFields = ({ selectedOwner, owner }) => ({
  criadoPor: selectedOwner || owner,
  owner: selectedOwner || owner,
  responsavel: owner,
  assignedTo: owner,
});

export const buildAssignmentPayloadFields = (assignedValue) => ({
  assignedTo: assignedValue,
  responsavel: assignedValue,
});

export const canManageOpportunity = (user, opportunity) => {
  if (isAdminUser(user)) return true;

  const currentUser = getUserDisplayName(user);
  if (!currentUser) return false;

  const owner = getOpportunityOwnerName(opportunity);
  const assigned = getOpportunityAssignedName(opportunity);

  return owner === currentUser || assigned === currentUser;
};
