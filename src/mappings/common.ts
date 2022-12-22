import {SubstrateEvent} from "@subql/types";
import { GenericEventData } from '@polkadot/types';

export function getEventData(event: SubstrateEvent): GenericEventData {
    return event.event.data as GenericEventData
}