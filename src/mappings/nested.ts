import { SubstrateExtrinsic } from "@subql/types";
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { visitNestedCalls } from "../utilities/CallWalk";

export async function handleNestedCalls(extrinsic: SubstrateExtrinsic): Promise<void> {
  await cryptoWaitReady();
  await visitNestedCalls(extrinsic);
}
