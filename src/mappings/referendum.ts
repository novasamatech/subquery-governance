import {
    SubstrateExtrinsic,
    SubstrateEvent,
    SubstrateBlock,
} from "@subql/types";

import {
  getEventData
} from "./common";

import {Delegate, Delegation, Referendum, CastingVoting, DelegatorVoting} from "../types";
import {Big} from "big.js"
import {INumber} from "@polkadot/types-codec/types/interfaces";
import {Codec} from "@polkadot/types-codec/types/codec";

export async function handleReferendumSubmission(event: SubstrateEvent): Promise<void> {
    const [index, track] = getEventData(event)

    const referendum = Referendum.create({
        id: index.toString(),
        trackId: Number(track.toString()),
        finished: false
    })

    await referendum.save()
}

/// We can handle all terminal events Approved/Rejected/Cancelled/Killed/TimedOut here because they have index as first arg
export async function handleTerminal(event: SubstrateEvent): Promise<void> {
    const [index] = getEventData(event)

    await markReferendumFinished(index.toString())
}

async function markReferendumFinished(id: string): Promise<void> {
    const referendum = await Referendum.get(id)

    if (referendum == undefined) return

    referendum.finished = true

    await referendum.save()
}