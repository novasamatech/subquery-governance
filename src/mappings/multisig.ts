import {CallBase} from "@polkadot/types/types/calls";
import {AnyTuple} from "@polkadot/types/types/codec";
import {MultisigStatus} from "../utilities/EventQueue";
import {PendingMultisig} from "../types";

const {blake2AsHex} = require('@polkadot/util-crypto');

export async function handleMultisig(call: CallBase<AnyTuple>, status: MultisigStatus): Promise<void> {
    if (status == MultisigStatus.APPROVED && call.method == "asMulti") {
        const multisigCall = call.args[3]
        const callHashHex = blake2AsHex(multisigCall.toU8a(), 256) as string

        const existingRecord = await PendingMultisig.get(callHashHex)
        if (existingRecord == undefined) {
            const newRecord = PendingMultisig.create({
                id: callHashHex,
                callData: multisigCall.toHex()
            })
            await newRecord.save()
        }
    }
}

