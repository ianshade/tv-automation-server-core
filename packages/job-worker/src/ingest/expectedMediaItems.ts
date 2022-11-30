import {
	ExpectedMediaItem,
	ExpectedMediaItemBase,
	ExpectedMediaItemBucketAction,
	ExpectedMediaItemBucketPiece,
	ExpectedMediaItemRundown,
} from '@sofie-automation/corelib/dist/dataModel/ExpectedMediaItem'
import {
	AdLibActionId,
	ExpectedMediaItemId,
	PieceId,
	RundownId,
	StudioId,
} from '@sofie-automation/corelib/dist/dataModel/Ids'
import { ProtectedString, protectString } from '@sofie-automation/corelib/dist/protectedString'
import { getHash, Subtract } from '@sofie-automation/corelib/dist/lib'
import {
	IBlueprintActionManifestDisplayContent,
	SomeContent,
	VTContent,
} from '@sofie-automation/blueprints-integration'
import { getCurrentTime } from '../lib'
import { AdLibAction } from '@sofie-automation/corelib/dist/dataModel/AdlibAction'
import { AdLibPiece } from '@sofie-automation/corelib/dist/dataModel/AdLibPiece'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { saveIntoCache } from '../cache/lib'
import { CacheForIngest } from './cache'
import { JobContext } from '../jobs'
import { logger } from '../logging'
import { saveIntoDb } from '../db/changes'
import { BucketAdLibAction } from '@sofie-automation/corelib/dist/dataModel/BucketAdLibAction'
import { BucketAdLib } from '@sofie-automation/corelib/dist/dataModel/BucketAdLibPiece'
import { interpollateTranslation, translateMessage } from '@sofie-automation/corelib/dist/TranslatableMessage'
import { RundownBaselineAdLibAction } from '@sofie-automation/corelib/dist/dataModel/RundownBaselineAdLibAction'

export enum PieceType {
	PIECE = 'piece',
	ADLIB = 'adlib',
	ACTION = 'action',
}

// TODO-PartInstance generate these for when the part has no need, but the instance still references something

function generateExpectedMediaItems<T extends ExpectedMediaItemBase>(
	sourceId: ProtectedString<any>,
	commonProps: Subtract<T, ExpectedMediaItemBase>,
	studioId: StudioId,
	label: string,
	content: Partial<SomeContent> | undefined,
	pieceType: string
): T[] {
	const result: T[] = []

	const pieceContent = content as Partial<VTContent> | undefined
	if (pieceContent && pieceContent.fileName && pieceContent.path && pieceContent.mediaFlowIds) {
		for (const flow of pieceContent.mediaFlowIds) {
			const id = protectString<ExpectedMediaItemId>(
				getHash(pieceType + '_' + sourceId + '_' + JSON.stringify(commonProps) + '_' + flow)
			)
			const baseObj: ExpectedMediaItemBase = {
				_id: id,
				studioId: studioId,
				label: label,
				disabled: false,
				lastSeen: getCurrentTime(),
				mediaFlowId: flow,
				path: pieceContent.fileName,
				url: pieceContent.path,
			}
			result.push({
				...commonProps,
				...baseObj,
			} as T)
		}
	}

	return result
}

function generateExpectedMediaItemsFull(
	studioId: StudioId,
	rundownId: RundownId,
	pieces: Piece[],
	adlibs: AdLibPiece[],
	actions: (AdLibAction | RundownBaselineAdLibAction)[]
): ExpectedMediaItem[] {
	const eMIs: ExpectedMediaItem[] = []

	pieces.forEach((doc) =>
		eMIs.push(
			...generateExpectedMediaItems<ExpectedMediaItemRundown>(
				doc._id,
				{
					partId: doc.startPartId,
					rundownId: doc.startRundownId,
				},
				studioId,
				doc.name,
				doc.content,
				PieceType.PIECE
			)
		)
	)
	adlibs.forEach((doc) =>
		eMIs.push(
			...generateExpectedMediaItems<ExpectedMediaItemRundown>(
				doc._id,
				{
					partId: doc.partId,
					rundownId: rundownId,
				},
				studioId,
				doc.name,
				doc.content,
				PieceType.ADLIB
			)
		)
	)
	actions.forEach((doc) =>
		eMIs.push(
			...generateExpectedMediaItems<ExpectedMediaItemRundown>(
				doc._id,
				{
					partId: doc.partId,
					rundownId: rundownId,
				},
				studioId,
				translateMessage(doc.display.label, interpollateTranslation),
				(doc.display as IBlueprintActionManifestDisplayContent | undefined)?.content,
				PieceType.ACTION
			)
		)
	)

	return eMIs
}

