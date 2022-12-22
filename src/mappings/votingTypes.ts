import type { Enum, Struct } from '@polkadot/types-codec';
import type { Balance } from '@polkadot/types/interfaces/runtime';

/// Polkadot JS lib currently doesn't contain types for convictionVoting and referenda pallets. Added them manually.

export interface AccountVote extends Enum {
  readonly isStandard: boolean;
  readonly asStandard: AccountVoteStandard;
  readonly isSplit: boolean;
  readonly asSplit: AccountVoteSplit;
  readonly isSplitAbstain: boolean;
  readonly asSplitAbstain: AccountVoteSplitAbstain
  readonly type: 'Standard' | 'Split' | 'SplitAbstain';
}

export interface AccountVoteSplit extends Struct {
  readonly aye: Balance;
  readonly nay: Balance;
}

export interface AccountVoteStandard extends Struct {
  readonly vote: Vote;
  readonly balance: Balance;
}

export interface AccountVoteSplitAbstain extends Struct {
  readonly aye: Balance;
  readonly nay: Balance;
  readonly abstain: Balance;
}

export interface Vote extends Struct {
  readonly aye: boolean;
  readonly conviction: Conviction;
}

export interface Conviction extends Enum {
  readonly isNone: boolean;
  readonly isLocked1x: boolean;
  readonly isLocked2x: boolean;
  readonly isLocked3x: boolean;
  readonly isLocked4x: boolean;
  readonly isLocked5x: boolean;
  readonly isLocked6x: boolean;
  readonly type: 'None' | 'Locked1x' | 'Locked2x' | 'Locked3x' | 'Locked4x' | 'Locked5x' | 'Locked6x';
}