import {SubstrateExtrinsic} from "@subql/types";
import {CallBase} from "@polkadot/types/types/calls";
import {AnyTuple} from "@polkadot/types/types/codec";
import {EventQueue, MultisigStatus} from "./EventQueue";
import {Vec} from '@polkadot/types';
import {AccountId, Address} from "@polkadot/types/interfaces/runtime/types";
import {handleDelegate, handleUndelegate, isDelegate, isUndelegate} from "../mappings/delegate";
import {createKeyMulti, sortAddresses} from '@polkadot/util-crypto';
import {INumber} from "@polkadot/types-codec/types/interfaces";
import {PendingMultisig} from "../types";
import {handleMultisig} from "../mappings/multisig";


const batchCalls = ["batch", "batchAll", "forceBatch"]
const multisigCalls = ["approveAsMulti", "asMulti", "asMultiThreshold1"]

export async function visitNestedCalls(extrinsic: SubstrateExtrinsic) {
    await visitSuccessNestedCalls(extrinsic, nestedCallVisitor)
}

async function nestedCallVisitor(visitedCall: VisitedCall) {
    switch (visitedCall.extras.type) {
        case "multisig":
            await handleMultisig(visitedCall.successCall, visitedCall.extras.executionStatus);
            break;
        case "other":
            await otherCallVisitor(visitedCall.successCall, visitedCall.callOrigin);
            break;
    }
}

async function otherCallVisitor(call: CallBase<AnyTuple>, callOrigin: Address) {
    if (isDelegate(call)) {
        await handleDelegate(call, callOrigin)
    } else if (isUndelegate(call)) {
        await handleUndelegate(call, callOrigin)
    }
}

export async function visitSuccessNestedCalls(
    extrinsic: SubstrateExtrinsic,
    visitor: (VisitedCall) => void
) {
    const eventQueue = new EventQueue(extrinsic)
    const call = extrinsic.extrinsic.method
    const callOrigin = extrinsic.extrinsic.signer

    if (extrinsic.success) {
        await _visitSuccessNestedCalls(call, callOrigin, visitor, eventQueue)
    }
}

interface VisitedCall {
    successCall: CallBase<AnyTuple>
    callOrigin: Address
    extras: VisitedExtras
}

export type VisitedExtras = VisitedMultisig | VisitedOther

interface VisitedMultisig {
    type: "multisig"
    executionStatus: MultisigStatus
}

interface VisitedOther {
    type: "other"
}

async function _visitSuccessNestedCalls(
    call: CallBase<AnyTuple>,
    callOrigin: Address,
    visitor: (VisitedCall) => void,
    eventQueue: EventQueue
) {
    if (isBatch(call)) {
        console.log(`Detected batch`)

        for (const innerCall of callsFromBatch(call)) {
            await eventQueue.useNextBatchCompletionStatus((async succeeded => {
                if (succeeded) {
                    console.log(`Batch item succeeded`)
                    await _visitSuccessNestedCalls(innerCall, callOrigin, visitor, eventQueue)
                } else {
                    console.log(`Batch item failed`)
                }
            }))
        }
    } else if (isProxy(call)) {
        await eventQueue.useNextProxyCompletionStatus((async succeeded => {
            if (succeeded) {
                const [proxyCall, proxyOrigin] = callFromProxy(call)
                await _visitSuccessNestedCalls(proxyCall, proxyOrigin, visitor, eventQueue)
            }
        }))
    } else if (isMultisig(call)) {
        console.log(`Detected multisig`)

        await eventQueue.useNextMultisigCompletionStatus((async status => {
            const visitedCall: VisitedCall = {
                successCall: call,
                callOrigin: callOrigin,
                extras: {
                    type: "multisig",
                    executionStatus: status
                }
            }
            visitor(visitedCall) // we visit multisig calls separately since mappers need them to save callData

            if (status === MultisigStatus.EXECUTED_OK) {
                console.log(`Multisig was executed ok`)

                const [multisigCall, multisigOrigin] = await callFromMultisig(call, callOrigin)
                await _visitSuccessNestedCalls(multisigCall, multisigOrigin, visitor, eventQueue)
            } else  {
                console.log(`Multisig was approved or was executed with error`)
            }
        }))
    } else {
        const visitedCall: VisitedCall = {
            successCall: call,
            callOrigin: callOrigin,
            extras: {
                type: "other"
            }
        }

        visitor(visitedCall)
    }
}

function isBatch(call: CallBase<AnyTuple>): boolean {
    return call.section == "utility" && batchCalls.includes(call.method)
}

function isProxy(call: CallBase<AnyTuple>): boolean {
    return call.section == "proxy" && call.method == "proxy"
}

function isMultisig(call: CallBase<AnyTuple>): boolean {
    return call.section == "multisig" && multisigCalls.includes(call.method)
}

function callsFromBatch(batchCall: CallBase<AnyTuple>): CallBase<AnyTuple>[] {
    return batchCall.args[0] as Vec<CallBase<AnyTuple>>
}

function callFromProxy(proxyCall: CallBase<AnyTuple>): [CallBase<AnyTuple>, Address] {
    const [proxyOrigin, _, proxiedCall] = proxyCall.args
    return [proxiedCall as CallBase<AnyTuple>, proxyOrigin as Address]
}

async function callFromMultisig(call: CallBase<AnyTuple>, origin: Address): Promise<[CallBase<AnyTuple>, Address]> {
    if (call.method == "asMulti") {
        const [threshold, otherSignatories, _, multisigCall] = call.args

        const multisigAddress = generateMultisigAddress(
            origin,
            otherSignatories as Vec<AccountId>,
            (threshold as INumber).toNumber()
        )

        return [multisigCall as CallBase<AnyTuple>, multisigAddress]
    } else if (call.method == "asMultiThreshold1") {
        const [otherSignatories, multisigCall] = call.args
        const threshold = 1

        const multisigAddress = generateMultisigAddress(origin, otherSignatories as Vec<AccountId>, threshold)

        return [multisigCall as CallBase<AnyTuple>, multisigAddress]
    } else if (call.method == "approveAsMulti") {
        const [threshold, otherSignatories, _, multisigCallHash] = call.args
        const callHash = multisigCallHash.toHex()
        const callData = await PendingMultisig.get(callHash)

        if (callData == undefined) {
            throw Error(`Failed to find call data for callHash ${callHash}`)
        }

        const multisigCall = api.registry.createType("GenericCall", callData) as CallBase<AnyTuple>
        const multisigAddress = generateMultisigAddress(
            origin,
            otherSignatories as Vec<AccountId>,
            (threshold as INumber).toNumber()
        )

        return [multisigCall, multisigAddress]
    } else {
        throw Error(`Invalid state - unknown multisig method: ${call.method}`)
    }
}


function generateMultisigAddress(
    origin: Address,
    otherSignatories: Vec<AccountId>,
    threshold: number,
): Address {
    const otherSignatoriesAddresses = otherSignatories.map((accountId) => accountId.toString())
    const allAddresses = otherSignatoriesAddresses.concat(origin.toString())
    const sortedAddresses = sortAddresses(allAddresses)

    const address = createKeyMulti(sortedAddresses, threshold)

    return api.registry.createType("Address", address)
}