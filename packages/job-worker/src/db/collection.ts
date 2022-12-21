import { ProtectedString, unprotectString } from '@sofie-automation/corelib/dist/protectedString'
import { EventEmitter } from 'eventemitter3'
import { AnyBulkWriteOperation, ChangeStream, Collection as MongoCollection, FindOptions } from 'mongodb'
import { IChangeStreamEvents } from '.'
import { startSpanManual } from '../profiler'
import { IChangeStream, ICollection, MongoModifier, MongoQuery } from './collections'

/** Wrap some APM and better error small query modifications around a Mongo.Collection */
class WrappedCollection<TDoc extends { _id: ProtectedString<any> }> implements ICollection<TDoc> {
	readonly #collection: MongoCollection<TDoc>

	/**
	 * We don't always want to allow using collection watchers, because of their lifetime and potential for blocking up workqueues.
	 * But we do want them (and the wrapped api) in cases where we are spawning background tasks that run by themselves.
	 */
	readonly #allowWatchers

	constructor(collection: MongoCollection<TDoc>, allowWatchers: boolean) {
		this.#collection = collection
		this.#allowWatchers = allowWatchers
	}

	get name(): string {
		return this.#collection.collectionName
	}

	get rawCollection(): MongoCollection<TDoc> {
		return this.#collection
	}

	async findFetch(selector: MongoQuery<TDoc>, options?: FindOptions<TDoc>): Promise<Array<TDoc>> {
		const span = startSpanManual('WrappedCollection.findFetch')
		if (span) {
			span.addLabels({
				collection: this.name,
				query: JSON.stringify(selector),
			})
		}
		const res = await this.#collection.find(selector as any, options).toArray()
		if (span) span.end()
		return res as any
	}

	async findOne(selector: MongoQuery<TDoc> | TDoc['_id'], options?: FindOptions<TDoc>): Promise<TDoc | undefined> {
		const span = startSpanManual('WrappedCollection.findOne')
		if (span) {
			span.addLabels({
				collection: this.name,
				query: JSON.stringify(selector),
			})
		}

		if (typeof selector === 'string') {
			selector = { _id: selector }
		}
		const res = await this.#collection.findOne(selector, options)
		if (span) span.end()
		return res ?? undefined
	}

	async insertOne(doc: TDoc): Promise<TDoc['_id']> {
		const span = startSpanManual('WrappedCollection.insertOne')
		if (span) {
			span.addLabels({
				collection: this.name,
				id: unprotectString(doc._id),
			})
		}

		const res = await this.#collection.insertOne(doc as any)
		if (span) span.end()
		return res.insertedId
	}

	// async insertMany(docs: Array<TDoc>): Promise<Array<TDoc['_id']>> {
	// 	const span = startSpanManual('WrappedCollection.insertMany')
	// 	if (span) {
	// 		span.addLabels({
	// 			collection: this.name,
	// 			ids: unprotectStringArray(docs.map((d) => d._id)).join(','),
	// 		})
	// 	}

	// 	const res = await this.#collection.insertMany(docs as any)
	// 	if (span) span.end()
	// 	return res.insertedIds
	// }

	async replace(doc: TDoc): Promise<boolean> {
		const span = startSpanManual('WrappedCollection.replace')
		if (span) {
			span.addLabels({
				collection: this.name,
				id: unprotectString(doc._id),
			})
		}

		const res = await this.#collection.replaceOne({ _id: doc._id }, doc, {
			upsert: true,
		})
		if (span) span.end()
		return res.matchedCount > 0
	}

	async update(
		selector: MongoQuery<TDoc> | TDoc['_id'],
		modifier: MongoModifier<TDoc>
		// options?: UpdateOptions
	): Promise<number> {
		const span = startSpanManual('WrappedCollection.update')
		if (span) {
			span.addLabels({
				collection: this.name,
				query: JSON.stringify(selector),
			})
		}

		if (typeof selector === 'string') {
			selector = { _id: selector }
		}

		const res = await this.#collection.updateMany(selector, modifier)
		if (span) span.end()
		return res.upsertedCount
	}

	async remove(selector: MongoQuery<TDoc> | TDoc['_id']): Promise<number> {
		const span = startSpanManual('WrappedCollection.remove')
		if (span) {
			span.addLabels({
				collection: this.name,
				query: JSON.stringify(selector),
			})
		}

		if (typeof selector === 'string') {
			selector = { _id: selector }
		}

		const res = await this.#collection.deleteMany(selector)
		if (span) span.end()
		return res.deletedCount
	}

	async bulkWrite(ops: Array<AnyBulkWriteOperation<TDoc>>): Promise<void> {
		const span = startSpanManual('WrappedCollection.bulkWrite')
		if (span) {
			span.addLabels({
				collection: this.name,
				opCount: ops.length,
			})
		}

		if (ops.length > 0) {
			const bulkWriteResult = await this.#collection.bulkWrite(ops, {
				ordered: false,
			})
			if (
				bulkWriteResult &&
				Array.isArray(bulkWriteResult.result?.writeErrors) &&
				bulkWriteResult.result.writeErrors.length
			) {
				throw new Error(`Errors in rawCollection.bulkWrite: ${bulkWriteResult.result.writeErrors.join(',')}`)
			}
		}

		if (span) span.end()
	}

	watch(pipeline: any[]): IChangeStream<TDoc> {
		if (!this.#allowWatchers) throw new Error(`Watching collections is not allowed here`)

		const rawStream = this.#collection.watch(pipeline, {
			batchSize: 1,
		})

		return new WrappedChangeStream(rawStream)
	}
}

class WrappedChangeStream<TDoc extends { _id: ProtectedString<any> }>
	extends EventEmitter<IChangeStreamEvents<TDoc>>
	implements IChangeStream<TDoc>
{
	readonly #stream: ChangeStream<TDoc>

	constructor(stream: ChangeStream<TDoc>) {
		super()

		this.#stream = stream

		// Forward events
		this.#stream.on('end', () => this.emit('end'))
		this.#stream.on('error', (e) => this.emit('error', e))
		this.#stream.on('change', (change) => this.emit('change', change))
	}

	get closed(): boolean {
		return this.#stream.closed
	}
	async close(): Promise<void> {
		await this.#stream.close()
	}
}

export function wrapMongoCollection<TDoc extends { _id: ProtectedString<any> }>(
	rawCollection: MongoCollection<TDoc>,
	allowWatchers: boolean
): ICollection<TDoc> {
	return new WrappedCollection(rawCollection, allowWatchers)
}
