/**
 * Deviation request types and their required justification fields.
 *
 * FedRAMP recognizes three deviation types:
 *   RA  — Risk Adjustment: CVSS is technically correct but operational context
 *          lowers actual risk. Requires compensating controls and residual risk statement.
 *   FP  — False Positive: the scanner flagged an asset that is not actually vulnerable.
 *          Requires technical evidence proving the finding does not apply.
 *   OR  — Operational Requirement: remediation would break required functionality.
 *          Requires business justification and compensating controls.
 */

import { z } from "zod";

export type DeviationType = "RA" | "FP" | "OR";

// --------------------------------------------------------------------------
// Risk Adjustment (RA)
// --------------------------------------------------------------------------

export const RiskAdjustmentSchema = z.object({
  deviation_type: z.literal("RA"),
  /**
   * Explanation of why the operational context reduces the actual risk
   * below what the CVSS score suggests.
   */
  operational_context: z
    .string()
    .min(50, "Provide at least 50 characters describing the operational context")
    .max(2000),
  /**
   * Description of compensating controls in place that mitigate the risk.
   */
  compensating_controls: z
    .string()
    .min(50, "Describe compensating controls in at least 50 characters")
    .max(2000),
  /**
   * Statement of the residual risk after accounting for compensating controls.
   */
  residual_risk_statement: z
    .string()
    .min(20, "Provide a residual risk statement")
    .max(1000),
});

export type RiskAdjustmentFields = z.infer<typeof RiskAdjustmentSchema>;

// --------------------------------------------------------------------------
// False Positive (FP)
// --------------------------------------------------------------------------

export const FalsePositiveSchema = z.object({
  deviation_type: z.literal("FP"),
  /**
   * Technical explanation of why the finding does not apply to this asset.
   */
  technical_justification: z
    .string()
    .min(50, "Provide technical justification of at least 50 characters")
    .max(2000),
  /**
   * The specific evidence type being submitted (screenshot, config export, etc.).
   * The actual file is attached separately.
   */
  evidence_description: z
    .string()
    .min(10, "Describe the evidence being submitted")
    .max(500),
});

export type FalsePositiveFields = z.infer<typeof FalsePositiveSchema>;

// --------------------------------------------------------------------------
// Operational Requirement (OR)
// --------------------------------------------------------------------------

export const OperationalRequirementSchema = z.object({
  deviation_type: z.literal("OR"),
  /**
   * Business or mission justification for why remediation cannot occur.
   */
  business_justification: z
    .string()
    .min(50, "Provide a business justification of at least 50 characters")
    .max(2000),
  /**
   * What would break if the vulnerability were remediated.
   */
  impact_if_remediated: z
    .string()
    .min(20, "Describe the impact of remediation")
    .max(1000),
  /**
   * Compensating controls in place while the deviation is active.
   */
  compensating_controls: z
    .string()
    .min(50, "Describe compensating controls in at least 50 characters")
    .max(2000),
  /**
   * Target date by which the operational requirement is expected to be resolved,
   * if known. This is not an SLA extension — it is informational.
   */
  expected_resolution_date: z.coerce.date().optional(),
});

export type OperationalRequirementFields = z.infer<
  typeof OperationalRequirementSchema
>;

// --------------------------------------------------------------------------
// Union type
// --------------------------------------------------------------------------

export const DeviationJustificationSchema = z.discriminatedUnion(
  "deviation_type",
  [RiskAdjustmentSchema, FalsePositiveSchema, OperationalRequirementSchema]
);

export type DeviationJustification = z.infer<
  typeof DeviationJustificationSchema
>;

// --------------------------------------------------------------------------
// Metadata
// --------------------------------------------------------------------------

export const DEVIATION_LABEL: Record<DeviationType, string> = {
  RA: "Risk Adjustment",
  FP: "False Positive",
  OR: "Operational Requirement",
};

export const DEVIATION_DESCRIPTION: Record<DeviationType, string> = {
  RA: "The CVSS score is technically correct, but operational context reduces the actual risk.",
  FP: "The finding does not apply to this asset.",
  OR: "Remediation would break required functionality.",
};

/**
 * Allowed MIME types for deviation evidence uploads.
 */
export const EVIDENCE_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

/** Maximum evidence file size: 10 MB. */
export const EVIDENCE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
