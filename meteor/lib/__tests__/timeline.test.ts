import { testInFiber } from '../../__mocks__/helpers/jest'
import { transformTimeline } from '@sofie-automation/corelib/dist/playout/timeline'
import { TimelineObjGeneric, TimelineObjType, TimelineObjRundown } from '../collections/Timeline'
import { TSR } from '@sofie-automation/blueprints-integration'

describe('lib/timeline', () => {
	testInFiber('transformTimeline', () => {
		const timeline: TimelineObjRundown[] = [
			{
				id: '0',
				objectType: TimelineObjType.RUNDOWN,
				enable: {
					start: 0,
				},
				content: {
					deviceType: TSR.DeviceType.ABSTRACT,
				},
				layer: 'L1',
			},
			{
				id: 'child0',
				objectType: TimelineObjType.RUNDOWN,
				enable: {
					start: 0,
				},
				content: {
					deviceType: TSR.DeviceType.ABSTRACT,
				},
				layer: 'L1',
				inGroup: 'group0',
			},
			{
				id: 'child1',
				objectType: TimelineObjType.RUNDOWN,
				enable: {
					start: 0,
				},
				content: {
					deviceType: TSR.DeviceType.ABSTRACT,
				},
				layer: 'L1',
				inGroup: 'group0',
			},
			{
				id: 'group0',
				objectType: TimelineObjType.RUNDOWN,
				enable: {
					start: 0,
				},
				content: {
					deviceType: TSR.DeviceType.ABSTRACT,
				},
				layer: 'L1',
				isGroup: true,
			},
			{
				id: '2',
				objectType: TimelineObjType.RUNDOWN,
				enable: {
					start: 0,
				},
				content: {
					// @ts-expect-error temporary ignoring typing issue
					callBack: 'partPlaybackStarted',
					callBackData: {
						rundownId: 'myRundown0',
						partId: 'myPart0',
					},
					callBackStopped: 'partPlaybackStopped',
				},
				layer: 'L1',
				partId: 'myPart0',
			},
			{
				id: '3',
				objectType: TimelineObjType.RUNDOWN,
				enable: {
					start: 0,
				},
				content: {
					// @ts-expect-error temporary ignoring typing issue
					callBack: 'piecePlaybackStarted',
					callBackData: {
						rundownId: 'myRundown0',
						pieceId: 'myPiece0',
					},
					callBackStopped: 'piecePlaybackStopped',
				},
				layer: 'L1',
				// @ts-ignore
				pieceId: 'myPiece0',
			},
		]
		const transformedTimeline = transformTimeline(timeline)

		expect(transformedTimeline).toHaveLength(4)

		expect(transformedTimeline[0]).toMatchObject({
			id: '0',
		})
		expect(transformedTimeline[3]).toMatchObject({
			id: 'group0',
		})
		expect(transformedTimeline[3].children).toHaveLength(2)

		expect(transformedTimeline[1]).toMatchObject({
			id: '2',
			content: {
				callBack: 'partPlaybackStarted',
				callBackData: {
					rundownId: 'myRundown0',
					partId: 'myPart0',
				},
				callBackStopped: 'partPlaybackStopped',
			},
		})
		expect(transformedTimeline[2]).toMatchObject({
			id: '3',
			content: {
				callBack: 'piecePlaybackStarted',
				callBackData: {
					rundownId: 'myRundown0',
					pieceId: 'myPiece0',
				},
				callBackStopped: 'piecePlaybackStopped',
			},
		})
	})
	testInFiber('missing id', () => {
		expect(() => {
			transformTimeline([
				// @ts-ignore missing: id
				{
					objectType: TimelineObjType.RUNDOWN,
					enable: { start: 0 },
					content: { deviceType: TSR.DeviceType.ABSTRACT },
					layer: 'L1',
				},
			] as TimelineObjGeneric[])
		}).toThrowError(/missing id/)
	})
})
