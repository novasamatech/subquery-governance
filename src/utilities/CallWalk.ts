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
import {Codec} from "@polkadot/types/types";
import {CreateCallVisitorBuilder, CreateCallWalk} from "subquery-call-visitor/dist/impls"
import {VisitedCall} from "subquery-call-visitor/dist/interfaces"


const batchCalls = ["batch", "batchAll", "forceBatch"]
const multisigCalls = ["approveAsMulti", "asMulti", "asMultiThreshold1"]
const proxyCalls = ["proxy", "proxyAnnounced"]

const callWalk = CreateCallWalk()

const visitor = CreateCallVisitorBuilder()
    .on("convictionVoting", "vote", handleNestedVote)
    .on("convictionVoting", "removeVote", handleNestedRemoveVote)
    .on("convictionVoting", "delegate", handleNestedDelegate)
    .on("convictionVoting", "undelegate", handleNestedUndelegate)
    .ignoreFailedCalls(true)
    .build()

export async function visitNestedCalls(extrinsic: SubstrateExtrinsic) {
    let blockNumber = extrinsic.block.block.header.number.toNumber()
    logger.info(`Starting nested walk for extrinsic ${blockNumber}-${extrinsic.idx}`)

    await callWalk.walk(extrinsic, visitor)

    logger.info(`Finished nested walk for extrinsic ${extrinsic.block.block.header.number}-${extrinsic.idx}`)
}

async function handleNestedVote(visitedCall: VisitedCall): Promise<void> {
    let blockNumber = visitedCall.extrinsic.block.block.header.number.toNumber()

    await handleVote(visitedCall.call, visitedCall.origin, blockNumber)
}

async function handleNestedRemoveVote(visitedCall: VisitedCall): Promise<void> {
    await handleRemoveVote(visitedCall.call, visitedCall.origin)
}

async function handleNestedDelegate(visitedCall: VisitedCall): Promise<void> {
    await handleDelegate(visitedCall.call, visitedCall.origin)
}

async function handleNestedUndelegate(visitedCall: VisitedCall): Promise<void> {
    await handleUndelegate(visitedCall.call, visitedCall.origin)
}

// async function nestedCallVisitor(visitedCall: VisitedCall) {
//     switch (visitedCall.extras.type) {
//         case "multisig":
//             await handleMultisig(visitedCall.successCall, visitedCall.extras.executionStatus);
//             break;
//         case "other":
//             await otherCallVisitor(visitedCall.successCall, visitedCall.callOriginAddress, visitedCall.block);
//             break;
//     }
// }

// export async function visitSuccessNestedCalls(
//     extrinsic: SubstrateExtrinsic,
//     visitor: (VisitedCall) => void
// ) {
//     const eventQueue = new EventQueue(extrinsic)
//     const call = extrinsic.extrinsic.method
//     const callOrigin = extrinsic.extrinsic.signer.toString()
//     const block = extrinsic.block
//     const depth = 0
//
//     if (extrinsic.success) {
//         await _visitSuccessNestedCalls(call, callOrigin, block, visitor, eventQueue, depth)
//     }
// }

// interface VisitedCall {
//     successCall: CallBase<AnyTuple>
//     callOriginAddress: string
//     extras: VisitedExtras
//     block: SubstrateBlock
// }

// export type VisitedExtras = VisitedMultisig | VisitedOther
//
// interface VisitedMultisig {
//     type: "multisig"
//     executionStatus: MultisigStatus
// }
//
// interface VisitedOther {
//     type: "other"
// }

