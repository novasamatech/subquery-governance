import {SubstrateExtrinsic, SubstrateBlock} from "@subql/types";
import {CallBase} from "@polkadot/types/types/calls";
import {AnyTuple} from "@polkadot/types/types/codec";
import {EventQueue} from "./EventQueue";
import {Vec} from '@polkadot/types';
import {Address} from "@polkadot/types/interfaces/runtime/types";
import {handleDelegate, handleUndelegate, isDelegate, isUndelegate} from "../mappings/delegate";
import {handleVote, handleRemoveVote, isVote, isRemoveVote} from "../mappings/voting";


const batchCalls = ["batch", "batchAll", "forceBatch"]

export async function visitNestedCalls(extrinsic: SubstrateExtrinsic) {
    await visitSuccessNestedCalls(extrinsic, nestedCallVisitor)
}

async function nestedCallVisitor(call: CallBase<AnyTuple>, callOrigin: Address, block: SubstrateBlock) {
    if (isVote(call)) {
        await handleVote(call, callOrigin, block.block.header.number.toNumber())
    } else if (isRemoveVote(call)) {
        await handleRemoveVote(call, callOrigin)
    } else if (isDelegate(call)) {
        await handleDelegate(call, callOrigin)
    } else if (isUndelegate(call)) {
        await handleUndelegate(call, callOrigin)
    }
}

export async function visitSuccessNestedCalls(
    extrinsic: SubstrateExtrinsic,
    visitor: (successCall: CallBase<AnyTuple>, callOrigin: Address, block: SubstrateBlock) => void
) {
    const eventQueue = new EventQueue(extrinsic)
    const call = extrinsic.extrinsic.method
    const callOrigin = extrinsic.extrinsic.signer
    const block = extrinsic.block

    if (extrinsic.success) {
        await _visitSuccessNestedCalls(call, callOrigin, block, visitor, eventQueue)
    }
}

async function _visitSuccessNestedCalls(
    call: CallBase<AnyTuple>,
    callOrigin: Address,
    block: SubstrateBlock,
    visitor: (successCall: CallBase<AnyTuple>, callOrigin: Address, block: SubstrateBlock) => void,
    eventQueue: EventQueue
) {
    if (isBatch(call)) {
        for (const innerCall of callsFromBatch(call)) {
            await eventQueue.useNextBatchCompletionStatus((async succeeded => {
                if (succeeded) {
                    await _visitSuccessNestedCalls(innerCall, callOrigin, block, visitor, eventQueue)
                }
            }))
        }
    } else if (isProxy(call)) {
        const [proxyCall, proxyOrigin] = callFromProxy(call)
        await _visitSuccessNestedCalls(proxyCall, proxyOrigin, block, visitor, eventQueue)
    } else {
        visitor(call, callOrigin, block)
    }
}

function isBatch(call: CallBase<AnyTuple>): boolean {
    return call.section == "utility" && batchCalls.includes(call.method)
}

function isProxy(call: CallBase<AnyTuple>): boolean {
    return call.section == "proxy" && call.method == "proxy"
}

function callsFromBatch(batchCall: CallBase<AnyTuple>): CallBase<AnyTuple>[] {
    return batchCall.args[0] as Vec<CallBase<AnyTuple>>
}

function callFromProxy(proxyCall: CallBase<AnyTuple>): [CallBase<AnyTuple>, Address] {
    const [proxyOrigin, _, proxiedCall] = proxyCall.args
    return [proxiedCall as CallBase<AnyTuple>, proxyOrigin as Address]
}