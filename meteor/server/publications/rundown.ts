import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { meteorPublish, AutoFillSelector } from './lib'
import { PubSub } from '../../lib/api/pubsub'
import { MongoQuery, FindOptions } from '../../lib/typings/meteor'
import { AdLibPiece, AdLibPieces } from '../../lib/collections/AdLibPieces'
import { RundownReadAccess } from '../security/rundown'
import { Rundowns, DBRundown } from '../../lib/collections/Rundowns'
import { DBSegment, Segments } from '../../lib/collections/Segments'
import { DBPart, Parts } from '../../lib/collections/Parts'
import { Piece, Pieces } from '../../lib/collections/Pieces'
import { PieceInstance, PieceInstances } from '../../lib/collections/PieceInstances'
import { PartInstances, DBPartInstance } from '../../lib/collections/PartInstances'
import { ExpectedMediaItems } from '../../lib/collections/ExpectedMediaItems'
import { ExpectedPlayoutItems } from '../../lib/collections/ExpectedPlayoutItems'
import { IngestDataCache, IngestDataCacheObj } from '../../lib/collections/IngestDataCache'
import { RundownBaselineAdLibItem, RundownBaselineAdLibPieces } from '../../lib/collections/RundownBaselineAdLibPieces'
import { NoSecurityReadAccess } from '../security/noSecurity'
import { OrganizationReadAccess } from '../security/organization'
import { StudioReadAccess } from '../security/studio'
import { AdLibAction, AdLibActions } from '../../lib/collections/AdLibActions'
import {
	RundownBaselineAdLibAction,
	RundownBaselineAdLibActions,
} from '../../lib/collections/RundownBaselineAdLibActions'
import { check, Match } from 'meteor/check'

meteorPublish(PubSub.rundownsForDevice, async function (deviceId, token) {
	check(deviceId, String)
	check(token, String)

	const { cred, selector } = await AutoFillSelector.organizationId<DBRundown>(this.userId, {}, token)

	// Future: this should be reactive to studioId changes, but this matches how the other *ForDevice publications behave

	if (!cred || !cred.device)
		throw new Meteor.Error(403, 'Publication can only be used by authorized PeripheralDevices')

	// No studio, then no rundowns
	if (!cred.device.studioId) return null

	selector.studioId = cred.device.studioId

	const modifier: FindOptions<DBRundown> = {
		fields: {
			metaData: 0,
		},
	}

	if (NoSecurityReadAccess.any() || (await StudioReadAccess.studioContent(selector.studioId, cred))) {
		return Rundowns.find(selector, modifier)
	}
	return null
})

meteorPublish(PubSub.rundowns, async function (playlistIds, showStyleBaseIds, token) {
	check(playlistIds, Match.Maybe(Array))
	check(showStyleBaseIds, Match.Maybe(Array))

	if (!playlistIds && !showStyleBaseIds)
		throw new Meteor.Error(400, 'One of playlistIds and showStyleBaseIds must be provided')

	// If values were provided, they must have values
	if (playlistIds && playlistIds.length === 0) return null
	if (showStyleBaseIds && showStyleBaseIds.length === 0) return null

	const { cred, selector } = await AutoFillSelector.organizationId<DBRundown>(this.userId, {}, token)

	// Add the requested filter
	if (playlistIds) selector.playlistId = { $in: playlistIds }
	if (showStyleBaseIds) selector.showStyleBaseId = { $in: showStyleBaseIds }

	const modifier: FindOptions<DBRundown> = {
		fields: {
			metaData: 0,
		},
	}

	if (
		!cred ||
		NoSecurityReadAccess.any() ||
		(selector.organizationId &&
			(await OrganizationReadAccess.organizationContent(selector.organizationId, cred))) ||
		(selector.studioId && (await StudioReadAccess.studioContent(selector.studioId, cred))) ||
		(selector._id && (await RundownReadAccess.rundown(selector._id, cred)))
	) {
		return Rundowns.find(selector, modifier)
	}
	return null
})
meteorPublish(PubSub.segments, async function (selector, token) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	const modifier: FindOptions<DBSegment> = {
		fields: {
			metaData: 0,
		},
	}
	if (
		NoSecurityReadAccess.any() ||
		(selector.rundownId &&
			(await RundownReadAccess.rundownContent(selector.rundownId, { userId: this.userId, token }))) ||
		(selector._id && (await RundownReadAccess.segments(selector._id, { userId: this.userId, token })))
	) {
		return Segments.find(selector, modifier)
	}
	return null
})

