import {
    SubstrateExtrinsic,
    SubstrateEvent,
    SubstrateBlock,
} from "@subql/types";
import {Delegate, Delegation} from "../types";
import {Big} from "big.js"
import {INumber} from "@polkadot/types-codec/types/interfaces";
import {Codec} from "@polkadot/types-codec/types/codec";
import {CallBase} from "@polkadot/types/types/calls";
import {AnyTuple} from "@polkadot/types/types/codec";
import {Address} from "@polkadot/types/interfaces/runtime/types";

export async function handleDelegateHandler(extrinsic: SubstrateExtrinsic): Promise<void> {
    await handleDelegate(extrinsic.extrinsic.method, extrinsic.extrinsic.signer)
}

export async function handleDelegate(call: CallBase<AnyTuple>, callOrigin: Address): Promise<void> {
    const sender = callOrigin
    const [trackId, to, conviction, amount] = call.args

    const delegateAddress = to.toString()
    const delegatorAddress = sender.toString()
    const delegatorVotes = convictionVotes(conviction.toString(), amount.toString())

    let delegate = await Delegate.get(delegateAddress)
    if (delegate == undefined) {
        delegate = Delegate.create({
            id: delegateAddress,
            accountId: delegateAddress,
            aggregate: {
                delegatorVotes: "0",
                delegators: 0
            }
        })
    }

    const currentDelegateVotes = Big(delegate.aggregate.delegatorVotes)
    const newDelegateVotes = currentDelegateVotes.plus(delegatorVotes)

    delegate.aggregate.delegatorVotes = newDelegateVotes.toFixed()

    const otherDelegatorDelegations = await Delegation.getByDelegator(delegatorAddress)
    const isFirstDelegationToThisDelegate = otherDelegatorDelegations
        .find((delegation) => delegation.delegateId == delegateAddress) == undefined

    if (isFirstDelegationToThisDelegate) {
        delegate.aggregate.delegators += 1
    }

    const delegation = Delegation.create({
        id: createDelegationId(trackId.toString(), delegatorAddress),
        delegateId: delegateAddress,
        delegator: delegatorAddress,
        delegation: {
            conviction: conviction.toString(),
            amount: amount.toString()
        },
        trackId: requireNumber(trackId).toNumber()
    })

    await delegation.save()
    await delegate.save()
}

export async function handleUndelegateHandler(extrinsic: SubstrateExtrinsic): Promise<void> {
    await handleUndelegate(extrinsic.extrinsic.method, extrinsic.extrinsic.signer)
}

export async function handleUndelegate(call: CallBase<AnyTuple>, callOrigin: Address): Promise<void> {
    const sender = callOrigin
    const [trackId] = call.args

    const delegatorAddress = sender.toString()
    const delegationId = createDelegationId(trackId.toString(), delegatorAddress)

    const delegation = await Delegation.get(delegationId)
    if (delegation == undefined) return

    await Delegation.remove(delegationId)

    const delegate = await Delegate.get(delegation.delegateId)
    if (delegate == undefined) return

    const currentDelegateVotes = Big(delegate.aggregate.delegatorVotes)
    const removedVotes = convictionVotes(delegation.delegation.conviction, delegation.delegation.amount)
    const newDelegatorVotes = currentDelegateVotes.minus(removedVotes)

    const otherDelegatorDelegations = await Delegation.getByDelegator(delegatorAddress)
    // we have already removed delegation from db above so here the list should be empty in case it was the last one
    const wasLastDelegationToThisDelegate = otherDelegatorDelegations
        .find((delegation) => delegation.delegateId == delegate.accountId) == undefined

    if (wasLastDelegationToThisDelegate) {
        delegate.aggregate.delegators -= 1
    }
    delegate.aggregate.delegatorVotes = newDelegatorVotes.toFixed()

    if (delegate.aggregate.delegators == 0) {
        await Delegate.remove(delegation.delegateId)
    } else {
        await delegate.save()
    }
}

function createDelegationId(trackId: string, delegatorAccountIdHex: string): string {
    return delegatorAccountIdHex + ":" + trackId
}

function convictionMultiplier(conviction: String): Big {
    let multiplier: number

    switch (conviction) {
        case "None":
            multiplier = 0.1
            break
        case "Locked1x":
            multiplier = 1
            break
        case "Locked2x":
            multiplier = 2
            break
        case "Locked3x":
            multiplier = 3
            break
        case "Locked4x":
            multiplier = 4
            break
        case "Locked5x":
            multiplier = 5
            break
        case "Locked6x":
            multiplier = 6
            break
        default:
            throw Error(`Unknown conviction type: ${conviction}`)
    }

    return Big(multiplier)
}

function requireNumber(codec: Codec): INumber {
    return codec as INumber
}

function convictionVotes(conviction: string, votes: string): Big {
    const votesBigDecimal = Big(votes);

    return votesBigDecimal.mul(convictionMultiplier((conviction)))
}


export function isDelegate(call: CallBase<AnyTuple>) {
    return call.section == "convictionVoting" && call.method == "delegate"
}

export function isUndelegate(call: CallBase<AnyTuple>) {
    return call.section == "convictionVoting" && call.method == "undelegate"
}