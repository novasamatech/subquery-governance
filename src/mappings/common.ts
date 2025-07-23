import { SubstrateEvent } from "@subql/types";
import { GenericEventData } from "@polkadot/types";
import { Codec } from "@polkadot/types-codec/types/codec";

export function getEventData(event: SubstrateEvent): Codec[] {
  return event.event.data;
}

export const unboundedQueryOptions = { limit: 1_000_000 };
