import {SubstrateEvent} from "@subql/types";
import { GenericEventData } from '@polkadot/types';
import {GetOptions} from "@subql/types-core";

export function getEventData(event: SubstrateEvent): GenericEventData {
    return event.event.data as GenericEventData
}

export const unboundedQueryOptions = { limit: 1_000_000 }