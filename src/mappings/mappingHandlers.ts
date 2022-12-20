import {
  SubstrateExtrinsic,
  SubstrateEvent,
  SubstrateBlock,
} from "@subql/types";
import { Delegate, DelegateAggregate, Delegation } from "../types";
import { Balance } from "@polkadot/types/interfaces";

export async function handleDelegate(extrinsic: SubstrateExtrinsic): Promise<void> {
  const sender = extrinsic.extrinsic.signer
  const [trackId, to, conviction, amount] = extrinsic.extrinsic.args

  // const delegateAccountIdHex = accountId.toHex()
  //
  // const existingRecord = await Delegate.getByAccountId(delegateAccountIdHex)
  //
  // if (existingRecord != undefined) {
  //   existingRecord.delegationsId.push(sender.toHex())
  //   existingRecord.aggregate.delegators += 1
  //   existingRecord.aggregate.delegatorVotes += conviction
  // }
}


