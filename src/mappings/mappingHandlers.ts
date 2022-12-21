import {
    SubstrateExtrinsic,
    SubstrateEvent,
    SubstrateBlock,
} from "@subql/types";
import {Delegate, Delegation} from "../types";
import {Big} from "big.js"
import {INumber} from "@polkadot/types-codec/types/interfaces";
import {Codec} from "@polkadot/types-codec/types/codec";

export async function handleDelegate(extrinsic: SubstrateExtrinsic): Promise<void> {
    const sender = extrinsic.extrinsic.signer
    const [trackId, to, conviction, amount] = extrinsic.extrinsic.args

    const delegateAccountIdHex = to.toString()
    const delegatorAccountIdHex = sender.toString()
    const delegatorVotes = convictionVotes(conviction.toString(), amount.toString())

    let delegate = await Delegate.get(delegateAccountIdHex)
    if (delegate == undefined) {
        delegate = Delegate.create({
            id: delegateAccountIdHex,
            accountId: delegateAccountIdHex,
            aggregate: {
                delegatorVotes: "0",
                delegators: 0
            }
        })
    }

    const currentDelegateVotes = Big(delegate.aggregate.delegatorVotes)
    const newDelegateVotes = currentDelegateVotes.plus(delegatorVotes)

    delegate.aggregate.delegatorVotes = newDelegateVotes.toFixed()

    const otherDelegatorDelegations = await Delegation.getByDelegator(delegatorAccountIdHex)
    const isFirstDelegationToThisDelegate = otherDelegatorDelegations
        .find((delegation) => delegation.delegateId == delegateAccountIdHex) == undefined

    if (isFirstDelegationToThisDelegate) {
        delegate.aggregate.delegators += 1
    }

    const delegation = Delegation.create({
        id: createDelegationId(trackId.toString(), delegatorAccountIdHex),
        delegateId: delegateAccountIdHex,
        delegator: delegatorAccountIdHex,
        delegation: {
            conviction: conviction.toString(),
            amount: amount.toString()
        },
        trackId: requireNumber(trackId).toNumber()
    })

    await delegation.save()
    await delegate.save()
}

export async function handleUndelegate(extrinsic: SubstrateExtrinsic): Promise<void> {
    const sender = extrinsic.extrinsic.signer
    const [trackId] = extrinsic.extrinsic.args

    const delegatorAccountIdHex = sender.toString()
    const delegationId = createDelegationId(trackId.toString(), delegatorAccountIdHex)

    const delegation = await Delegation.get(delegationId)
    if (delegation == undefined) return

    await Delegation.remove(delegationId)

    const delegate = await Delegate.get(delegation.delegateId)
    if (delegate == undefined) return

    const currentDelegateVotes = Big(delegate.aggregate.delegatorVotes)
    const removedVotes = convictionVotes(delegation.delegation.conviction, delegation.delegation.amount)
    const newDelegatorVotes = currentDelegateVotes.minus(removedVotes)

    const otherDelegatorDelegations = await Delegation.getByDelegator(delegatorAccountIdHex)
    // we have already removed delegation from db above so here the list should be empty in case it was the last one
    const wasLastDelegationToThisDelegate = otherDelegatorDelegations
        .find((delegation) => delegation.delegateId == delegate.accountId) == undefined

    if (wasLastDelegationToThisDelegate) {
        delegate.aggregate.delegators -= 1
    }
    delegate.aggregate.delegatorVotes = newDelegatorVotes.toFixed()

    if (delegate.aggregate.delegators == 0){
        await Delegation.remove(delegation.delegateId)
    } else  {
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