// async function _visitSuccessNestedCalls(
//     call: CallBase<AnyTuple>,
//     callOriginAddress: string,
//     block: SubstrateBlock,
//     visitor: (VisitedCall) => void,
//     eventQueue: EventQueue,
//     depth: number
// ) {
//     function logWalkInfo(content: string) {
//         const indent = "  ".repeat(depth)
//         logger.info(indent + content)
//     }
//
//     function logWalkWarn(content: string) {
//         const indent = "  ".repeat(depth)
//         logger.warn(indent + content)
//     }
//
//     const nextDepth = depth + 1
//
//     if (isBatch(call)) {
//         let innerCalls = callsFromBatch(call);
//         let idx = 0
//
//         logWalkInfo(`Visiting batch with ${innerCalls.length} inner calls`)
//
//         for (const innerCall of innerCalls) {
//             await eventQueue.useNextBatchCompletionStatus((async status => {
//                 switch (status) {
//                     case true:
//                         logWalkInfo(`Batch item succeeded`)
//                         await _visitSuccessNestedCalls(innerCall, callOriginAddress, block, visitor, eventQueue, nextDepth)
//                         break;
//                     case false:
//                         logWalkInfo(`Batch item failed`)
//                         break
//                     case undefined:
//                         logWalkWarn(`Failed to determine completion status for inner call at ${idx}`)
//                 }
//             }))
//             idx++
//         }
//     } else if (isProxy(call)) {
//         logWalkInfo(`Detected proxy`)
//
//         await eventQueue.useNextProxyCompletionStatus((async succeeded => {
//             if (succeeded) {
//                 logWalkInfo(`Proxy call succeeded`)
//
//                 const [proxyCall, proxyOrigin] = callFromProxy(call)
//                 await _visitSuccessNestedCalls(proxyCall, proxyOrigin, block, visitor, eventQueue, nextDepth)
//             } else  {
//                 logWalkInfo(`Proxy call failed`)
//             }
//         }))
//     } else if (isMultisig(call)) {
//         logWalkInfo(`Detected multisig`)
//
//         await eventQueue.useNextMultisigCompletionStatus((async status => {
//             const visitedCall: VisitedCall = {
//                 successCall: call,
//                 callOriginAddress: callOriginAddress,
//                 block: block,
//                 extras: {
//                     type: "multisig",
//                     executionStatus: status
//                 }
//             }
//             await visitor(visitedCall) // we visit multisig calls separately since mappers need them to save callData
//
//             switch (status) {
//                 case MultisigStatus.APPROVED:
//                     logWalkInfo(`Multisig was approved but not yet executed`)
//
//                     break;
//                 case MultisigStatus.EXECUTED_OK:
//                     logWalkInfo(`Multisig was executed ok`)
//
//                     const [multisigCall, multisigOrigin] = await callFromMultisig(call, callOriginAddress)
//                     await _visitSuccessNestedCalls(multisigCall, multisigOrigin, block, visitor, eventQueue, nextDepth)
//
//                     break;
//                 case MultisigStatus.EXECUTED_FAILED:
//                     logWalkInfo(`Multisig was executed with failure`)
//
//                     break;
//                 case undefined:
//                     logWalkWarn(`Failed to determine completion status for multisig`)
//
//                     break;
//             }
//         }))
//     } else {
//         logWalkInfo(`Visiting leaf: ${call.section}-${call.method}`)
//         const visitedCall: VisitedCall = {
//             successCall: call,
//             callOriginAddress: callOriginAddress,
//             block: block,
//             extras: {
//                 type: "other"
//             }
//         }
//
//         await visitor(visitedCall)
//     }
// }
//
// function isBatch(call: CallBase<AnyTuple>): boolean {
//     return call.section == "utility" && batchCalls.includes(call.method)
// }
//
// function isProxy(call: CallBase<AnyTuple>): boolean {
//     return call.section == "proxy" && proxyCalls.includes(call.method)
// }
//
// function isMultisig(call: CallBase<AnyTuple>): boolean {
//     return call.section == "multisig" && multisigCalls.includes(call.method)
// }
//
// function callsFromBatch(batchCall: CallBase<AnyTuple>): CallBase<AnyTuple>[] {
//     return batchCall.args[0] as Vec<CallBase<AnyTuple>>
// }
//
// function callFromProxy(proxyCall: CallBase<AnyTuple>): [CallBase<AnyTuple>, string] {
//     let proxyOrigin: Codec
//     let proxiedCall: Codec
//
//     if (proxyCall.method == "proxy") {
//         // args = [real, force_proxy_type, call]
//         proxyOrigin = proxyCall.args[0]
//         proxiedCall = proxyCall.args[2]
//     } else if (proxyCall.method == "proxyAnnounced") {
//         // args = [delegate, real, force_proxy_type, call]
//         proxyOrigin = proxyCall.args[1]
//         proxiedCall = proxyCall.args[3]
//     } else {
//         throw Error(`Invalid state - unknown proxy method: ${proxyCall.method}`)
//     }
//
//     return [proxiedCall as CallBase<AnyTuple>, (proxyOrigin as Address).toString()]
// }
//
// async function callFromMultisig(call: CallBase<AnyTuple>, originAddress: string): Promise<[CallBase<AnyTuple>, string]> {
//     if (call.method == "asMulti") {
//         const [threshold, otherSignatories, _, multisigCall] = call.args
//
//         const multisigAddress = generateMultisigAddress(
//             originAddress,
//             otherSignatories as Vec<AccountId>,
//             (threshold as INumber).toNumber()
//         )
//
//         return [multisigCall as CallBase<AnyTuple>, multisigAddress]
//     } else if (call.method == "asMultiThreshold1") {
//         const [otherSignatories, multisigCall] = call.args
//         const threshold = 1
//
//         const multisigAddress = generateMultisigAddress(originAddress, otherSignatories as Vec<AccountId>, threshold)
//
//         return [multisigCall as CallBase<AnyTuple>, multisigAddress]
//     } else if (call.method == "approveAsMulti") {
//         const [threshold, otherSignatories, _, multisigCallHash] = call.args
//         const callHash = multisigCallHash.toHex()
//         const callData = await PendingMultisig.get(callHash)
//
//         if (callData == undefined) {
//             throw Error(`Failed to find call data for callHash ${callHash}`)
//         }
//
//         const multisigCall = api.registry.createType("GenericCall", callData) as CallBase<AnyTuple>
//         const multisigAddress = generateMultisigAddress(
//             originAddress,
//             otherSignatories as Vec<AccountId>,
//             (threshold as INumber).toNumber()
//         )
//
//         return [multisigCall, multisigAddress]
//     } else {
//         throw Error(`Invalid state - unknown multisig method: ${call.method}`)
//     }
// }


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