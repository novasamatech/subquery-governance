import { SubstrateExtrinsic, SubstrateBlock } from "@subql/types";

import {
	Delegation,
	Referendum,
	CastingVoting,
	DelegatorVoting,
	ConvictionVote,
	StandardVote,
	SplitVote,
	SplitAbstainVote, Delegate
} from "../types";

import { AccountVote } from "./votingTypes"
import { getAllActiveReferendums } from "./referendum"
import {CallBase} from "@polkadot/types/types/calls";
import {AnyTuple} from "@polkadot/types/types/codec";
import {getDelegate, getDelegateId} from "./delegate";
import {unboundedQueryOptions} from "./common";
import { timestamp } from "../utilities/timestamp";

export async function handleVoteHandler(extrinsic: SubstrateExtrinsic): Promise<void> {
	const callOrigin = extrinsic.extrinsic.signer
    const call = extrinsic.extrinsic.method

    await handleVote(call, callOrigin.toString(), extrinsic.block)
}

export async function handleVote(call: CallBase<AnyTuple>, callOrigin: string, block: SubstrateBlock): Promise<void> {
    const [referendumIndex, accountVote] = call.args

    await createOrUpdateVote(callOrigin, referendumIndex.toString(), accountVote as AccountVote, block)
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
	const votings = await getCastingVotingByVoter(delegate)
	const allTrackReferendums = await getAllActiveReferendums(trackId)

	const targetVotings = votings.filter(voting => {
		return isStandard(voting) && (allTrackReferendums[voting.referendumId] != null)
	})

	const delegatorVotings = targetVotings.map(voting => {
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
	const votings = await getCastingVotingByVoter(delegate)
	const allTrackReferendums = await getAllActiveReferendums(trackId)

	const targetVotings = votings.filter(voting => {
		return isStandard(voting) && (allTrackReferendums[voting.referendumId] != null)
	})

	for(var voting of targetVotings) {
		logger.info(`Removing votes from ${voting.referendumId} for ${delegator}`)

		const delegatorVotingId = getDelegatorVotingId(voting.id, delegator)
		await DelegatorVoting.remove(delegatorVotingId)
	}
}

function isStandard(voting: CastingVoting): boolean {
	return voting.standardVote != null
}

export function isVote(call: CallBase<AnyTuple>): boolean {
	return call.section == "convictionVoting" && call.method == "vote"
}

export function isRemoveVote(call: CallBase<AnyTuple>): boolean {
	return call.section == "convictionVoting" && call.method == "removeVote"
}

async function createOrUpdateVote(voter: string, referendumIndex: string, accountVote: AccountVote, block: SubstrateBlock): Promise<void> {
	const votingId = getVotingId(voter, referendumIndex)

	var voting = await CastingVoting.get(votingId)

	if (voting == undefined) {
		await createVoting(voter, referendumIndex, accountVote, block)
	} else {
		await updateVoting(voting, accountVote, block)
	}
}

async function createVoting(voter: string, referendumIndex: string, accountVote: AccountVote, block: SubstrateBlock): Promise<void> {
	let delegateId = getDelegateId(voter)

	let delegate = await getDelegate(delegateId)

	let delegateIdInVoting: string | undefined = undefined
	if (delegate) {
		delegateIdInVoting = delegateId
	}

	logger.info(`Adding new CastingVoting. voter=${voter}, delegateId=${delegateIdInVoting}`)

	const voting = CastingVoting.create({
		id: getVotingId(voter, referendumIndex),
		timestamp: timestamp(block),
		voter: voter,
		referendumId: referendumIndex,
		at: block.block.header.number.toNumber(),
		delegateId: delegateIdInVoting,
		standardVote: extractStandardVote(accountVote),
		splitVote: extractSplitVote(accountVote),
		splitAbstainVote: extractSplitAbstainVote(accountVote)
	})

	await voting.save()

	/// delegators' votes are taken into account only for standard vote of the delegate
	const isStandardVote = voting.standardVote != null

	if (isStandardVote) {
		const referendum = await Referendum.get(referendumIndex)

		await addDelegatorVotings(voting.id, delegateId, referendum.trackId)
	}
}

async function updateVoting(voting: CastingVoting, accountVote: AccountVote, block: SubstrateBlock): Promise<void> {
	const isStandardBefore = isStandard(voting)

	voting.at = block.block.header.number.toNumber()
	voting.standardVote = extractStandardVote(accountVote)
	voting.splitVote = extractSplitVote(accountVote)
	voting.splitAbstainVote = extractSplitAbstainVote(accountVote)
	voting.timestamp = timestamp(block)


	await voting.save()

	const isStandardAfter = isStandard(voting)

	/// delegators' votes are taken into account only for standard vote of the delegate
	if (!isStandardBefore && isStandardAfter) {
		const referendum = await Referendum.get(voting.referendumId)
		await addDelegatorVotings(voting.id, voting.delegateId, referendum.trackId)
	} else if (isStandardBefore && !isStandardAfter) {
		await clearDelegatorVotings(voting.id)
	}
}

export async function addDelegateIdToVotings(delegateAddress: string): Promise<void> {
	logger.info(`Adding delegate id to votings of ${delegateAddress}`)

	const delegateId = getDelegateId(delegateAddress)

	await updateDelegateIdForCastingVotes(delegateAddress, (vote)  =>{
		vote.delegateId = delegateId
	})
}

export async function removeDelegateIdFromVotings(delegateAddress: string): Promise<void> {
	logger.info(`Removing delegate id from votings of ${delegateAddress}`)

	await updateDelegateIdForCastingVotes(delegateAddress, (vote)  =>{
		vote.delegateId = null
	})
}

async function updateDelegateIdForCastingVotes(
	voter: string,
	update: (vote: CastingVoting) => void
): Promise<void> {
	const votes = await getVotingsByVoter(voter)

	for (const vote of votes) {
		update(vote)
		await vote.save()
	}
}

async function getVotingsByVoter(voterAddress: string): Promise<CastingVoting[]> {
	return CastingVoting.getByVoter(voterAddress, unboundedQueryOptions)
}

async function addDelegatorVotings(parentVotingId: string, delegateId: string, trackId: number): Promise<void> {
	/// store's interface doesn't allow to query by two field so we query by voter and then filter by track id
	const allDelegations = await getDelegationByDelegateId(delegateId)

	logger.info(`Delegations of ${delegateId}: ${allDelegations.length}`)

	const trackDelegations = allDelegations.filter(delegation => { return delegation.trackId == trackId })

	logger.info(`Delegations of ${delegateId} for track ${trackId}: ${trackDelegations.length}`)

	const delegatorVotings = trackDelegations.map(delegation => {
		return DelegatorVoting.create({
			id: getDelegatorVotingId(parentVotingId, delegation.delegator),
			parentId: parentVotingId,
			delegator: delegation.delegator,
			vote: delegation.delegation
		})
	})

	if (delegatorVotings.length > 0) {
		logger.info(`Add delegate's votings: ${parentVotingId} ${delegateId}`)
		await store.bulkCreate('DelegatorVoting', delegatorVotings)
	}
}

async function clearDelegatorVotings(parentVotingId: string): Promise<void> {
	const allVotings = await getDelegatorVotingByParentId(parentVotingId)

	/// store interface doesn't allow bulk removal so do it one by one
	for(var voting of allVotings) {
		logger.info(`Clear delegate voting: ${parentVotingId}`)
		await DelegatorVoting.remove(voting.id)
	}
}

async function getDelegationByDelegateId(delegateId: string): Promise<Delegation[] | undefined> {
	return await Delegation.getByDelegateId(delegateId, unboundedQueryOptions);
}

async function getCastingVotingByVoter(voter: string): Promise<CastingVoting[] | undefined>{
	return await CastingVoting.getByVoter(voter, unboundedQueryOptions);
}

async function getDelegatorVotingByParentId(parentId: string): Promise<DelegatorVoting[] | undefined> {
	return await DelegatorVoting.getByParentId(parentId, unboundedQueryOptions);
}

function extractStandardVote(accountVote: AccountVote): StandardVote {
	if (accountVote.isStandard) {
		const standardVote = accountVote.asStandard
		return {
			aye: standardVote.vote.isAye,
			vote: {
				conviction: standardVote.vote.conviction.type,
				amount: standardVote.balance.toString(),
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