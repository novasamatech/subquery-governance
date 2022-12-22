import {Delegate, Delegation} from "../types";
import {describe, expect, jest, test, beforeEach} from '@jest/globals';
import {handleDelegate} from "../mappings/delegate";
import {CallBase} from "@polkadot/types/types/calls";
import {AnyTuple} from "@polkadot/types/types/codec";
import {Address} from "@polkadot/types/interfaces/runtime/types";
import {Store} from "@subql/types/dist"

function mockType(toStringValue: string): unknown {
    return {
        toString: jest.fn().mockReturnValue(toStringValue)
    }
}

function mockNumber(number: number): unknown {
    return {
        toString: jest.fn().mockReturnValue(number.toString()),
        toNumber: jest.fn().mockReturnValue(number)
    }
}

const delegateAccountId = mockType("FZyFBAqs93TenupzDHJzW1pxFLxwwo1EJLvT89jhrV368yb")
const trackId = mockNumber(0)
const conviction = mockType("Locked1x")
const amount = mockNumber(1000)

const delegateCall = {
    args: [trackId, delegateAccountId, conviction, amount]
} as unknown as CallBase<AnyTuple>

const signer = mockType("HqRcfhH8VXMhuCk5JXe28WMgDDuW9MVDVNofe1nnTcefVZn") as Address

describe('delegate handler', () => {
    test('should create new delegate', async () => {
        jest.spyOn(Delegate, "get").mockReturnValue(undefined)
        jest.spyOn(Delegation, "getByDelegator").mockResolvedValue([])
        jest.spyOn(Delegation.prototype, "save").mockResolvedValue(undefined)

        jest.spyOn(Delegate.prototype, "save").mockImplementation(function (this: Delegate) {
            expect(this.accountId).toBe(delegateAccountId.toString())
            return Promise.resolve()
        })

        await handleDelegate(delegateCall, signer)
    });
})