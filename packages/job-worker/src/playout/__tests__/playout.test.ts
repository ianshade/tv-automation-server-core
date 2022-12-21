import {
	PeripheralDevice,
	PeripheralDeviceCategory,
	PeripheralDeviceType,
	PERIPHERAL_SUBTYPE_PROCESS,
} from '@sofie-automation/corelib/dist/dataModel/PeripheralDevice'
import { DBRundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'
import {
	setupDefaultRundownPlaylist,
	setupMockPeripheralDevice,
	setupMockShowStyleCompound,
} from '../../__mocks__/presetCollections'
import { MockJobContext, setupDefaultJobEnvironment } from '../../__mocks__/context'
import { PartInstanceId, RundownId, RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { fixSnapshot } from '../../__mocks__/helpers/snapshot'
import { sortPartsInSortedSegments, sortSegmentsInRundowns } from '@sofie-automation/corelib/dist/playout/playlist'
import {
	activateRundownPlaylist,
	deactivateRundownPlaylist,
	moveNextPart,
	onPlayoutPlaybackChanged,
	prepareRundownPlaylistForBroadcast,
	resetRundownPlaylist,
	setMinimumTakeSpan,
	setNextPart,
	takeNextPart,
} from '../playout'
import { getSelectedPartInstances } from './lib'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { MockMongoCollection } from '../../__mocks__/collection'
import { TimelineComplete } from '@sofie-automation/corelib/dist/dataModel/Timeline'
import { UserErrorMessage } from '@sofie-automation/corelib/dist/error'
import * as peripheralDeviceLib from '../../peripheralDevice'
import { sleep } from '@sofie-automation/corelib/dist/lib'
import { protectString, unprotectString } from '@sofie-automation/corelib/dist/protectedString'
import { AdLibPiece } from '@sofie-automation/corelib/dist/dataModel/AdLibPiece'
import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { EmptyPieceTimelineObjectsBlob, Piece, PieceStatusCode } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { RundownBaselineAdLibItem } from '@sofie-automation/corelib/dist/dataModel/RundownBaselineAdLibPiece'
import { DBSegment } from '@sofie-automation/corelib/dist/dataModel/Segment'
import {
	defaultRundownPlaylist,
	defaultRundown,
	defaultSegment,
	defaultPart,
	defaultPiece,
	defaultAdLibPiece,
} from '../../__mocks__/defaultCollectionObjects'
import { ShowStyleCompound } from '@sofie-automation/corelib/dist/dataModel/ShowStyleCompound'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { ReadonlyDeep } from 'type-fest'
import { adjustFakeTime, getCurrentTime, useFakeCurrentTime } from '../../__mocks__/time'
import { PieceLifespan } from '@sofie-automation/blueprints-integration'
import { PlayoutChangedType } from '@sofie-automation/shared-lib/dist/peripheralDevice/peripheralDeviceAPI'
import { adLibPieceStart } from '../adlib'

// const mockGetCurrentTime = jest.spyOn(lib, 'getCurrentTime')
const mockExecutePeripheralDeviceFunction = jest
	.spyOn(peripheralDeviceLib, 'executePeripheralDeviceFunction')
	.mockImplementation(async () => sleep(10))

describe('Playout API', () => {
	let context: MockJobContext
	let showStyle: ReadonlyDeep<ShowStyleCompound>
	let playoutDevice: PeripheralDevice
	// const origGetCurrentTime = lib.getCurrentTime

	async function getAllRundownData(rundown: DBRundown) {
		const segments = await context.directCollections.Segments.findFetch({ rundownId: rundown._id })
		const parts = await context.directCollections.Parts.findFetch({ rundownId: rundown._id })
		const sortedSegments = sortSegmentsInRundowns(segments, { rundownIdsInOrder: [rundown._id] })
		return {
			parts: sortPartsInSortedSegments(parts, sortedSegments),
			segments: sortedSegments,
			rundown: (await context.directCollections.Rundowns.findOne(rundown._id)) as DBRundown,
			pieces: await context.directCollections.Pieces.findFetch(
				{ startRundownId: rundown._id },
				{ sort: { _id: 1 } }
			),
			adLibPieces: await context.directCollections.AdLibPieces.findFetch(
				{ rundownId: rundown._id },
				{ sort: { _id: 1 } }
			),
		}
	}
	async function getAllParts(rundownId: RundownId) {
		return context.directCollections.Parts.findFetch({ rundownId })
	}
	async function getAllPartInstances() {
		return context.directCollections.PartInstances.findFetch()
	}
	async function getAllPieceInstances() {
		return context.directCollections.PieceInstances.findFetch()
	}
	async function getAllPieceInstancesForPartInstance(partInstanceId: PartInstanceId) {
		return context.directCollections.PieceInstances.findFetch({
			partInstanceId: partInstanceId,
		})
	}
	// let Timeline = mockupCollection(OrgTimeline)
	// beforeAll(() => {
	// 	Timeline = mockupCollection(OrgTimeline)
	// })
	beforeEach(async () => {
		context = setupDefaultJobEnvironment()

		// Ignore event jobs
		jest.spyOn(context, 'queueEventJob').mockImplementation(async () => Promise.resolve())

		showStyle = await setupMockShowStyleCompound(context)

		playoutDevice = await setupMockPeripheralDevice(
			context,
			PeripheralDeviceCategory.PLAYOUT,
			PeripheralDeviceType.PLAYOUT,
			PERIPHERAL_SUBTYPE_PROCESS
		)

		jest.clearAllMocks()

		setMinimumTakeSpan(0)
	})
	afterEach(() => {
		// mockGetCurrentTime.mockClear()
		mockExecutePeripheralDeviceFunction.mockClear()
	})
	test('Basic rundown control', async () => {
		const Timeline = context.directCollections.Timelines as MockMongoCollection<TimelineComplete>

		const { rundownId: rundownId0, playlistId: playlistId0 } = await setupDefaultRundownPlaylist(context)
		expect(rundownId0).toBeTruthy()
		expect(playlistId0).toBeTruthy()

		const getRundown0 = async () => {
			return (await context.directCollections.Rundowns.findOne(rundownId0)) as DBRundown
		}
		const getPlaylist0 = async () => {
			const playlist = (await context.directCollections.RundownPlaylists.findOne(
				playlistId0
			)) as DBRundownPlaylist
			playlist.activationId = playlist.activationId ?? undefined
			return playlist
		}

		await expect(getPlaylist0()).resolves.toMatchObject({
			activationId: undefined,
			rehearsal: false,
		})

		expect(Timeline.operations).toHaveLength(0)

		await resetRundownPlaylist(context, { playlistId: playlistId0 })

		expect(Timeline.operations).toMatchObject([{ args: ['mockStudio0', undefined], type: 'findOne' }])
		Timeline.clearOpLog()

		const orgRundownData = await getAllRundownData(await getRundown0())

		{
			// Prepare and activate:
			await activateRundownPlaylist(context, { playlistId: playlistId0, rehearsal: false })

			const { currentPartInstance, nextPartInstance } = await getSelectedPartInstances(
				context,
				await getPlaylist0()
			)
			expect(currentPartInstance).toBeFalsy()
			expect(nextPartInstance).toBeTruthy()
			expect(nextPartInstance?.part._id).toEqual(orgRundownData.parts[0]._id)

			await expect(getPlaylist0()).resolves.toMatchObject({
				activationId: expect.stringMatching(/^randomId/),
				rehearsal: false,
				currentPartInstanceId: null,
				// nextPartInstanceId: parts[0]._id,
			})
		}

		expect(Timeline.operations).toMatchObject([
			{ args: ['mockStudio0', undefined], type: 'findOne' },
			{ args: ['mockStudio0'], type: 'replace' },
		])
		Timeline.clearOpLog()

		{
			// Take the first Part:
			await takeNextPart(context, { playlistId: playlistId0, fromPartInstanceId: null })

			const { currentPartInstance, nextPartInstance } = await getSelectedPartInstances(
				context,
				await getPlaylist0()
			)
			expect(currentPartInstance).toBeTruthy()
			expect(nextPartInstance).toBeTruthy()
			expect(currentPartInstance?.part._id).toEqual(orgRundownData.parts[0]._id)
			expect(nextPartInstance?.part._id).toEqual(orgRundownData.parts[1]._id)
		}

		expect(Timeline.operations).toMatchObject([
			{ args: ['mockStudio0', undefined], type: 'findOne' },
			{ args: ['mockStudio0'], type: 'replace' },
		])
		Timeline.clearOpLog()

		expect(fixSnapshot(await Timeline.findFetch())).toMatchSnapshot()
		expect(fixSnapshot(await getRundown0())).toMatchSnapshot()

		await expect(resetRundownPlaylist(context, { playlistId: playlistId0 })).rejects.toMatchUserError(
			UserErrorMessage.RundownResetWhileActive
		)

		Timeline.clearOpLog()

		// Deactivate rundown:
		await deactivateRundownPlaylist(context, { playlistId: playlistId0 })
		await expect(getPlaylist0()).resolves.toMatchObject({
			activationId: undefined,
			currentPartInstanceId: null,
			nextPartInstanceId: null,
		})

		expect(Timeline.operations).toMatchObject([
			{ args: ['mockStudio0', undefined], type: 'findOne' },
			{ args: ['mockStudio0'], type: 'replace' },
		])
		Timeline.clearOpLog()

		expect(fixSnapshot(await Timeline.findFetch())).toMatchSnapshot()
		expect(fixSnapshot(await getPlaylist0())).toMatchSnapshot()
		expect(fixSnapshot(await getRundown0())).toMatchSnapshot()

		// lastly: reset rundown
		await resetRundownPlaylist(context, { playlistId: playlistId0 })

		// Verify that the data is back to as it was before any of the operations:
		const rundownData = await getAllRundownData(await getRundown0())
		expect(rundownData).toEqual(orgRundownData)
	})
	test('prepareRundownPlaylistForBroadcast', async () => {
		const { rundownId: rundownId0, playlistId: playlistId0 } = await setupDefaultRundownPlaylist(context)
		expect(rundownId0).toBeTruthy()
		expect(playlistId0).toBeTruthy()

		const getPlaylist0 = async () => {
			const playlist = (await context.directCollections.RundownPlaylists.findOne(
				playlistId0
			)) as DBRundownPlaylist
			playlist.activationId = playlist.activationId ?? undefined
			return playlist
		}

		await expect(getPlaylist0()).resolves.toMatchObject({
			activationId: undefined,
			rehearsal: false,
		})

		expect(mockExecutePeripheralDeviceFunction).not.toHaveBeenCalled()
		// await expect(getPeripheralDeviceCommands(playoutDevice)).resolves.toHaveLength(0)

		// Prepare and activate in rehersal:
		await prepareRundownPlaylistForBroadcast(context, { playlistId: playlistId0 })

		await expect(getPlaylist0()).resolves.toMatchObject({
			activationId: expect.stringMatching(/^randomId/),
			rehearsal: true,
		})

		expect(mockExecutePeripheralDeviceFunction).toHaveBeenCalledTimes(1)
		expect(mockExecutePeripheralDeviceFunction).toHaveBeenNthCalledWith(
			1,
			context,
			playoutDevice._id,
			null,
			'devicesMakeReady',
			true,
			playlistId0
		)

		await expect(prepareRundownPlaylistForBroadcast(context, { playlistId: playlistId0 })).rejects.toMatchUserError(
			UserErrorMessage.RundownAlreadyActive
		)

		const { playlistId: playlistId1 } = await setupDefaultRundownPlaylist(context)
		await expect(prepareRundownPlaylistForBroadcast(context, { playlistId: playlistId1 })).rejects.toMatchUserError(
			UserErrorMessage.RundownAlreadyActiveNames
		)
	})
	test('resetAndActivateRundownPlaylist, forceResetAndActivateRundownPlaylist & deactivateRundownPlaylist', async () => {
		const { rundownId: rundownId0, playlistId: playlistId0 } = await setupDefaultRundownPlaylist(context)
		const { rundownId: rundownId1, playlistId: playlistId1 } = await setupDefaultRundownPlaylist(context)
		expect(rundownId0).toBeTruthy()
		expect(playlistId0).toBeTruthy()
		expect(rundownId1).toBeTruthy()
		expect(playlistId1).toBeTruthy()

		// const getRundown0 = () => {
		// 	return Rundowns.findOne(rundownId0) as Rundown
		// }
		const getPlaylist0 = async () => {
			const playlist = (await context.directCollections.RundownPlaylists.findOne(
				playlistId0
			)) as DBRundownPlaylist
			playlist.activationId = playlist.activationId ?? undefined
			return playlist
		}
		// const getRundown1 = () => {
		// 	return Rundowns.findOne(rundownId1) as Rundown
		// }
		const getPlaylist1 = async () => {
			const playlist = (await context.directCollections.RundownPlaylists.findOne(
				playlistId1
			)) as DBRundownPlaylist
			playlist.activationId = playlist.activationId ?? undefined
			return playlist
		}

		await expect(getPlaylist0()).resolves.toMatchObject({
			activationId: undefined,
			rehearsal: false,
		})
		await expect(getPlaylist1()).resolves.toMatchObject({
			activationId: undefined,
			rehearsal: false,
		})

		expect(mockExecutePeripheralDeviceFunction).not.toHaveBeenCalled()

		// Prepare and activate in rehersal:
		await resetRundownPlaylist(context, { playlistId: playlistId0, activate: 'rehearsal' })

		await expect(getPlaylist0()).resolves.toMatchObject({
			activationId: expect.stringMatching(/^randomId/),
			rehearsal: true,
		})
		await expect(getPlaylist1()).resolves.toMatchObject({
			activationId: undefined,
		})

		expect(mockExecutePeripheralDeviceFunction).toHaveBeenCalledTimes(1)
		expect(mockExecutePeripheralDeviceFunction).toHaveBeenNthCalledWith(
			1,
			context,
			playoutDevice._id,
			null,
			'devicesMakeReady',
			true,
			playlistId0
		)
		mockExecutePeripheralDeviceFunction.mockClear()

		{
			// Take the first Part:
			await takeNextPart(context, { playlistId: playlistId0, fromPartInstanceId: null })

			const { currentPartInstance, nextPartInstance } = await getSelectedPartInstances(
				context,
				await getPlaylist0()
			)
			expect(currentPartInstance).toBeTruthy()
			expect(nextPartInstance).toBeTruthy()
		}

		await resetRundownPlaylist(context, { playlistId: playlistId1, activate: 'rehearsal', forceActivate: true })
		await expect(getPlaylist0()).resolves.toMatchObject({
			activationId: undefined,
		})
		await expect(getPlaylist1()).resolves.toMatchObject({
			activationId: expect.stringMatching(/^randomId/),
			rehearsal: true,
		})

		expect(mockExecutePeripheralDeviceFunction).toHaveBeenCalledTimes(1)
		expect(mockExecutePeripheralDeviceFunction).toHaveBeenNthCalledWith(
			1,
			context,
			playoutDevice._id,
			null,
			'devicesMakeReady',
			true,
			playlistId1
		)
		mockExecutePeripheralDeviceFunction.mockClear()

		// Attempt to take the first Part of inactive playlist0, should throw
		await expect(
			takeNextPart(context, { playlistId: playlistId0, fromPartInstanceId: null })
		).rejects.toMatchUserError(UserErrorMessage.InactiveRundown)

		// Take the first Part of active playlist1:
		await takeNextPart(context, { playlistId: playlistId1, fromPartInstanceId: null })

		expect(
			(await getAllPartInstances()).filter(
				(partInstance) => partInstance.rundownId === rundownId1 && !!partInstance.isTaken && !partInstance.reset
			)
		).toHaveLength(1)
		expect(
			(await getAllPartInstances()).filter(
				(partInstance) => partInstance.rundownId === rundownId1 && !partInstance.isTaken && !partInstance.reset
			)
		).toHaveLength(1)

		await resetRundownPlaylist(context, { playlistId: playlistId1, activate: 'rehearsal' })

		// Take the first Part of active playlist1 again:
		await takeNextPart(context, { playlistId: playlistId1, fromPartInstanceId: null })

		// still should only contain a single taken instance, as rehearsal partInstances should be removed
		expect(
			(await getAllPartInstances()).filter(
				(partInstance) => partInstance.rundownId === rundownId1 && !!partInstance.isTaken && !partInstance.reset
			)
		).toHaveLength(1)
		expect(
			(await getAllPartInstances()).filter(
				(partInstance) => partInstance.rundownId === rundownId1 && !partInstance.isTaken && !partInstance.reset
			)
		).toHaveLength(1)

		await resetRundownPlaylist(context, { playlistId: playlistId1, activate: 'active' })

		// Take the first Part of active playlist1 once more:
		await takeNextPart(context, { playlistId: playlistId1, fromPartInstanceId: null })

		// Take the second Part of active playlist1 so that we have more pieceInstances to reset
		await takeNextPart(context, {
			playlistId: playlistId1,
			fromPartInstanceId: (await getPlaylist1()).currentPartInstanceId,
		})

		// should throw with 402 code, as resetting the rundown when active is forbidden, with default configuration
		await expect(
			resetRundownPlaylist(context, { playlistId: playlistId1, activate: 'active' })
		).rejects.toMatchUserError(UserErrorMessage.RundownResetWhileActive)

		await deactivateRundownPlaylist(context, { playlistId: playlistId1 })

		await resetRundownPlaylist(context, { playlistId: playlistId1, activate: 'rehearsal' })

		// should contain two nonreset pieceInstance (from the first part)
		await expect(
			getAllPieceInstances().then((ps) =>
				ps.filter((pieceInstance) => pieceInstance.rundownId === rundownId1 && !pieceInstance.reset)
			)
		).resolves.toHaveLength(2)

		await takeNextPart(context, {
			playlistId: playlistId1,
			fromPartInstanceId: (await getPlaylist1()).currentPartInstanceId,
		})

		// should contain one nonreset taken partInstance
		await expect(
			getAllPartInstances().then((ps) =>
				ps.filter(
					(partInstance) =>
						partInstance.rundownId === rundownId1 && !partInstance.reset && partInstance.isTaken
				)
			)
		).resolves.toHaveLength(1)

		// should contain three non-reset pieceInstance (two from the first part, one from the second)
		await expect(
			getAllPieceInstances().then((ps) =>
				ps.filter((pieceInstance) => pieceInstance.rundownId === rundownId1 && !pieceInstance.reset)
			)
		).resolves.toHaveLength(3)

		// take the second part
		await takeNextPart(context, {
			playlistId: playlistId1,
			fromPartInstanceId: (await getPlaylist1()).currentPartInstanceId,
		})

		// Setting as next a part that is previous

		// set and take first Part again
		await setNextPart(context, {
			playlistId: playlistId1,
			nextPartId: (await getAllParts(rundownId1))[0]._id,
		})
		await takeNextPart(context, {
			playlistId: playlistId1,
			fromPartInstanceId: (await getPlaylist1()).currentPartInstanceId,
		})

		// take the second part to check if we reset all previous partInstances correctly
		await takeNextPart(context, {
			playlistId: playlistId1,
			fromPartInstanceId: (await getPlaylist1()).currentPartInstanceId,
		})

		// should contain two nonreset taken partInstances
		await expect(
			getAllPartInstances().then((ps) =>
				ps.filter(
					(partInstance) =>
						partInstance.rundownId === rundownId1 && !partInstance.reset && partInstance.isTaken
				)
			)
		).resolves.toHaveLength(2)

		// should contain one nonreset untaken partInstance
		await expect(
			getAllPartInstances().then((ps) =>
				ps.filter(
					(partInstance) =>
						partInstance.rundownId === rundownId1 && !partInstance.reset && !partInstance.isTaken
				)
			)
		).resolves.toHaveLength(1)

		// should contain three nonreset pieceInstances
		await expect(
			getAllPieceInstances().then((ps) =>
				ps.filter((pieceInstance) => pieceInstance.rundownId === rundownId1 && !pieceInstance.reset)
			)
		).resolves.toHaveLength(3)

		await takeNextPart(context, {
			playlistId: playlistId1,
			fromPartInstanceId: (await getPlaylist1()).currentPartInstanceId,
		})

		// Setting as next a non-previous and non-current part:

		// set and take first Part again
		await setNextPart(context, {
			playlistId: playlistId1,
			nextPartId: (await getAllParts(rundownId1))[0]._id,
		})
		await takeNextPart(context, {
			playlistId: playlistId1,
			fromPartInstanceId: (await getPlaylist1()).currentPartInstanceId,
		})

		// should contain two nonreset taken instance
		await expect(
			getAllPartInstances().then((ps) =>
				ps.filter(
					(partInstance) =>
						partInstance.rundownId === rundownId1 && !partInstance.reset && partInstance.isTaken
				)
			)
		).resolves.toHaveLength(2)

		// should contain one nonreset untaken partInstance (next)
		await expect(
			getAllPartInstances().then((ps) =>
				ps.filter(
					(partInstance) =>
						partInstance.rundownId === rundownId1 && !partInstance.reset && !partInstance.isTaken
				)
			)
		).resolves.toHaveLength(1)

		// should contain three nonreset pieceInstance
		await expect(
			getAllPieceInstances().then((ps) =>
				ps.filter((pieceInstance) => pieceInstance.rundownId === rundownId1 && !pieceInstance.reset)
			)
		).resolves.toHaveLength(3)
	})
	test('onPlayoutPlaybackChanged', async () => {
		const TIME_RANDOM = 5

		const { rundownId: rundownId0, playlistId: playlistId0 } = await setupRundownWithAutoplayPart0(
			context,
			protectString('rundown0'),
			showStyle
		)

		expect(rundownId0).toBeTruthy()
		expect(playlistId0).toBeTruthy()

		const getRundown0 = async () => {
			return (await context.directCollections.Rundowns.findOne(rundownId0)) as DBRundown
		}
		const getPlaylist0 = async () => {
			const playlist = (await context.directCollections.RundownPlaylists.findOne(
				playlistId0
			)) as DBRundownPlaylist
			playlist.activationId = playlist.activationId ?? undefined
			return playlist
		}

		// Prepare and activate in rehersal:
		await resetRundownPlaylist(context, { playlistId: playlistId0, activate: 'rehearsal' })

		await expect(getPlaylist0()).resolves.toMatchObject({
			activationId: expect.stringMatching(/^randomId/),
			rehearsal: true,
		})

		const { parts } = await getAllRundownData(await getRundown0())

		// just any time, such as 2020-01-01 12:00:00
		useFakeCurrentTime(new Date(2020, 0, 1, 12, 0, 0).getTime())

		{
			const now = getCurrentTime()

			// Take the first Part:
			await takeNextPart(context, { playlistId: playlistId0, fromPartInstanceId: null })

			const { currentPartInstance, nextPartInstance } = await getSelectedPartInstances(
				context,
				await getPlaylist0()
			)
			expect(currentPartInstance).toBeTruthy()
			expect(nextPartInstance).toBeTruthy()
			expect(currentPartInstance?.part._id).toBe(parts[0]._id)
			expect(currentPartInstance?.part.autoNext).toBe(true) // the current part should autonext
			expect(currentPartInstance?.part.expectedDuration).toBeGreaterThan(0)
			expect(nextPartInstance?.part._id).toBe(parts[1]._id)

			// simulate TSR starting playing part and pieces:
			const currentPartInstanceId = currentPartInstance?._id || protectString('')
			const pieceInstances = await getAllPieceInstancesForPartInstance(currentPartInstanceId)
			expect(pieceInstances).toHaveLength(2)
			await onPlayoutPlaybackChanged(context, {
				playlistId: playlistId0,
				changes: [
					{
						type: PlayoutChangedType.PART_PLAYBACK_STARTED,
						objId: 'objectId',
						data: {
							partInstanceId: currentPartInstanceId,
							time: now,
						},
					},
					...pieceInstances.map((pieceInstance) => {
						return {
							type: PlayoutChangedType.PIECE_PLAYBACK_STARTED,
							objId: 'objectId',
							data: {
								partInstanceId: pieceInstance.partInstanceId,
								pieceInstanceId: pieceInstance._id,
								time:
									(typeof pieceInstance.piece.enable.start === 'number'
										? now + pieceInstance.piece.enable.start
										: now) +
									Math.random() * TIME_RANDOM,
							},
						}
					}),
				],
			})
		}

		{
			const now = getCurrentTime()

			// the rundown timings are set
			const playlist = await getPlaylist0()
			expect(playlist.startedPlayback).toBe(now)

			// the currentPartInstance timings are set
			const currentPartInstance = (await getSelectedPartInstances(context, playlist))
				.currentPartInstance as DBPartInstance
			expect(currentPartInstance).toBeTruthy()
			expect(currentPartInstance.timings?.startedPlayback).toBe(now)

			// the piece instances timings are set
			const pieceInstances = await getAllPieceInstancesForPartInstance(currentPartInstance._id)
			expect(pieceInstances).toHaveLength(2)
			pieceInstances.forEach((pieceInstance) => {
				expect(pieceInstance.startedPlayback).toBeTruthy()
				expect(pieceInstance.startedPlayback).toBeWithinRange(now, now + TIME_RANDOM)
			})
		}

		{
			const nowBuf = getCurrentTime()
			const { currentPartInstance } = await getSelectedPartInstances(context, await getPlaylist0())
			expect(currentPartInstance?.part.expectedDuration).toBeTruthy()
			adjustFakeTime((currentPartInstance?.part.expectedDuration ?? 0) - 500)
			// try to take just before an autonext
			await expect(
				takeNextPart(context, { playlistId: playlistId0, fromPartInstanceId: currentPartInstance?._id ?? null })
			).rejects.toMatchUserError(UserErrorMessage.TakeCloseToAutonext)
			useFakeCurrentTime(nowBuf)
		}

		{
			// simulate an autonext
			const { currentPartInstance: currentPartInstanceBeforeTake, nextPartInstance: nextPartInstanceBeforeTake } =
				await getSelectedPartInstances(context, await getPlaylist0())
			const currentPartInstanceBeforeTakeId = currentPartInstanceBeforeTake?._id
			const nextPartInstanceBeforeTakeId = nextPartInstanceBeforeTake?._id

			if (!currentPartInstanceBeforeTakeId) throw new Error('currentPartInstanceBeforeTakeId is falsy')
			if (!nextPartInstanceBeforeTakeId) throw new Error('nextPartInstanceBeforeTakeId is falsy')

			expect(currentPartInstanceBeforeTake?.part.expectedDuration).toBeTruthy()
			const pieceInstances = await getAllPieceInstancesForPartInstance(currentPartInstanceBeforeTakeId)
			expect(pieceInstances).toHaveLength(2)
			const now = adjustFakeTime(currentPartInstanceBeforeTake?.part.expectedDuration ?? 0)
			await onPlayoutPlaybackChanged(context, {
				playlistId: playlistId0,

				changes: [
					{
						type: PlayoutChangedType.PART_PLAYBACK_STARTED,
						objId: 'objectId',
						data: {
							partInstanceId: nextPartInstanceBeforeTakeId,
							time: now,
						},
					},
					{
						type: PlayoutChangedType.PART_PLAYBACK_STOPPED,
						objId: 'objectId',
						data: {
							partInstanceId: currentPartInstanceBeforeTakeId,
							time: now,
						},
					},
					...pieceInstances.map((pieceInstance) => {
						return {
							type: PlayoutChangedType.PIECE_PLAYBACK_STOPPED,
							objId: 'objectId',
							data: {
								partInstanceId: pieceInstance.partInstanceId,
								pieceInstanceId: pieceInstance._id,
								time:
									(typeof pieceInstance.piece.enable.start === 'number'
										? now + pieceInstance.piece.enable.start
										: now) +
									Math.random() * TIME_RANDOM,
							},
						}
					}),
				],
			})

			const { currentPartInstance: currentPartInstanceAfterTake, nextPartInstance: nextPartInstanceAfterTake } =
				await getSelectedPartInstances(context, await getPlaylist0())
			expect(currentPartInstanceAfterTake).toBeTruthy()
			expect(currentPartInstanceAfterTake?.part._id).toBe(parts[1]._id)
			expect(nextPartInstanceAfterTake).toBeTruthy()
			expect(nextPartInstanceAfterTake?.part._id).toBe(parts[2]._id)

			const previousPartInstanceAfterTake = await context.directCollections.PartInstances.findOne(
				currentPartInstanceBeforeTakeId
			)
			expect(previousPartInstanceAfterTake).toBeTruthy()
			expect(previousPartInstanceAfterTake?.timings?.stoppedPlayback).toBe(now)

			const pieceInstances2 = await getAllPieceInstancesForPartInstance(currentPartInstanceBeforeTakeId)
			pieceInstances2.forEach((pieceInstance) => {
				expect(pieceInstance.stoppedPlayback).toBeWithinRange(now, now + TIME_RANDOM)
			})
		}
	})
	test('moveNextPart', async () => {
		const { rundownId: rundownId0, playlistId: playlistId0 } = await setupRundownWithAutoplayPart0(
			context,
			protectString('rundown0'),
			showStyle
		)
		expect(rundownId0).toBeTruthy()
		expect(playlistId0).toBeTruthy()

		const getRundown0 = async () => {
			return (await context.directCollections.Rundowns.findOne(rundownId0)) as DBRundown
		}
		const getPlaylist0 = async () => {
			const playlist = (await context.directCollections.RundownPlaylists.findOne(
				playlistId0
			)) as DBRundownPlaylist
			playlist.activationId = playlist.activationId ?? undefined
			return playlist
		}
		const { parts } = await getAllRundownData(await getRundown0())

		// Prepare and activate in rehersal:
		await resetRundownPlaylist(context, { playlistId: playlistId0, activate: 'rehearsal' })

		{
			const playlist = await getPlaylist0()
			// expect first part to be selected as next
			const { currentPartInstance, nextPartInstance } = await getSelectedPartInstances(context, playlist)
			expect(currentPartInstance).toBeFalsy()
			expect(playlist).toMatchObject({
				activationId: expect.stringMatching(/^randomId/),
				rehearsal: true,
			})
			expect(nextPartInstance?.part._id).toBe(parts[0]._id)
		}

		{
			// move horizontally +1
			await moveNextPart(context, { playlistId: playlistId0, partDelta: 1, segmentDelta: 0 })
			const { nextPartInstance } = await getSelectedPartInstances(context, await getPlaylist0())
			// expect second part to be selected as next
			expect(nextPartInstance?.part._id).toBe(parts[1]._id)
		}

		{
			// move horizontally -1
			await moveNextPart(context, { playlistId: playlistId0, partDelta: -1, segmentDelta: 0 })
			const { nextPartInstance } = await getSelectedPartInstances(context, await getPlaylist0())
			// expect first part to be selected as next
			expect(nextPartInstance?.part._id).toBe(parts[0]._id)
		}

		{
			// move vertically +1
			await moveNextPart(context, { playlistId: playlistId0, partDelta: 0, segmentDelta: 1 })
			const { nextPartInstance } = await getSelectedPartInstances(context, await getPlaylist0())
			// expect 3rd part to be selected as next
			expect(nextPartInstance?.part._id).toBe(parts[2]._id)
		}

		{
			// move vertically -1
			await moveNextPart(context, { playlistId: playlistId0, partDelta: 0, segmentDelta: -1 })
			const { nextPartInstance } = await getSelectedPartInstances(context, await getPlaylist0())
			// expect 1st part to be selected as next
			expect(nextPartInstance?.part._id).toBe(parts[0]._id)
		}
	})

	function testWithDefaultRundownPlaylist(
		testFunction: (
			playlistId: RundownPlaylistId,
			adlibPieces: AdLibPiece[],
			getPlaylist: () => Promise<DBRundownPlaylist>
		) => Promise<void>
	) {
		return async () => {
			const { rundownId, playlistId } = await setupDefaultRundownPlaylist(context)
			expect(rundownId).toBeTruthy()
			expect(playlistId).toBeTruthy()

			const getRundown0 = async () => {
				return (await context.directCollections.Rundowns.findOne(rundownId)) as DBRundown
			}
			const getPlaylist = async () => {
				const playlist = (await context.directCollections.RundownPlaylists.findOne(
					playlistId
				)) as DBRundownPlaylist
				playlist.activationId = playlist.activationId ?? undefined
				return playlist
			}
			const { adLibPieces } = await getAllRundownData(await getRundown0())

			// Prepare and activate in rehersal:
			await resetRundownPlaylist(context, { playlistId: playlistId, activate: 'rehearsal' })

			await takeNextPart(context, {
				playlistId: playlistId,
				fromPartInstanceId: null,
			})
			await testFunction(playlistId, adLibPieces, getPlaylist)
		}
	}

	test(
		'adLibPieceStart sets start to 0 when queue is true',
		testWithDefaultRundownPlaylist(async (playlistId, adLibPieces, getPlaylist) => {
			await adLibPieceStart(context, {
				playlistId,
				partInstanceId: (await getPlaylist()).currentPartInstanceId || protectString(''),
				adLibPieceId: adLibPieces[0]._id,
				pieceType: 'normal',
				queue: true,
			})
			const nextPartInstance = (await getPlaylist()).nextPartInstanceId || protectString('')

			const pieceInstances = await getAllPieceInstancesForPartInstance(nextPartInstance)

			expect(pieceInstances.length).toBe(1)
			expect(pieceInstances[0].piece.name).toBe(adLibPieces[0].name)
			expect(pieceInstances[0].piece.enable.start).toBe(0)
		})
	)

	test(
		'adLibPieceStart sets start to 0 when toBeQueued is true',
		testWithDefaultRundownPlaylist(async (playlistId, adLibPieces, getPlaylist) => {
			await adLibPieceStart(context, {
				playlistId,
				partInstanceId: (await getPlaylist()).currentPartInstanceId || protectString(''),
				adLibPieceId: adLibPieces[1]._id,
				pieceType: 'normal',
				queue: false,
			})
			const nextPartInstance = (await getPlaylist()).nextPartInstanceId || protectString('')

			const pieceInstances = await getAllPieceInstancesForPartInstance(nextPartInstance)

			expect(pieceInstances.length).toBe(1)
			expect(pieceInstances[0].piece.name).toBe(adLibPieces[1].name)
			expect(pieceInstances[0].piece.enable.start).toBe(0)
		})
	)
})

async function setupRundownWithAutoplayPart0(
	context: MockJobContext,
	rundownId: RundownId,
	showStyle: ReadonlyDeep<ShowStyleCompound>
): Promise<{ playlistId: RundownPlaylistId; rundownId: RundownId }> {
	const playlistId = await context.directCollections.RundownPlaylists.insertOne(
		defaultRundownPlaylist(protectString(`playlist_${rundownId}`), context.studioId)
	)

	const rundown: DBRundown = defaultRundown(
		unprotectString(rundownId),
		context.studioId,
		null,
		playlistId,
		showStyle._id,
		showStyle.showStyleVariantId
	)
	rundown._id = rundownId
	await context.directCollections.Rundowns.insertOne(rundown)

	const segment0: DBSegment = {
		...defaultSegment(protectString(rundownId + '_segment0'), rundown._id),
		_rank: 0,
		externalId: 'MOCK_SEGMENT_0',
		name: 'Segment 0',
	}
	await context.directCollections.Segments.insertOne(segment0)

	const part00: DBPart = {
		...defaultPart(protectString(rundownId + '_part0_0'), rundown._id, segment0._id),
		externalId: 'MOCK_PART_0_0',
		title: 'Part 0 0',

		expectedDuration: 20000,
		autoNext: true,
	}
	await context.directCollections.Parts.insertOne(part00)

	const piece000: Piece = {
		...defaultPiece(protectString(rundownId + '_piece000'), rundown._id, part00.segmentId, part00._id),
		externalId: 'MOCK_PIECE_000',
		name: 'Piece 000',
		sourceLayerId: showStyle.sourceLayers[0]._id,
		outputLayerId: showStyle.outputLayers[0]._id,
	}
	await context.directCollections.Pieces.insertOne(piece000)

	const piece001: Piece = {
		...defaultPiece(protectString(rundownId + '_piece001'), rundown._id, part00.segmentId, part00._id),
		externalId: 'MOCK_PIECE_001',
		name: 'Piece 001',
		sourceLayerId: showStyle.sourceLayers[1]._id,
		outputLayerId: showStyle.outputLayers[0]._id,
	}
	await context.directCollections.Pieces.insertOne(piece001)

	const adLibPiece000: AdLibPiece = {
		...defaultAdLibPiece(protectString(rundownId + '_adLib000'), segment0.rundownId, part00._id),
		expectedDuration: 1000,
		externalId: 'MOCK_ADLIB_000',
		status: PieceStatusCode.UNKNOWN,
		name: 'AdLib 0',
		sourceLayerId: showStyle.sourceLayers[1]._id,
		outputLayerId: showStyle.outputLayers[0]._id,
	}
	await context.directCollections.AdLibPieces.insertOne(adLibPiece000)

	const part01: DBPart = {
		...defaultPart(protectString(rundownId + '_part0_1'), rundown._id, segment0._id),
		_rank: 1,
		externalId: 'MOCK_PART_0_1',
		title: 'Part 0 1',
	}
	await context.directCollections.Parts.insertOne(part01)

	const piece010: Piece = {
		...defaultPiece(protectString(rundownId + '_piece010'), rundown._id, part01.segmentId, part01._id),
		externalId: 'MOCK_PIECE_010',
		name: 'Piece 010',
		sourceLayerId: showStyle.sourceLayers[0]._id,
		outputLayerId: showStyle.outputLayers[0]._id,
	}
	await context.directCollections.Pieces.insertOne(piece010)

	const segment1: DBSegment = {
		...defaultSegment(protectString(rundownId + '_segment1'), rundown._id),
		_rank: 1,
		externalId: 'MOCK_SEGMENT_2',
		name: 'Segment 1',
	}
	await context.directCollections.Segments.insertOne(segment1)

	const part10: DBPart = {
		...defaultPart(protectString(rundownId + '_part1_0'), rundown._id, segment1._id),
		_rank: 0,
		externalId: 'MOCK_PART_1_0',
		title: 'Part 1 0',
	}
	await context.directCollections.Parts.insertOne(part10)

	const part11: DBPart = {
		...defaultPart(protectString(rundownId + '_part1_1'), rundown._id, segment1._id),
		_rank: 1,
		externalId: 'MOCK_PART_1_1',
		title: 'Part 1 1',
	}
	await context.directCollections.Parts.insertOne(part11)

	const part12: DBPart = {
		...defaultPart(protectString(rundownId + '_part1_2'), rundown._id, segment1._id),
		_rank: 2,
		externalId: 'MOCK_PART_1_2',
		title: 'Part 1 2',
	}
	await context.directCollections.Parts.insertOne(part12)

	const segment2: DBSegment = {
		...defaultSegment(protectString(rundownId + '_segment2'), rundown._id),
		_rank: 2,
		externalId: 'MOCK_SEGMENT_2',
		name: 'Segment 2',
	}
	await context.directCollections.Segments.insertOne(segment2)

	const globalAdLib0: RundownBaselineAdLibItem = {
		_id: protectString(rundownId + '_globalAdLib0'),
		_rank: 0,
		externalId: 'MOCK_GLOBAL_ADLIB_0',
		lifespan: PieceLifespan.OutOnRundownChange,
		rundownId: segment0.rundownId,
		status: PieceStatusCode.UNKNOWN,
		name: 'Global AdLib 0',
		sourceLayerId: showStyle.sourceLayers[0]._id,
		outputLayerId: showStyle.outputLayers[0]._id,
		content: {},
		timelineObjectsString: EmptyPieceTimelineObjectsBlob,
	}

	const globalAdLib1: RundownBaselineAdLibItem = {
		_id: protectString(rundownId + '_globalAdLib1'),
		_rank: 0,
		externalId: 'MOCK_GLOBAL_ADLIB_1',
		lifespan: PieceLifespan.OutOnRundownChange,
		rundownId: segment0.rundownId,
		status: PieceStatusCode.UNKNOWN,
		name: 'Global AdLib 1',
		sourceLayerId: showStyle.sourceLayers[1]._id,
		outputLayerId: showStyle.outputLayers[0]._id,
		content: {},
		timelineObjectsString: EmptyPieceTimelineObjectsBlob,
	}

	await context.directCollections.RundownBaselineAdLibPieces.insertOne(globalAdLib0)
	await context.directCollections.RundownBaselineAdLibPieces.insertOne(globalAdLib1)

	return { playlistId, rundownId }
}
