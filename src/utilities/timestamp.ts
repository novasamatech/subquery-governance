import { SubstrateBlock } from "@subql/types";

export const timestamp = (block: SubstrateBlock) => {
  return block.timestamp ? block.timestamp.getTime() / 1000 : -1;
}