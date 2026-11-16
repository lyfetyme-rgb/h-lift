/**
 * H-LIFT hazmat lifecycle.
 *
 * The requested lifecycle spans two different subjects, so it is modelled as
 * two machines rather than one blurred enum:
 *
 *   issue_requests  REQUESTED -> VALIDATED -> AUTHORIZED -> RESERVED
 *                   -> PICKUP_READY -> ISSUED        (+ CANCELLED before issue)
 *
 *   containers      AVAILABLE -> RESERVED -> ISSUED -> IN_CUSTODY -> IN_USE
 *                   -> FULLY_CONSUMED
 *                   -> RETURN_INITIATED -> RETURN_RECEIVED -> RETURN_HOLD
 *                   -> INSPECTED -> RESTOCK_APPROVED -> AVAILABLE
 *                                -> RELABEL_REQUIRED -> RESTOCK_APPROVED
 *                                -> QUARANTINED
 *                                -> DISPOSITION_REQUIRED -> DISPOSED
 *
 * Transitions are enforced server-side. There is deliberately no edge from
 * RETURN_RECEIVED to AVAILABLE: a returned container must pass through
 * RETURN_HOLD and an accepted inspection first.
 */

export const REQUEST_STATES = [
  "REQUESTED",
  "VALIDATED",
  "AUTHORIZED",
  "RESERVED",
  "PICKUP_READY",
  "ISSUED",
  "CANCELLED",
  "UNKNOWN",
] as const;

export const CONTAINER_STATES = [
  "AVAILABLE",
  "RESERVED",
  "ISSUED",
  "IN_CUSTODY",
  "IN_USE",
  "FULLY_CONSUMED",
  "RETURN_INITIATED",
  "RETURN_RECEIVED",
  "RETURN_HOLD",
  "INSPECTED",
  "RESTOCK_APPROVED",
  "RELABEL_REQUIRED",
  "QUARANTINED",
  "DISPOSITION_REQUIRED",
  "DISPOSED",
  "EXPIRED",
  "UNKNOWN",
] as const;

export type RequestState = (typeof REQUEST_STATES)[number];
export type ContainerState = (typeof CONTAINER_STATES)[number];

export const REQUEST_TRANSITIONS: Record<string, string[]> = {
  REQUESTED: ["VALIDATED", "CANCELLED"],
  VALIDATED: ["AUTHORIZED", "CANCELLED"],
  AUTHORIZED: ["RESERVED", "CANCELLED"],
  RESERVED: ["PICKUP_READY", "CANCELLED"],
  PICKUP_READY: ["ISSUED", "CANCELLED"],
  ISSUED: [],
  CANCELLED: [],
  UNKNOWN: [],
};

export const CONTAINER_TRANSITIONS: Record<string, string[]> = {
  AVAILABLE: ["RESERVED", "EXPIRED", "QUARANTINED"],
  RESERVED: ["ISSUED", "AVAILABLE"],
  ISSUED: ["IN_CUSTODY", "IN_USE", "RETURN_INITIATED"],
  IN_CUSTODY: ["IN_USE", "RETURN_INITIATED"],
  IN_USE: ["FULLY_CONSUMED", "RETURN_INITIATED"],
  FULLY_CONSUMED: [],
  RETURN_INITIATED: ["RETURN_RECEIVED"],
  RETURN_RECEIVED: ["RETURN_HOLD"],
  RETURN_HOLD: ["INSPECTED", "QUARANTINED"],
  INSPECTED: ["RESTOCK_APPROVED", "RELABEL_REQUIRED", "QUARANTINED", "DISPOSITION_REQUIRED"],
  RESTOCK_APPROVED: ["AVAILABLE"],
  RELABEL_REQUIRED: ["RESTOCK_APPROVED", "DISPOSITION_REQUIRED"],
  QUARANTINED: ["INSPECTED", "DISPOSITION_REQUIRED"],
  DISPOSITION_REQUIRED: ["DISPOSED"],
  DISPOSED: [],
  EXPIRED: ["DISPOSITION_REQUIRED", "DISPOSED"],
  UNKNOWN: [],
};

export function canTransition(
  map: Record<string, string[]>,
  from: string,
  to: string
): boolean {
  return (map[from] ?? []).includes(to);
}

/** States in which the container is physically with the requester. */
export const IN_CUSTODY_STATES = ["ISSUED", "IN_CUSTODY", "IN_USE", "RETURN_INITIATED"];

/** States that hold a container back from available stock after return. */
export const RETURN_HOLD_STATES = [
  "RETURN_RECEIVED",
  "RETURN_HOLD",
  "INSPECTED",
  "RESTOCK_APPROVED",
  "RELABEL_REQUIRED",
];

export const CHECKLIST_FIELDS = [
  ["identity_verified", "Container identity verified"],
  ["correct_material", "Correct material / product"],
  ["label_intact", "Label intact and legible"],
  ["shelf_life_valid", "Shelf life valid"],
  ["container_damaged", "Container damaged"],
  ["contamination_suspected", "Contamination suspected"],
  ["quantity_verified", "Quantity verified"],
  ["storage_compatibility_valid", "Storage compatibility valid"],
] as const;

export const INSPECTION_OUTCOMES = [
  "ACCEPT",
  "RELABEL",
  "QUARANTINE",
  "DISPOSITION",
] as const;
