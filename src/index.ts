// Polyfill: SubQuery node webpack sandbox does not expose TextEncoder/TextDecoder,
// but @noble/hashes (used by @polkadot/util-crypto via subquery-call-visitor) requires them.
import { TextEncoder, TextDecoder } from "util";
if (typeof globalThis.TextEncoder === "undefined") {
  Object.assign(globalThis, { TextEncoder, TextDecoder });
}

//Exports all handler functions
export * from "./mappings/delegate";
export * from "./mappings/nested";
export * from "./mappings/referendum";
export * from "./mappings/voting";
import "@polkadot/api-augment";
