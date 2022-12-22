import { SubstrateExtrinsic, SubstrateBlock } from "@subql/types";

import {
	Delegation, 
	Referendum, 
	CastingVoting, 
	DelegatorVoting,
	ConvictionVote, 
	StandardVote, 
	SplitVote, 
	SplitAbstainVote 
} from "../types";

import { Codec } from "@polkadot/types/types"
import { AccountVote } from "./votingTypes"

export async function handleVote(extrinsic: SubstrateExtrinsic): Promise<void> {
	const sender = extrinsic.extrinsic.signer
    const [referendumIndex, accountVote] = extrinsic.extrinsic.args
    const blockNumber = extrinsic.block.block.header.number.toNumber()

    await createOrUpdateVote(sender.toString(), referendumIndex.toString(), accountVote as AccountVote, blockNumber)
}

export async function handleRemoveVote(extrinsic: SubstrateExtrinsic): Promise<void> {
	const sender = extrinsic.extrinsic.signer
	const [trackId, referendumIndex] = extrinsic.extrinsic.args

	const referendum = await Referendum.get(referendumIndex.toString())

	if (referendum == undefined) return

	if (!referendum.finished) {
		const votingId = getVotingId(sender.toString(), referendumIndex.toString())

		await CastingVoting.remove(votingId)
	}
}

async function createOrUpdateVote(voter: string, referendumIndex: string, accountVote: AccountVote, blockNumber: number): Promise<void> {
	const votingId = getVotingId(voter, referendumIndex)

	var voting = await CastingVoting.get(votingId)

	if (voting == undefined) {
		await createVoting(voter, referendumIndex, accountVote, blockNumber)
	} else {
		await updateVoting(voting, accountVote, blockNumber)
	}
}

async function createVoting(voter: string, referendumIndex: string, accountVote: AccountVote, blockNumber: number): Promise<void> {
	const voting = CastingVoting.create({
		id: getVotingId(voter, referendumIndex),
		voter: voter,
		referendumId: referendumIndex,
		at: blockNumber,
		standardVote: extractStandardVote(accountVote),
		splitVote: extractSplitVote(accountVote),
		splitAbstainVote: extractSplitAbstainVote(accountVote)
	})

	await voting.save()

	/// delegators' votes are taken into account only for standard vote of the delegate
	const isStandardVote = voting.standardVote != null

	if (isStandardVote) {
		const referendum = await Referendum.get(referendumIndex)

		await addDelegatorVotings(voting.id, voter, referendum.trackId)
	}
}

async function updateVoting(voting: CastingVoting, accountVote: AccountVote, blockNumber: number): Promise<void> {
	const isStandardBefore = voting.standardVote != null

	voting.at = blockNumber
	voting.standardVote = extractStandardVote(accountVote)
	voting.splitVote = extractSplitVote(accountVote)
	voting.splitAbstainVote = extractSplitAbstainVote(accountVote)

	await voting.save()

	const isStandardAfter = voting.standardVote != null

	/// delegators' votes are taken into account only for standard vote of the delegate
	if (!isStandardBefore && isStandardAfter) {
		const referendum = await Referendum.get(voting.referendumId)
		await addDelegatorVotings(voting.id, voting.voter, referendum.trackId)
	} else if (isStandardBefore && !isStandardAfter) {
		await clearDelegatorVotings(voting.id)
	}
}

async function addDelegatorVotings(parentVotingId: string, delegate: string, trackId: number): Promise<void> {
	/// store's interface doesn't allow to query by two field so we query by voter and then filter by track id
	const allDelegations = await Delegation.getByDelegateId(delegate)

	const trackDelegations = allDelegations.filter(delegation => { delegation.trackId == trackId })

	const delegatorVotings = trackDelegations.map(delegation => {
		return DelegatorVoting.create({
			id: getDelegatorVotingId(parentVotingId, delegation.delegator),
			parentId: parentVotingId,
			delegator: delegation.delegator,
			vote: delegation.delegation
		})
	})

	if (delegatorVotings.length > 0) {
		await store.bulkCreate(DelegatorVoting.name, delegatorVotings)
	}
}

async function clearDelegatorVotings(parentVotingId: string): Promise<void> {
	const allVotings = await DelegatorVoting.getByParentId(parentVotingId)

	for(var voting of allVotings) {
		await DelegatorVoting.remove(voting.id)
	}
}

function extractStandardVote(accountVote: AccountVote): StandardVote {
	if (accountVote.isStandard) {
		const standardVote = accountVote.asStandard
		return {
			aye: standardVote.vote.aye,
			vote: {
				conviction: standardVote.vote.conviction.type,
				amount: standardVote.balance.toString()
			}
		}
	} else {
		return null
	}
}

function extractSplitVote(accountVote: AccountVote): SplitVote {
	if (accountVote.isSplit) {
		const splitVote = accountVote.asSplit
		return {
			ayeAmount: splitVote.aye.toString(),
			nayAmount: splitVote.nay.toString()
		}
	} else {
		return null
	}
}

function extractSplitAbstainVote(accountVote: AccountVote): SplitAbstainVote {
	if (accountVote.isSplitAbstain) {
		const vote = accountVote.asSplitAbstain
		return {
			ayeAmount: vote.aye.toString(),
			nayAmount: vote.nay.toString(),
			abstainAmount: vote.abstain.toString()
		}
	} else {
		return null
	}
}

function getVotingId(voter: string, referendumIndex: string): string {
	return `${referendumIndex}-${voter}`
}

function getDelegatorVotingId(votingId: string, delegator: string): string {
	return `${votingId}-${delegator}`
}