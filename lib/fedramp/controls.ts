/**
 * NIST SP 800-53 Rev 5 — FedRAMP control catalog.
 *
 * Covers all control families and their commonly assessed controls.
 * Used for control-to-finding/POA&M mapping throughout the dashboard.
 */

export type NistControl = {
  id:     string; // e.g. "AC-2"
  title:  string;
  family: string;
};

export const NIST_FAMILIES: Record<string, string> = {
  AC: "Access Control",
  AT: "Awareness and Training",
  AU: "Audit and Accountability",
  CA: "Assessment, Authorization, and Monitoring",
  CM: "Configuration Management",
  CP: "Contingency Planning",
  IA: "Identification and Authentication",
  IR: "Incident Response",
  MA: "Maintenance",
  MP: "Media Protection",
  PE: "Physical and Environmental Protection",
  PL: "Planning",
  PM: "Program Management",
  PS: "Personnel Security",
  PT: "PII Processing and Transparency",
  RA: "Risk Assessment",
  SA: "System and Services Acquisition",
  SC: "System and Communications Protection",
  SI: "System and Information Integrity",
  SR: "Supply Chain Risk Management",
};

export const NIST_CONTROLS: NistControl[] = [
  // ── AC — Access Control ────────────────────────────────────────────────────
  { id: "AC-1",  family: "AC", title: "Policy and Procedures" },
  { id: "AC-2",  family: "AC", title: "Account Management" },
  { id: "AC-3",  family: "AC", title: "Access Enforcement" },
  { id: "AC-4",  family: "AC", title: "Information Flow Enforcement" },
  { id: "AC-5",  family: "AC", title: "Separation of Duties" },
  { id: "AC-6",  family: "AC", title: "Least Privilege" },
  { id: "AC-7",  family: "AC", title: "Unsuccessful Logon Attempts" },
  { id: "AC-8",  family: "AC", title: "System Use Notification" },
  { id: "AC-11", family: "AC", title: "Device Lock" },
  { id: "AC-12", family: "AC", title: "Session Termination" },
  { id: "AC-14", family: "AC", title: "Permitted Actions Without Identification or Authentication" },
  { id: "AC-17", family: "AC", title: "Remote Access" },
  { id: "AC-18", family: "AC", title: "Wireless Access" },
  { id: "AC-19", family: "AC", title: "Access Control for Mobile Devices" },
  { id: "AC-20", family: "AC", title: "Use of External Systems" },
  { id: "AC-21", family: "AC", title: "Information Sharing" },
  { id: "AC-22", family: "AC", title: "Publicly Accessible Content" },
  // ── AT — Awareness and Training ───────────────────────────────────────────
  { id: "AT-1",  family: "AT", title: "Policy and Procedures" },
  { id: "AT-2",  family: "AT", title: "Literacy Training and Awareness" },
  { id: "AT-3",  family: "AT", title: "Role-Based Training" },
  { id: "AT-4",  family: "AT", title: "Training Records" },
  // ── AU — Audit and Accountability ─────────────────────────────────────────
  { id: "AU-1",  family: "AU", title: "Policy and Procedures" },
  { id: "AU-2",  family: "AU", title: "Event Logging" },
  { id: "AU-3",  family: "AU", title: "Content of Audit Records" },
  { id: "AU-4",  family: "AU", title: "Audit Log Storage Capacity" },
  { id: "AU-5",  family: "AU", title: "Response to Audit Logging Process Failures" },
  { id: "AU-6",  family: "AU", title: "Audit Record Review, Analysis, and Reporting" },
  { id: "AU-8",  family: "AU", title: "Time Stamps" },
  { id: "AU-9",  family: "AU", title: "Protection of Audit Information" },
  { id: "AU-11", family: "AU", title: "Audit Record Retention" },
  { id: "AU-12", family: "AU", title: "Audit Record Generation" },
  // ── CA — Assessment, Authorization, and Monitoring ────────────────────────
  { id: "CA-1",  family: "CA", title: "Policy and Procedures" },
  { id: "CA-2",  family: "CA", title: "Control Assessments" },
  { id: "CA-3",  family: "CA", title: "Information Exchange" },
  { id: "CA-5",  family: "CA", title: "Plan of Action and Milestones" },
  { id: "CA-6",  family: "CA", title: "Authorization" },
  { id: "CA-7",  family: "CA", title: "Continuous Monitoring" },
  { id: "CA-8",  family: "CA", title: "Penetration Testing" },
  { id: "CA-9",  family: "CA", title: "Internal System Connections" },
  // ── CM — Configuration Management ─────────────────────────────────────────
  { id: "CM-1",  family: "CM", title: "Policy and Procedures" },
  { id: "CM-2",  family: "CM", title: "Baseline Configuration" },
  { id: "CM-3",  family: "CM", title: "Configuration Change Control" },
  { id: "CM-4",  family: "CM", title: "Impact Analyses" },
  { id: "CM-5",  family: "CM", title: "Access Restrictions for Change" },
  { id: "CM-6",  family: "CM", title: "Configuration Settings" },
  { id: "CM-7",  family: "CM", title: "Least Functionality" },
  { id: "CM-8",  family: "CM", title: "System Component Inventory" },
  { id: "CM-9",  family: "CM", title: "Configuration Management Plan" },
  { id: "CM-10", family: "CM", title: "Software Usage Restrictions" },
  { id: "CM-11", family: "CM", title: "User-Installed Software" },
  // ── CP — Contingency Planning ──────────────────────────────────────────────
  { id: "CP-1",  family: "CP", title: "Policy and Procedures" },
  { id: "CP-2",  family: "CP", title: "Contingency Plan" },
  { id: "CP-3",  family: "CP", title: "Contingency Training" },
  { id: "CP-4",  family: "CP", title: "Contingency Plan Testing" },
  { id: "CP-6",  family: "CP", title: "Alternate Storage Site" },
  { id: "CP-7",  family: "CP", title: "Alternate Processing Site" },
  { id: "CP-8",  family: "CP", title: "Telecommunications Services" },
  { id: "CP-9",  family: "CP", title: "System Backup" },
  { id: "CP-10", family: "CP", title: "System Recovery and Reconstitution" },
  // ── IA — Identification and Authentication ─────────────────────────────────
  { id: "IA-1",  family: "IA", title: "Policy and Procedures" },
  { id: "IA-2",  family: "IA", title: "Identification and Authentication (Organizational Users)" },
  { id: "IA-3",  family: "IA", title: "Device Identification and Authentication" },
  { id: "IA-4",  family: "IA", title: "Identifier Management" },
  { id: "IA-5",  family: "IA", title: "Authenticator Management" },
  { id: "IA-6",  family: "IA", title: "Authentication Feedback" },
  { id: "IA-7",  family: "IA", title: "Cryptographic Module Authentication" },
  { id: "IA-8",  family: "IA", title: "Identification and Authentication (Non-Organizational Users)" },
  { id: "IA-11", family: "IA", title: "Re-Authentication" },
  { id: "IA-12", family: "IA", title: "Identity Proofing" },
  // ── IR — Incident Response ────────────────────────────────────────────────
  { id: "IR-1",  family: "IR", title: "Policy and Procedures" },
  { id: "IR-2",  family: "IR", title: "Incident Response Training" },
  { id: "IR-3",  family: "IR", title: "Incident Response Testing" },
  { id: "IR-4",  family: "IR", title: "Incident Handling" },
  { id: "IR-5",  family: "IR", title: "Incident Monitoring" },
  { id: "IR-6",  family: "IR", title: "Incident Reporting" },
  { id: "IR-7",  family: "IR", title: "Incident Response Assistance" },
  { id: "IR-8",  family: "IR", title: "Incident Response Plan" },
  { id: "IR-9",  family: "IR", title: "Information Spillage Response" },
  // ── MA — Maintenance ──────────────────────────────────────────────────────
  { id: "MA-1",  family: "MA", title: "Policy and Procedures" },
  { id: "MA-2",  family: "MA", title: "Controlled Maintenance" },
  { id: "MA-3",  family: "MA", title: "Maintenance Tools" },
  { id: "MA-4",  family: "MA", title: "Nonlocal Maintenance" },
  { id: "MA-5",  family: "MA", title: "Maintenance Personnel" },
  { id: "MA-6",  family: "MA", title: "Timely Maintenance" },
  // ── MP — Media Protection ─────────────────────────────────────────────────
  { id: "MP-1",  family: "MP", title: "Policy and Procedures" },
  { id: "MP-2",  family: "MP", title: "Media Access" },
  { id: "MP-3",  family: "MP", title: "Media Marking" },
  { id: "MP-4",  family: "MP", title: "Media Storage" },
  { id: "MP-5",  family: "MP", title: "Media Transport" },
  { id: "MP-6",  family: "MP", title: "Media Sanitization" },
  { id: "MP-7",  family: "MP", title: "Media Use" },
  // ── PE — Physical and Environmental ──────────────────────────────────────
  { id: "PE-1",  family: "PE", title: "Policy and Procedures" },
  { id: "PE-2",  family: "PE", title: "Physical Access Authorizations" },
  { id: "PE-3",  family: "PE", title: "Physical Access Control" },
  { id: "PE-6",  family: "PE", title: "Monitoring Physical Access" },
  { id: "PE-8",  family: "PE", title: "Visitor Access Records" },
  { id: "PE-12", family: "PE", title: "Emergency Lighting" },
  { id: "PE-13", family: "PE", title: "Fire Protection" },
  { id: "PE-14", family: "PE", title: "Environmental Controls" },
  { id: "PE-15", family: "PE", title: "Water Damage Protection" },
  { id: "PE-16", family: "PE", title: "Delivery and Removal" },
  // ── RA — Risk Assessment ──────────────────────────────────────────────────
  { id: "RA-1",  family: "RA", title: "Policy and Procedures" },
  { id: "RA-2",  family: "RA", title: "Security Categorization" },
  { id: "RA-3",  family: "RA", title: "Risk Assessment" },
  { id: "RA-5",  family: "RA", title: "Vulnerability Monitoring and Scanning" },
  { id: "RA-7",  family: "RA", title: "Risk Response" },
  { id: "RA-9",  family: "RA", title: "Criticality Analysis" },
  // ── SA — System and Services Acquisition ──────────────────────────────────
  { id: "SA-1",  family: "SA", title: "Policy and Procedures" },
  { id: "SA-3",  family: "SA", title: "System Development Life Cycle" },
  { id: "SA-4",  family: "SA", title: "Acquisition Process" },
  { id: "SA-5",  family: "SA", title: "System Documentation" },
  { id: "SA-8",  family: "SA", title: "Security and Privacy Engineering Principles" },
  { id: "SA-9",  family: "SA", title: "External System Services" },
  { id: "SA-10", family: "SA", title: "Developer Configuration Management" },
  { id: "SA-11", family: "SA", title: "Developer Testing and Evaluation" },
  { id: "SA-15", family: "SA", title: "Development Process, Standards, and Tools" },
  { id: "SA-22", family: "SA", title: "Unsupported System Components" },
  // ── SC — System and Communications Protection ─────────────────────────────
  { id: "SC-1",  family: "SC", title: "Policy and Procedures" },
  { id: "SC-2",  family: "SC", title: "Separation of System and User Functionality" },
  { id: "SC-4",  family: "SC", title: "Information in Shared System Resources" },
  { id: "SC-5",  family: "SC", title: "Denial-of-Service Protection" },
  { id: "SC-7",  family: "SC", title: "Boundary Protection" },
  { id: "SC-8",  family: "SC", title: "Transmission Confidentiality and Integrity" },
  { id: "SC-10", family: "SC", title: "Network Disconnect" },
  { id: "SC-12", family: "SC", title: "Cryptographic Key Establishment and Management" },
  { id: "SC-13", family: "SC", title: "Cryptographic Protection" },
  { id: "SC-15", family: "SC", title: "Collaborative Computing Devices and Applications" },
  { id: "SC-17", family: "SC", title: "Public Key Infrastructure Certificates" },
  { id: "SC-18", family: "SC", title: "Mobile Code" },
  { id: "SC-20", family: "SC", title: "Secure Name/Address Resolution Service (Authoritative Source)" },
  { id: "SC-21", family: "SC", title: "Secure Name/Address Resolution Service (Recursive or Caching Resolver)" },
  { id: "SC-22", family: "SC", title: "Architecture and Provisioning for Name/Address Resolution Service" },
  { id: "SC-28", family: "SC", title: "Protection of Information at Rest" },
  { id: "SC-39", family: "SC", title: "Process Isolation" },
  // ── SI — System and Information Integrity ─────────────────────────────────
  { id: "SI-1",  family: "SI", title: "Policy and Procedures" },
  { id: "SI-2",  family: "SI", title: "Flaw Remediation" },
  { id: "SI-3",  family: "SI", title: "Malicious Code Protection" },
  { id: "SI-4",  family: "SI", title: "System Monitoring" },
  { id: "SI-5",  family: "SI", title: "Security Alerts, Advisories, and Directives" },
  { id: "SI-6",  family: "SI", title: "Security and Privacy Function Verification" },
  { id: "SI-7",  family: "SI", title: "Software, Firmware, and Information Integrity" },
  { id: "SI-8",  family: "SI", title: "Spam Protection" },
  { id: "SI-10", family: "SI", title: "Information Input Validation" },
  { id: "SI-12", family: "SI", title: "Information Management and Retention" },
  { id: "SI-16", family: "SI", title: "Memory Protection" },
  // ── SR — Supply Chain Risk Management ─────────────────────────────────────
  { id: "SR-1",  family: "SR", title: "Policy and Procedures" },
  { id: "SR-2",  family: "SR", title: "Supply Chain Risk Management Plan" },
  { id: "SR-3",  family: "SR", title: "Supply Chain Controls and Processes" },
  { id: "SR-5",  family: "SR", title: "Acquisition Strategies, Tools, and Methods" },
  { id: "SR-6",  family: "SR", title: "Supplier Assessments and Reviews" },
  { id: "SR-8",  family: "SR", title: "Notification Agreements" },
  { id: "SR-10", family: "SR", title: "Inspection of Systems or Components" },
  { id: "SR-11", family: "SR", title: "Component Authenticity" },
];

/** Fast O(1) lookup by control ID */
export const CONTROL_MAP: Map<string, NistControl> = new Map(
  NIST_CONTROLS.map((c) => [c.id, c])
);

/** Controls grouped by family for UI selectors */
export const CONTROLS_BY_FAMILY: Record<string, NistControl[]> = {};
for (const c of NIST_CONTROLS) {
  if (!CONTROLS_BY_FAMILY[c.family]) CONTROLS_BY_FAMILY[c.family] = [];
  CONTROLS_BY_FAMILY[c.family]!.push(c);
}
