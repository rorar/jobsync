/**
 * Reference Data Connector — Type Definitions
 *
 * Health-only connector for taxonomy/classification services.
 * No lookup interface yet — will be added when the first consumer
 * needs programmatic access (Skillsets 4.1, CareerBERT 9.1).
 */

export interface ReferenceDataConnector {
  /** Placeholder — reference data modules are health-only for now */
  readonly id: string;
}
