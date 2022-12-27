import {SubstrateExtrinsic, SubstrateBlock} from "@subql/types";
import {CallBase} from "@polkadot/types/types/calls";
import {AnyTuple} from "@polkadot/types/types/codec";
import {EventQueue, MultisigStatus} from "./EventQueue";
import {Vec} from '@polkadot/types';
import {AccountId, Address} from "@polkadot/types/interfaces/runtime/types";
import {handleDelegate, handleUndelegate, isDelegate, isUndelegate} from "../mappings/delegate";
import {handleVote, handleRemoveVote, isVote, isRemoveVote} from "../mappings/voting";
import {encodeMultiAddress, sortAddresses} from '@polkadot/util-crypto';
import {INumber} from "@polkadot/types-codec/types/interfaces";
import {PendingMultisig} from "../types";
import {handleMultisig} from "../mappings/multisig";


const batchCalls = ["batch", "batchAll", "forceBatch"]
const multisigCalls = ["approveAsMulti", "asMulti", "asMultiThreshold1"]

export async function visitNestedCalls(extrinsic: SubstrateExtrinsic) {
    logger.info(`Starting nested walk for extrinsic ${extrinsic.block.block.header.number}-${extrinsic.idx}`)
    await visitSuccessNestedCalls(extrinsic, nestedCallVisitor)
    logger.info(`Finished nested walk for extrinsic ${extrinsic.block.block.header.number}-${extrinsic.idx}`)
}

async function nestedCallVisitor(visitedCall: VisitedCall) {
    switch (visitedCall.extras.type) {
        case "multisig":
            await handleMultisig(visitedCall.successCall, visitedCall.extras.executionStatus);
            break;
        case "other":
            await otherCallVisitor(visitedCall.successCall, visitedCall.callOriginAddress, visitedCall.block);
            break;
    }
}

async function otherCallVisitor(call: CallBase<AnyTuple>, callOrigin: string, block: SubstrateBlock) {
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
    visitor: (VisitedCall) => void
) {
    const eventQueue = new EventQueue(extrinsic)
    const call = extrinsic.extrinsic.method
    const callOrigin = extrinsic.extrinsic.signer.toString()
    const block = extrinsic.block
    const depth = 0

    if (extrinsic.success) {
        await _visitSuccessNestedCalls(call, callOrigin, block, visitor, eventQueue, depth)
    }
}

interface VisitedCall {
    successCall: CallBase<AnyTuple>
    callOriginAddress: string
    extras: VisitedExtras
    block: SubstrateBlock
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
    callOriginAddress: string,
    block: SubstrateBlock,
    visitor: (VisitedCall) => void,
    eventQueue: EventQueue,
    depth: number
) {
    function logWalkInfo(content: string) {
        const indent = "  ".repeat(depth)
        logger.info(indent + content)
    }

    function logWalkWarn(content: string) {
        const indent = "  ".repeat(depth)
        logger.warn(indent + content)
    }

    const nextDepth = depth + 1

    if (isBatch(call)) {
        let innerCalls = callsFromBatch(call);
        let idx = 0

        logWalkInfo(`Visiting batch with ${innerCalls.length} inner calls`)

        for (const innerCall of innerCalls) {
            await eventQueue.useNextBatchCompletionStatus((async status => {
                switch (status) {
                    case true:
                        logWalkInfo(`Batch item succeeded`)
                        await _visitSuccessNestedCalls(innerCall, callOriginAddress, block, visitor, eventQueue, nextDepth)
                        break;
                    case false:
                        logWalkInfo(`Batch item failed`)
                        break
                    case undefined:
                        logWalkWarn(`Failed to determine completion status for inner call at ${idx}`)
                }
            }))
            idx++
        }
    } else if (isProxy(call)) {
        logWalkInfo(`Detected proxy`)

        await eventQueue.useNextProxyCompletionStatus((async succeeded => {
            if (succeeded) {
                logWalkInfo(`Proxy call succeeded`)

                const [proxyCall, proxyOrigin] = callFromProxy(call)
                await _visitSuccessNestedCalls(proxyCall, proxyOrigin, block, visitor, eventQueue, nextDepth)
            } else  {
                logWalkInfo(`Proxy call failed`)
            }
        }))
    } else if (isMultisig(call)) {
        logWalkInfo(`Detected multisig`)

        await eventQueue.useNextMultisigCompletionStatus((async status => {
            const visitedCall: VisitedCall = {
                successCall: call,
                callOriginAddress: callOriginAddress,
                block: block,
                extras: {
                    type: "multisig",
                    executionStatus: status
                }
            }
            await visitor(visitedCall) // we visit multisig calls separately since mappers need them to save callData

            switch (status) {
                case MultisigStatus.APPROVED:
                    logWalkInfo(`Multisig was approved but not yet executed`)

                    break;
                case MultisigStatus.EXECUTED_OK:
                    logWalkInfo(`Multisig was executed ok`)

                    const [multisigCall, multisigOrigin] = await callFromMultisig(call, callOriginAddress)
                    await _visitSuccessNestedCalls(multisigCall, multisigOrigin, block, visitor, eventQueue, nextDepth)

                    break;
                case MultisigStatus.EXECUTED_FAILED:
                    logWalkInfo(`Multisig was executed with failure`)

                    break;
                case undefined:
                    logWalkWarn(`Failed to determine completion status for multisig`)

                    break;
            }
        }))
    } else {
        logWalkInfo(`Visiting leaf: ${call.section}-${call.method}`)
        const visitedCall: VisitedCall = {
            successCall: call,
            callOriginAddress: callOriginAddress,
            block: block,
            extras: {
                type: "other"
            }
        }

        await visitor(visitedCall)
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

function callFromProxy(proxyCall: CallBase<AnyTuple>): [CallBase<AnyTuple>, string] {
    const [proxyOrigin, _, proxiedCall] = proxyCall.args
    return [proxiedCall as CallBase<AnyTuple>, (proxyOrigin as Address).toString()]
}

async function callFromMultisig(call: CallBase<AnyTuple>, originAddress: string): Promise<[CallBase<AnyTuple>, string]> {
    if (call.method == "asMulti") {
        const [threshold, otherSignatories, _, multisigCall] = call.args

        const multisigAddress = generateMultisigAddress(
            originAddress,
            otherSignatories as Vec<AccountId>,
            (threshold as INumber).toNumber()
        )

        return [multisigCall as CallBase<AnyTuple>, multisigAddress]
    } else if (call.method == "asMultiThreshold1") {
        const [otherSignatories, multisigCall] = call.args
        const threshold = 1

        const multisigAddress = generateMultisigAddress(originAddress, otherSignatories as Vec<AccountId>, threshold)

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
            originAddress,
            otherSignatories as Vec<AccountId>,
            (threshold as INumber).toNumber()
        )

        return [multisigCall, multisigAddress]
    } else {
        throw Error(`Invalid state - unknown multisig method: ${call.method}`)
    }
}


function generateMultisigAddress(
    origin: string,
    otherSignatories: Vec<AccountId>,
    threshold: number,
): string {
    const otherSignatoriesAddresses = otherSignatories.map((accountId) => accountId.toString())
    const allAddresses = otherSignatoriesAddresses.concat(origin)
    const sortedAddresses = sortAddresses(allAddresses)

    return encodeMultiAddress(sortedAddresses, threshold, api.registry.chainSS58)
}