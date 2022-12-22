import {SubstrateExtrinsic} from "@subql/types";
import {Codec} from "@polkadot/types-codec/types";
import {TypedEventRecord} from "@subql/types/dist/interfaces";

export class EventQueue {

    private readonly blockEvents: TypedEventRecord<Codec[]>[]

    constructor(extrinsic: SubstrateExtrinsic) {
        this.blockEvents = extrinsic.events
    }

    async useNextBatchCompletionStatus(use: (success: boolean) => void) {
        await this.useEventOnce(this.batchItemCompletionStatus, use)
    }

    async useEventOnce<T>(
        finder: (event: TypedEventRecord<Codec[]>) => T | undefined,
        use: (foundValue: T | undefined) => void,
    ) {
        const eventIndex = this.findEventIndex(finder)

        if (eventIndex != undefined) {
            const event = finder(this.blockEvents[eventIndex])
            // since use() might delete some events as well as result of nested work, we record expected final length
            // to adjust deletion count later
            const expectedFinalLength = this.blockEvents.length - (eventIndex + 1)

            await use(event)

            const deleteCount = this.blockEvents.length - expectedFinalLength
            if (deleteCount > 0) {
                this.blockEvents.splice(0, deleteCount)
            }
        } else  {
            use(undefined)
        }
    }

    private findEventIndex<T>(finder: (event: TypedEventRecord<Codec[]>) => T | undefined): number | undefined {
        let item: T | undefined = undefined
        let index = 0

        while (index < this.blockEvents.length && item == undefined) {
            const nextEvent = this.blockEvents[index]
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
}