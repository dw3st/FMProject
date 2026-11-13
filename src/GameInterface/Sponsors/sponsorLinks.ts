/** The sponsor page of a company (`/sponsor/<id>`, 12.1). */
export const sponsorHref = (companyId: string): string => `/sponsor/${encodeURIComponent(companyId)}`;

/** Finances → Sponsors (offers and contracts of the manager's club). */
export const SPONSORS_PANEL_HREF = "/finances?tab=sponsors";