export async function cleanUpExpectedMediaItemForBucketAdLibPiece(
	context: JobContext,
	adLibIds: PieceId[]
): Promise<void> {
	if (adLibIds.length > 0) {
		const removedItems = await context.directCollections.ExpectedMediaItems.remove({
			bucketAdLibPieceId: {
				$in: adLibIds,
			},
		})

		logger.info(`Removed ${removedItems} expected media items for deleted bucket adLib items`)
	}
}

export async function cleanUpExpectedMediaItemForBucketAdLibActions(
	context: JobContext,
	actionIds: AdLibActionId[]
): Promise<void> {
	if (actionIds.length > 0) {
		const removedItems = await context.directCollections.ExpectedMediaItems.remove({
			bucketAdLibActionId: {
				$in: actionIds,
			},
		})

		logger.info(`Removed ${removedItems} expected media items for deleted bucket adLib actions`)
	}
}

export async function updateExpectedMediaItemForBucketAdLibPiece(
	context: JobContext,
	piece: BucketAdLib
): Promise<void> {
	const result = generateExpectedMediaItems<ExpectedMediaItemBucketPiece>(
		piece._id,
		{
			bucketId: piece.bucketId,
			bucketAdLibPieceId: piece._id,
		},
		piece.studioId,
		piece.name,
		piece.content,
		PieceType.ADLIB
	)

	await saveIntoDb(
		context,
		context.directCollections.ExpectedMediaItems,
		{
			bucketAdLibPieceId: piece._id,
		},
		result
	)
}

export async function updateExpectedMediaItemForBucketAdLibAction(
	context: JobContext,
	action: BucketAdLibAction
): Promise<void> {
	const result = generateExpectedMediaItems<ExpectedMediaItemBucketAction>(
		action._id,
		{
			bucketId: action.bucketId,
			bucketAdLibActionId: action._id,
		},
		action.studioId,
		translateMessage(action.display.label, interpollateTranslation),
		(action.display as IBlueprintActionManifestDisplayContent | undefined)?.content,
		PieceType.ADLIB
	)

	await saveIntoDb(
		context,
		context.directCollections.ExpectedMediaItems,
		{
			bucketAdLibActionId: action._id,
		},
		result
	)
}

/** @deprecated */
export async function updateExpectedMediaItemsOnRundown(context: JobContext, cache: CacheForIngest): Promise<void> {
	const pieces = cache.Pieces.findFetch({})
	const adlibs = cache.AdLibPieces.findFetch({})
	const actions: (AdLibAction | RundownBaselineAdLibAction)[] = cache.AdLibActions.findFetch({})

	const [baselineAdlibPieces, baselineAdlibActions] = await Promise.all([
		cache.RundownBaselineAdLibPieces.get(),
		cache.RundownBaselineAdLibActions.get(),
	])

	adlibs.push(...baselineAdlibPieces.findFetch({}))
	actions.push(...baselineAdlibActions.findFetch({}))

	const expectedMediaItems = generateExpectedMediaItemsFull(
		context.studio._id,
		cache.RundownId,
		pieces,
		adlibs,
		actions
	)
	saveIntoCache<ExpectedMediaItem>(context, cache.ExpectedMediaItems, {}, expectedMediaItems)
}
