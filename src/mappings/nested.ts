import { SubstrateExtrinsic } from "@subql/types";
import { visitNestedCalls } from "../utilities/CallWalk";

export async function handleNestedCalls(extrinsic: SubstrateExtrinsic): Promise<void> {
  await visitNestedCalls(extrinsic);
}
