import { SubstrateExtrinsic } from "@subql/types";
import { handleDelegate, handleUndelegate } from "../mappings/delegate";
import { handleRemoveVote, handleVote } from "../mappings/voting";
import { CreateCallVisitorBuilder, CreateCallWalk } from "subquery-call-visitor/dist/impls";
import { VisitedCall } from "subquery-call-visitor/dist/interfaces";

const callWalk = CreateCallWalk();

const visitor = CreateCallVisitorBuilder()
  .on("utility", ["batch", "batchAll", "forceBatch"], (extrinsic, context) => {
    const calls = extrinsic.call.args.at(0);
    if (Array.isArray(calls) && calls.length > 1000) {
      // we're skipping large batches, something terrible happens inside anyway
      context.stop();
    }
  })
  .on("convictionVoting", "vote", handleNestedVote)
  .on("convictionVoting", "removeVote", handleNestedRemoveVote)
  .on("convictionVoting", "delegate", handleNestedDelegate)
  .on("convictionVoting", "undelegate", handleNestedUndelegate)
  .ignoreFailedCalls(true)
  .build();

export async function visitNestedCalls(extrinsic: SubstrateExtrinsic) {
  let blockNumber = extrinsic.block.block.header.number.toNumber();
  logger.info(`Starting nested walk for extrinsic ${blockNumber}-${extrinsic.idx}`);

  await callWalk.walk(extrinsic, visitor);

  logger.info(`Finished nested walk for extrinsic ${extrinsic.block.block.header.number}-${extrinsic.idx}`);
}

async function handleNestedVote(visitedCall: VisitedCall): Promise<void> {
  await handleVote(visitedCall.call, visitedCall.origin, visitedCall.extrinsic.block);
}

async function handleNestedRemoveVote(visitedCall: VisitedCall): Promise<void> {
  await handleRemoveVote(visitedCall.call, visitedCall.origin);
}

async function handleNestedDelegate(visitedCall: VisitedCall): Promise<void> {
  await handleDelegate(visitedCall.call, visitedCall.origin, visitedCall.extrinsic.block);
}

async function handleNestedUndelegate(visitedCall: VisitedCall): Promise<void> {
  await handleUndelegate(visitedCall.call, visitedCall.origin);
}