meteorPublish(PubSub.parts, async function (rundownIds, token) {
	check(rundownIds, Array)

	if (rundownIds.length === 0) return null

	const modifier: FindOptions<DBPart> = {
		fields: {
			metaData: 0,
		},
	}

	const selector: MongoQuery<DBPart> = {
		rundownId: { $in: rundownIds },
		reset: { $ne: true },
	}

	if (
		NoSecurityReadAccess.any() ||
		(selector.rundownId &&
			(await RundownReadAccess.rundownContent(selector.rundownId, { userId: this.userId, token }))) // ||
		// (selector._id && await RundownReadAccess.pieces(selector._id, { userId: this.userId, token })) // TODO - the types for this did not match
	) {
		return Parts.find(selector, modifier)
	}
	return null
})
meteorPublish(PubSub.partInstances, async function (rundownIds, playlistActivationId, token?: string) {
	check(rundownIds, Array)
	check(playlistActivationId, Match.Maybe(String))

	if (rundownIds.length === 0 || !playlistActivationId) return null

	const modifier: FindOptions<DBPartInstance> = {
		fields: {
			// @ts-expect-error Mongo typings aren't clever enough yet
			'part.metaData': 0,
		},
	}

	const selector: MongoQuery<DBPartInstance> = {
		rundownId: { $in: rundownIds },
		playlistActivationId: playlistActivationId,
		reset: { $ne: true },
	}

	if (
		NoSecurityReadAccess.any() ||
		(await RundownReadAccess.rundownContent(selector.rundownId, { userId: this.userId, token }))
	) {
		return PartInstances.find(selector, modifier)
	}
	return null
})
meteorPublish(PubSub.partInstancesSimple, async function (selector, token) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	const modifier: FindOptions<DBPartInstance> = {
		fields: {
			// @ts-expect-error Mongo typings aren't clever enough yet
			'part.metaData': 0,
			isTaken: 0,
			timings: 0,
		},
	}

	// Enforce only not-reset
	selector.reset = { $ne: true }

	if (
		NoSecurityReadAccess.any() ||
		(await RundownReadAccess.rundownContent(selector.rundownId, { userId: this.userId, token }))
	) {
		return PartInstances.find(selector, modifier)
	}
	return null
})
meteorPublish(PubSub.partInstancesForSegmentPlayout, async function (selector, token) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	const modifier: FindOptions<DBPartInstance> = {
		fields: {
			// @ts-expect-error Mongo typings aren't clever enough yet
			'part.metaData': 0,
		},
		sort: {
			takeCount: 1,
		},
		limit: 1,
	}

	if (
		NoSecurityReadAccess.any() ||
		(selector.segmentPlayoutId &&
			(await RundownReadAccess.rundownContent(selector.rundownId, { userId: this.userId, token })))
	) {
		return PartInstances.find(selector, modifier)
	}
	return null
})

meteorPublish(PubSub.pieces, async function (selector: MongoQuery<Piece>, token?: string) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	const modifier: FindOptions<Piece> = {
		fields: {
			metaData: 0,
			timelineObjectsString: 0,
		},
	}
	if (
		NoSecurityReadAccess.any() ||
		(await RundownReadAccess.rundownContent(selector.startRundownId, { userId: this.userId, token }))
	) {
		return Pieces.find(selector, modifier)
	}
	return null
})

meteorPublish(PubSub.adLibPieces, async function (selector, token) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	const modifier: FindOptions<AdLibPiece> = {
		fields: {
			metaData: 0,
			timelineObjectsString: 0,
		},
	}
	if (
		NoSecurityReadAccess.any() ||
		(await RundownReadAccess.rundownContent(selector.rundownId, { userId: this.userId, token }))
	) {
		return AdLibPieces.find(selector, modifier)
	}
	return null
})
meteorPublish(PubSub.pieceInstances, async function (selector, token) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	const modifier: FindOptions<PieceInstance> = {
		fields: {
			// @ts-expect-error Mongo typings aren't clever enough yet
			'piece.metaData': 0,
			'piece.timelineObjectsString': 0,
		},
	}

	// Enforce only not-reset
	selector.reset = { $ne: true }

	if (
		NoSecurityReadAccess.any() ||
		(await RundownReadAccess.rundownContent(selector.rundownId, { userId: this.userId, token }))
	) {
		return PieceInstances.find(selector, modifier)
	}
	return null
})

