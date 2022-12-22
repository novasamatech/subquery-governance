import { SubstrateExtrinsic, SubstrateBlock } from "@subql/types";

import { 
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

function getVotingId(voter: string, referendumIndex: string): string {
	return `${referendumIndex}-${voter}`
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
}

async function updateVoting(voting: CastingVoting, accountVote: AccountVote, blockNumber: number): Promise<void> {
	voting.at = blockNumber
	voting.standardVote = extractStandardVote(accountVote)
	voting.splitVote = extractSplitVote(accountVote)
	voting.splitAbstainVote = extractSplitAbstainVote(accountVote)

	await voting.save()
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