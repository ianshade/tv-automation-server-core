import { Rundowns } from '../lib/collections/Rundowns'
import { PeripheralDeviceAPI } from '../lib/api/peripheralDevice'
import { PeripheralDevices, PeripheralDeviceType } from '../lib/collections/PeripheralDevices'
import * as _ from 'underscore'
import { getCurrentTime, stringifyError, waitForPromiseAll } from '../lib/lib'
import { logger } from './logging'
import { Meteor } from 'meteor/meteor'
import { IngestDataCache } from '../lib/collections/IngestDataCache'
import { TSR } from '@sofie-automation/blueprints-integration'
import { UserActionsLog } from '../lib/collections/UserActionsLog'
import { Snapshots } from '../lib/collections/Snapshots'
import { CASPARCG_RESTART_TIME } from '@sofie-automation/shared-lib/dist/core/constants'
import { getCoreSystem } from '../lib/collections/CoreSystem'
import { QueueStudioJob } from './worker/worker'
import { StudioJobs } from '@sofie-automation/corelib/dist/worker/studio'
import { fetchStudioIds } from '../lib/collections/optimizations'
import { RundownPlaylists } from '../lib/collections/RundownPlaylists'
import { internalStoreRundownPlaylistSnapshot } from './api/snapshot'
import { Parts } from '../lib/collections/Parts'
import { PartInstances } from '../lib/collections/PartInstances'
import { PieceInstances } from '../lib/collections/PieceInstances'
import { deferAsync } from '@sofie-automation/corelib/dist/lib'

const lowPrioFcn = (fcn: () => any) => {
	// Do it at a random time in the future:
	Meteor.setTimeout(() => {
		fcn()
	}, Math.random() * 10 * 1000)
}
/** Returns true if it is "low-season" (like during the night) when it is suitable to run cronjobs */
function isLowSeason() {
	const d = new Date(getCurrentTime())
	return (
		d.getHours() >= 4 && d.getHours() < 5 // It is nighttime
	)
}

let lastNightlyCronjob = 0
let failedRetries = 0