meteorPublish(PubSub.pieceInstancesSimple, async function (selector, token) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	const modifier: FindOptions<PieceInstance> = {
		fields: {
			// @ts-expect-error Mongo typings aren't clever enough yet
			'piece.metaData': 0,
			'piece.timelineObjectsString': 0,
			startedPlayback: 0,
			stoppedPlayback: 0,
		},
	}

	// Enforce only not-reset
	selector.reset = { $ne: true }

	if (
		NoSecurityReadAccess.any() ||
		(await RundownReadAccess.rundownContent(selector.rundownId, { userId: this.userId, token }))
	) {
		return PieceInstances.find(selector, modifier)
	}
	return null
})
meteorPublish(PubSub.expectedMediaItems, async function (selector, token) {
	const allowed =
		NoSecurityReadAccess.any() ||
		(await RundownReadAccess.expectedMediaItems(selector, { userId: this.userId, token }))
	if (!allowed) {
		return null
	} else if (allowed === true) {
		return ExpectedMediaItems.find(selector)
	} else if (typeof allowed === 'object') {
		return ExpectedMediaItems.find(
			_.extend(selector, {
				studioId: allowed.studioId,
			})
		)
	}
	return null
})
meteorPublish(PubSub.expectedPlayoutItems, async function (selector, token) {
	const allowed =
		NoSecurityReadAccess.any() ||
		(await RundownReadAccess.expectedPlayoutItems(selector, { userId: this.userId, token }))
	if (!allowed) {
		return null
	} else if (allowed === true) {
		return ExpectedPlayoutItems.find(selector)
	} else if (typeof allowed === 'object') {
		return ExpectedPlayoutItems.find(
			_.extend(selector, {
				studioId: allowed.studioId,
			})
		)
	}
	return null
})
// Note: this publication is for dev purposes only:
meteorPublish(PubSub.ingestDataCache, async function (selector, token) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	const modifier: FindOptions<IngestDataCacheObj> = {
		fields: {},
	}
	if (
		NoSecurityReadAccess.any() ||
		(await RundownReadAccess.rundownContent(selector.rundownId, { userId: this.userId, token }))
	) {
		return IngestDataCache.find(selector, modifier)
	}
	return null
})
meteorPublish(
	PubSub.rundownBaselineAdLibPieces,
	async function (selector: MongoQuery<RundownBaselineAdLibItem>, token?: string) {
		if (!selector) throw new Meteor.Error(400, 'selector argument missing')
		const modifier: FindOptions<RundownBaselineAdLibItem> = {
			fields: {
				timelineObjectsString: 0,
			},
		}
		if (
			NoSecurityReadAccess.any() ||
			(await RundownReadAccess.rundownContent(selector.rundownId, { userId: this.userId, token }))
		) {
			return RundownBaselineAdLibPieces.find(selector, modifier)
		}
		return null
	}
)
meteorPublish(PubSub.adLibActions, async function (selector, token) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	const modifier: FindOptions<AdLibAction> = {
		fields: {},
	}
	if (
		NoSecurityReadAccess.any() ||
		(await RundownReadAccess.rundownContent(selector.rundownId, { userId: this.userId, token }))
	) {
		return AdLibActions.find(selector, modifier)
	}
	return null
})
meteorPublish(PubSub.rundownBaselineAdLibActions, async function (selector, token) {
	if (!selector) throw new Meteor.Error(400, 'selector argument missing')
	const modifier: FindOptions<RundownBaselineAdLibAction> = {
		fields: {},
	}
	if (
		NoSecurityReadAccess.any() ||
		(await RundownReadAccess.rundownContent(selector.rundownId, { userId: this.userId, token }))
	) {
		return RundownBaselineAdLibActions.find(selector, modifier)
	}
	return null
})
