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
import { getAllActiveReferendums } from "./referendum"
import {CallBase} from "@polkadot/types/types/calls";
import {AnyTuple} from "@polkadot/types/types/codec";
import {Address} from "@polkadot/types/interfaces/runtime/types";

export async function handleVoteHandler(extrinsic: SubstrateExtrinsic): Promise<void> {
	const callOrigin = extrinsic.extrinsic.signer
    const call = extrinsic.extrinsic.method
    const blockNumber = extrinsic.block.block.header.number.toNumber()

    await handleVote(call, callOrigin.toString(), blockNumber)
}

export async function handleVote(call: CallBase<AnyTuple>, callOrigin: string, blockNumber: number): Promise<void> {
    const [referendumIndex, accountVote] = call.args

    await createOrUpdateVote(callOrigin, referendumIndex.toString(), accountVote as AccountVote, blockNumber)	
}

export async function handleRemoveVoteHandler(extrinsic: SubstrateExtrinsic): Promise<void> {
	const callOrigin = extrinsic.extrinsic.signer
	const call = extrinsic.extrinsic.method

	await handleRemoveVote(call, callOrigin.toString())
}

export async function handleRemoveVote(call: CallBase<AnyTuple>, callOrigin: string): Promise<void> {
	const [trackId, referendumIndex] = call.args

	const referendum = await Referendum.get(referendumIndex.toString())

	if (referendum == undefined) return

	if (!referendum.finished) {
		const votingId = getVotingId(callOrigin, referendumIndex.toString())

		await CastingVoting.remove(votingId)

		await clearDelegatorVotings(votingId)
	}
}

export async function addDelegatorActiveVotings(delegate: string, delegator: string, trackId: number, vote: ConvictionVote): Promise<void> {
	const votings = await CastingVoting.getByVoter(delegate)
	const allTrackReferendums = await getAllActiveReferendums(trackId)

	const trackVotings = votings.filter(voting => {
		return allTrackReferendums[voting.referendumId] != null
	})

	const delegatorVotings = trackVotings.map(voting => {
		return DelegatorVoting.create({
			id: getDelegatorVotingId(voting.id, delegator),
			parentId: voting.id,
			delegator: delegator,
			vote: vote
		})
	})

	if (delegatorVotings.length > 0) {
		logger.info(`Add delegator ${delegator} votes in track ${trackId} from ${delegate}`)
		await store.bulkCreate('DelegatorVoting', delegatorVotings)
	}
}

export async function removeDelegatorActiveVotings(delegate: string, delegator: string, trackId: number): Promise<void> {
	const votings = await CastingVoting.getByVoter(delegate)
	const allTrackReferendums = await getAllActiveReferendums(trackId)

	const trackVotings = votings.filter(voting => {
		return allTrackReferendums[voting.referendumId] != null
	})

	for(var voting of trackVotings) {
		logger.info(`Removing votes from ${voting.referendumId} for ${delegator}`)

		const delegatorVotingId = getDelegatorVotingId(voting.id, delegator)
		await DelegatorVoting.remove(delegatorVotingId)
	}
}

export function isVote(call: CallBase<AnyTuple>): boolean {
	return call.section == "convictionVoting" && call.method == "vote"
}

export function isRemoveVote(call: CallBase<AnyTuple>): boolean {
	return call.section == "convictionVoting" && call.method == "removeVote"	
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

	logger.info(`Delegations of ${delegate}: ${allDelegations.length}`)

	const trackDelegations = allDelegations.filter(delegation => { return delegation.trackId == trackId })

	logger.info(`Delegations of ${delegate} for track ${trackId}: ${trackDelegations.length}`)

	const delegatorVotings = trackDelegations.map(delegation => {
		return DelegatorVoting.create({
			id: getDelegatorVotingId(parentVotingId, delegation.delegator),
			parentId: parentVotingId,
			delegator: delegation.delegator,
			vote: delegation.delegation
		})
	})

	if (delegatorVotings.length > 0) {
		logger.info(`Add delegate's votings: ${parentVotingId} ${delegate}`)
		await store.bulkCreate('DelegatorVoting', delegatorVotings)
	}
}

async function clearDelegatorVotings(parentVotingId: string): Promise<void> {
	const allVotings = await DelegatorVoting.getByParentId(parentVotingId)

	/// store interface doesn't allow bulk removal so do it one by one
	for(var voting of allVotings) {
		logger.info(`Clear delegate voting: ${parentVotingId}`)
		await DelegatorVoting.remove(voting.id)
	}
}

function extractStandardVote(accountVote: AccountVote): StandardVote {
	if (accountVote.isStandard) {
		const standardVote = accountVote.asStandard
		return {
			aye: standardVote.vote.isAye,
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
	return `${referendumIndex}:${voter}`
}

function getDelegatorVotingId(votingId: string, delegator: string): string {
	return `${votingId}:${delegator}`
}