export function nightlyCronjobInner(): void {
	const previousLastNightlyCronjob = lastNightlyCronjob
	lastNightlyCronjob = getCurrentTime()
	logger.info('Nightly cronjob: starting...')
	const system = getCoreSystem()

	// Clean up Rundown data cache:
	// Remove caches not related to rundowns:
	let rundownCacheCount = 0
	const rundownIds = _.map(Rundowns.find().fetch(), (rundown) => rundown._id)
	IngestDataCache.find({
		rundownId: { $nin: rundownIds },
	}).forEach((roc) => {
		lowPrioFcn(() => {
			IngestDataCache.remove(roc._id)
		})
		rundownCacheCount++
	})
	if (rundownCacheCount) logger.info('Cronjob: Will remove cached data from ' + rundownCacheCount + ' rundowns')

	const cleanLimitTime = getCurrentTime() - 1000 * 3600 * 24 * 50 // 50 days ago

	// Remove old PartInstances and PieceInstances:
	const getPartInstanceIdsToRemove = () => {
		const existingPartIds = Parts.find({}, { fields: { _id: 1 } })
			.fetch()
			.map((part) => part._id)
		const oldPartInstanceSelector = {
			reset: true,
			'timings.takeOut': { $lt: cleanLimitTime },
			'part._id': { $nin: existingPartIds },
		}
		const oldPartInstanceIds = PartInstances.find(oldPartInstanceSelector, { fields: { _id: 1 } })
			.fetch()
			.map((partInstance) => partInstance._id)
		return oldPartInstanceIds
	}
	const partInstanceIdsToRemove = getPartInstanceIdsToRemove()
	if (partInstanceIdsToRemove.length > 0) {
		logger.info(`Cronjob: Will remove ${partInstanceIdsToRemove.length} PartInstances`)
	}
	const oldPieceInstances = PieceInstances.find({
		partInstanceId: { $in: partInstanceIdsToRemove },
	}).count()
	if (oldPieceInstances > 0) {
		logger.info(`Cronjob: Will remove ${oldPieceInstances} PieceInstances`)
	}
	lowPrioFcn(() => {
		const partInstanceIdsToRemove = getPartInstanceIdsToRemove()
		PartInstances.remove({ _id: { $in: partInstanceIdsToRemove } })
		PieceInstances.remove({
			partInstanceId: { $in: partInstanceIdsToRemove },
		})
	})

	// Remove old entries in UserActionsLog:
	const oldUserActionsLogCount: number = UserActionsLog.find({
		timestamp: { $lt: cleanLimitTime },
	}).count()
	if (oldUserActionsLogCount > 0) {
		logger.info(`Cronjob: Will remove ${oldUserActionsLogCount} entries from UserActionsLog`)
		lowPrioFcn(() => {
			UserActionsLog.remove({
				timestamp: { $lt: cleanLimitTime },
			})
		})
	}

	// Remove old entries in Snapshots:
	const oldSnapshotsCount: number = Snapshots.find({
		created: { $lt: cleanLimitTime },
	}).count()
	if (oldSnapshotsCount > 0) {
		logger.info(`Cronjob: Will remove ${oldSnapshotsCount} entries from Snapshots`)
		lowPrioFcn(() => {
			Snapshots.remove({
				created: { $lt: cleanLimitTime },
			})
		})
	}

	const ps: Array<Promise<any>> = []
	// Restart casparcg
	if (system?.cron?.casparCGRestart?.enabled) {
		PeripheralDevices.find({
			type: PeripheralDeviceType.PLAYOUT,
		}).forEach((device) => {
			PeripheralDevices.find({
				parentDeviceId: device._id,
			}).forEach((subDevice) => {
				if (subDevice.type === PeripheralDeviceType.PLAYOUT && subDevice.subType === TSR.DeviceType.CASPARCG) {
					logger.info('Cronjob: Trying to restart CasparCG on device "' + subDevice._id + '"')

					ps.push(
						PeripheralDeviceAPI.executeFunctionWithCustomTimeout(
							subDevice._id,
							CASPARCG_RESTART_TIME,
							'restartCasparCG'
						)
							.then(() => {
								logger.info('Cronjob: "' + subDevice._id + '": CasparCG restart done')
							})
							.catch((err) => {
								logger.error(
									`Cronjob: "${subDevice._id}": CasparCG restart error: ${stringifyError(err)}`
								)

								if ((err + '').match(/timeout/i)) {
									// If it was a timeout, maybe we could try again later?
									if (failedRetries < 5) {
										failedRetries++
										lastNightlyCronjob = previousLastNightlyCronjob // try again later
									}
								} else {
									// Propogate the error
									throw err
								}
							})
					)
				}
			})
		})
	}
	try {
		waitForPromiseAll(ps)
		failedRetries = 0
	} catch (err) {
		logger.error(err)
	}

	if (system?.cron?.storeRundownSnapshots?.enabled) {
		const filter = system.cron.storeRundownSnapshots.rundownNames?.length
			? { name: { $in: system.cron.storeRundownSnapshots.rundownNames } }
			: {}

		RundownPlaylists.find(filter).forEach((playlist) => {
			lowPrioFcn(() => {
				logger.info(`Cronjob: Will store snapshot for rundown playlist "${playlist._id}"`)
				ps.push(internalStoreRundownPlaylistSnapshot(playlist, 'Automatic, taken by cron job'))
			})
		})
	}
	Promise.all(ps)
		.then(() => {
			failedRetries = 0
		})
		.catch((err) => {
			logger.error(err)
		})

	// last:
	logger.info('Nightly cronjob: done')
}

Meteor.startup(() => {
	function nightlyCronjob() {
		const timeSinceLast = getCurrentTime() - lastNightlyCronjob
		if (
			isLowSeason() &&
			timeSinceLast > 20 * 3600 * 1000 // was last run yesterday
		) {
			nightlyCronjobInner()
		}
	}

	Meteor.setInterval(nightlyCronjob, 5 * 60 * 1000) // check every 5 minutes
	nightlyCronjob()

	function cleanupPlaylists(force?: boolean) {
		if (isLowSeason() || force) {
			deferAsync(
				async () => {
					// Ensure there are no empty playlists on an interval
					const studioIds = await fetchStudioIds({})
					await Promise.all(
						studioIds.map(async (studioId) => {
							const job = await QueueStudioJob(StudioJobs.CleanupEmptyPlaylists, studioId, undefined)
							await job.complete
						})
					)
				},
				(e) => {
					logger.error(`Cron: CleanupPlaylists error: ${e}`)
				}
			)
		}
	}
	Meteor.setInterval(cleanupPlaylists, 30 * 60 * 1000) // every 30 minutes
	cleanupPlaylists(true)
})
