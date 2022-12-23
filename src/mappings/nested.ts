import {SubstrateExtrinsic} from "@subql/types";
import {visitNestedCalls} from "../utilities/CallWalk";

export async function handleNestedCalls(extrinsic: SubstrateExtrinsic): Promise<void> {
    console.log(`Visiting nesting calls at ${extrinsic.block.block.header.number}`)

    await visitNestedCalls(extrinsic)
}