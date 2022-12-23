import {SubstrateExtrinsic} from "@subql/types";
import {Codec} from "@polkadot/types-codec/types";
import {TypedEventRecord} from "@subql/types/dist/interfaces";

enum MultisigStatus {
    APPROVED, EXECUTED_OK, EXECUTED_FAILED
}

export class EventQueue {

    private readonly extrinsicEvents: TypedEventRecord<Codec[]>[]

    constructor(extrinsic: SubstrateExtrinsic) {
        this.extrinsicEvents = extrinsic.events
    }

    async useNextBatchCompletionStatus(use: (success: boolean) => void) {
        await this.useEventOnce(this.batchItemCompletionStatus, use)
    }

    async useNextMultisigCompletionStatus(use: (success: MultisigStatus) => void) {
        await this.useEventOnce(this.multisigCompletionStatus, use)
    }

    async useNextProxyCompletionStatus(use: (success: boolean) => void) {
        await this.useEventOnce(this.proxyCompletionStatus, use)
    }

    async useEventOnce<T>(
        finder: (event: TypedEventRecord<Codec[]>) => T | undefined,
        use: (foundValue: T | undefined) => void,
    ) {
        const eventIndex = this.findEventIndex(finder)

        if (eventIndex != undefined) {
            const event = finder(this.extrinsicEvents[eventIndex])
            // since use() might delete some events as well as result of nested work, we record expected final length
            // to adjust deletion count later
            const expectedFinalLength = this.extrinsicEvents.length - (eventIndex + 1)

            await use(event)

            const deleteCount = this.extrinsicEvents.length - expectedFinalLength
            if (deleteCount > 0) {
                this.extrinsicEvents.splice(0, deleteCount)
            }
        } else {
            use(undefined)
        }
    }

    private findEventIndex<T>(finder: (event: TypedEventRecord<Codec[]>) => T | undefined): number | undefined {
        let item: T | undefined = undefined
        let index = 0

        while (index < this.extrinsicEvents.length && item == undefined) {
            const nextEvent = this.extrinsicEvents[index]
            item = finder(nextEvent)
            index++
        }

        if (item == undefined) {
            return undefined
        } else {
            return index
        }
    }

    private batchItemCompletionStatus(event: TypedEventRecord<Codec[]>): boolean | undefined {
        if (api.events.utility.ItemCompleted.is(event.event)) {
            return true
        } else if (api.events.utility.ItemFailed.is(event.event)) {
            return false
        } else {
            return undefined
        }
    }

    private multisigCompletionStatus(event: TypedEventRecord<Codec[]>): MultisigStatus | undefined {
        if (api.events.multisig.MultisigApproval.is(event.event)) {
            return MultisigStatus.APPROVED
        } else if (api.events.multisig.MultisigExecuted.is(event.event)) {
            const executionResult = event.event.data[4]
            if (executionResult.isOk) {
                return MultisigStatus.EXECUTED_OK
            } else {
                return MultisigStatus.EXECUTED_FAILED
            }
        } else {
            return undefined
        }
    }

    private proxyCompletionStatus(event: TypedEventRecord<Codec[]>): boolean | undefined {
        if (api.events.proxy.ProxyExecuted.is(event.event)) {
            const [executionResult] = event.event.data

            return executionResult.isOk
        } else {
            return undefined
        }
    }
}