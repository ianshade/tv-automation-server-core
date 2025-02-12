import '../../../__mocks__/_extendJest'
import { testInFiber } from '../../../__mocks__/helpers/jest'
import {
	setupDefaultStudioEnvironment,
	DefaultEnvironment,
	setupDefaultRundownPlaylist,
	setupDefaultRundown,
} from '../../../__mocks__/helpers/database'
import { protectString, protectStringArray } from '../../../lib/lib'
import { Rundowns, Rundown } from '../../../lib/collections/Rundowns'
import {
	RundownPlaylists,
	RundownPlaylist,
	RundownPlaylistCollectionUtil,
} from '../../../lib/collections/RundownPlaylists'
import { produceRundownPlaylistInfoFromRundown, updateRundownsInPlaylist } from '../rundownPlaylist'
import { DbCacheWriteCollection } from '../../cache/CacheCollection'
import { MeteorCall } from '../../../lib/api/methods'

describe('Rundown', () => {
	let env: DefaultEnvironment
	beforeAll(async () => {
		env = await setupDefaultStudioEnvironment()
	})
	testInFiber('moveRundown', async () => {
		// Set up a playlist:
		const { rundownId: rundownId00, playlistId: playlistId0 } = setupDefaultRundownPlaylist(
			env,
			protectString('rundown00')
		)
		let playlist0 = RundownPlaylists.findOne(playlistId0) as RundownPlaylist
		expect(playlist0).toBeTruthy()

		// Add 2 more rundowns in it:
		const rundownId02 = setupDefaultRundown(env, playlistId0, protectString('rundown02')) // intentionally not created in the right order
		const rundownId01 = setupDefaultRundown(env, playlistId0, protectString('rundown01'))
		expect(rundownId00).toEqual('rundown00')
		expect(rundownId01).toEqual('rundown01')
		expect(rundownId02).toEqual('rundown02')
		// The setupDefaultRundown doesn't set _rank, set expectedStart so that they will get a default order from that:
		Rundowns.update(rundownId00, {
			$set: { playlistId: playlistId0, playlistIdIsSetInSofie: true, expectedStart: 1000 },
		})
		Rundowns.update(rundownId01, {
			$set: { playlistId: playlistId0, playlistIdIsSetInSofie: true, expectedStart: 2000 },
		})
		Rundowns.update(rundownId02, {
			$set: { playlistId: playlistId0, playlistIdIsSetInSofie: true, expectedStart: 3000 },
		})

		const rundown00 = Rundowns.findOne(rundownId00) as Rundown
		expect(rundown00).toBeTruthy()
		expect(rundown00.playlistId).toEqual(playlistId0)

		// This should set the default sorting of the rundowns in the plylist:
		const rundownsCollection = await DbCacheWriteCollection.createFromDatabase(Rundowns, {
			playlistId: playlist0._id,
		})
		const rundownPlaylistInfo = produceRundownPlaylistInfoFromRundown(
			env.studio,
			undefined,
			playlist0,
			playlist0._id,
			playlist0.externalId,
			rundownsCollection.findFetch()
		)
		updateRundownsInPlaylist(rundownPlaylistInfo.rundownPlaylist, rundownPlaylistInfo.order, rundownsCollection)
		await rundownsCollection.updateDatabaseWithData()

		// Expect the rundowns to be in the right order:
		const rundownsInPLaylist0 = RundownPlaylistCollectionUtil.getRundowns(playlist0)
		expect(rundownsInPLaylist0[0]).toMatchObject({ _id: 'rundown00', _rank: 1 })
		expect(rundownsInPLaylist0[1]).toMatchObject({ _id: 'rundown01', _rank: 2 })
		expect(rundownsInPLaylist0[2]).toMatchObject({ _id: 'rundown02', _rank: 3 })

		// Move the rundown:
		await MeteorCall.rundown.moveRundown(
			rundownId00,
			playlist0._id,
			protectStringArray(['rundown01', 'rundown02', 'rundown00'])
		)
		expect(RundownPlaylistCollectionUtil.getRundownIDs(playlist0)).toEqual(['rundown01', 'rundown02', 'rundown00'])

		playlist0 = RundownPlaylists.findOne(playlistId0) as RundownPlaylist
		expect(playlist0).toBeTruthy()

		await MeteorCall.rundown.moveRundown(
			rundownId02,
			playlist0._id,
			protectStringArray(['rundown02', 'rundown01', 'rundown00'])
		)
		expect(RundownPlaylistCollectionUtil.getRundownIDs(playlist0)).toEqual(['rundown02', 'rundown01', 'rundown00'])

		// Introduce another playlist
		const { rundownId: rundownId10, playlistId: playlistId1 } = setupDefaultRundownPlaylist(
			env,
			protectString('rundown10')
		)
		expect(rundownId10).toEqual('rundown10')
		const playlist1 = RundownPlaylists.findOne(playlistId1) as RundownPlaylist
		expect(playlist1).toBeTruthy()

		expect(RundownPlaylists.find().count()).toEqual(2)

		// Move over a rundown to the other playlist:
		await MeteorCall.rundown.moveRundown(rundownId02, playlist1._id, protectStringArray(['rundown10', 'rundown02']))
		expect(RundownPlaylistCollectionUtil.getRundownIDs(playlist0)).toEqual(['rundown01', 'rundown00'])
		expect(RundownPlaylistCollectionUtil.getRundownIDs(playlist1)).toEqual(['rundown10', 'rundown02'])

		// Move a rundown out of a playlist:
		await MeteorCall.rundown.moveRundown(rundownId02, null, [])
		expect(RundownPlaylistCollectionUtil.getRundownIDs(playlist0)).toEqual(['rundown01', 'rundown00'])
		expect(RundownPlaylistCollectionUtil.getRundownIDs(playlist1)).toEqual(['rundown10'])
		expect(RundownPlaylists.find().count()).toEqual(3) // A new playlist has been created
		// The newly created playlist:
		const newPlaylist = RundownPlaylists.findOne({ _id: { $nin: [playlistId0, playlistId1] } }) as RundownPlaylist
		expect(newPlaylist).toBeTruthy()
		expect(RundownPlaylistCollectionUtil.getRundownIDs(newPlaylist)).toEqual(['rundown02'])

		// Move the last rundown into another playlist:
		await MeteorCall.rundown.moveRundown(rundownId02, null, [])
		expect(RundownPlaylists.find().count()).toEqual(3) // A new playlist has been created, and an old one was removed
		const newPlaylist2 = RundownPlaylists.findOne({
			_id: { $nin: [playlistId0, playlistId1, newPlaylist._id] },
		}) as RundownPlaylist
		expect(newPlaylist2).toBeTruthy()
		expect(RundownPlaylistCollectionUtil.getRundownIDs(newPlaylist2)).toEqual(['rundown02'])

		// Move the rundown back into a playlist:
		expect(RundownPlaylistCollectionUtil.getRundownIDs(playlist0)).toEqual(['rundown01', 'rundown00'])
		// Note: the order here will be ignored, new rundowns are placed last:
		await MeteorCall.rundown.moveRundown(
			rundownId02,
			playlist0._id,
			protectStringArray(['rundown01', 'rundown02', 'rundown00'])
		)
		expect(RundownPlaylistCollectionUtil.getRundownIDs(playlist0)).toEqual(['rundown01', 'rundown02', 'rundown00'])
		expect(RundownPlaylistCollectionUtil.getRundownIDs(playlist1)).toEqual(['rundown10'])
		expect(RundownPlaylists.find().count()).toEqual(2) // A playlist was removed

		// Restore the order:
		await MeteorCall.rundown.restoreRundownsInPlaylistToDefaultOrder(playlist0._id)
		expect(RundownPlaylistCollectionUtil.getRundownIDs(playlist0)).toEqual(['rundown00', 'rundown01', 'rundown02'])
	})
})
