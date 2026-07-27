// @yachtway/shared — the API contract.
// Zod schemas double as runtime validators (API) and compile-time types (web).

export const SHARED_CONTRACT_VERSION = "0.15.0";

export * from "./common.js";
export * from "./auth.js";
export * from "./permissions.js";
export * from "./contact.js";
export * from "./company.js";
export * from "./opportunity.js";
export * from "./pipelines.js";
export * from "./reporting.js";
export * from "./rollups.js";
export * from "./conversations.js";
export * from "./brands.js";
export * from "./easyfund.js";
export * from "./mastercover.js";
export * from "./invoices.js";
