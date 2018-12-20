import { TimelineObjGeneric, TimelineObjGroup } from './collections/Timeline'
import { TimelineObject } from 'superfly-timeline'
let clone = require('fast-clone')
import * as _ from 'underscore'

// This is a collection of functions that match what the playout-gateway / TSR does
// playout-gateway:
export function transformTimeline (timeline: Array<TimelineObjGeneric>): Array<TimelineContentObject> {

	let transformObject = (obj: TimelineObjGeneric): TimelineContentObject => {
		let transformedObj = clone(_.extend({
		   id: obj['_id'],
		   roId: obj['roId']
	   }, _.omit(obj, ['_id', 'id', 'deviceId', 'siId'])))

	   if (!transformedObj.content) transformedObj.content = {}
	   if (!transformedObj.content.objects) transformedObj.content.objects = []

	   if (obj['slId']) {
		   // Will cause a callback to be called, when the object starts to play:
		   transformedObj.content.callBack = 'segmentLinePlaybackStarted'
		   transformedObj.content.callBackData = {
			   roId: obj.roId,
			   slId: obj['slId']
		   }
	   }
	   if (obj['sliId']) {
		// Will cause a callback to be called, when the object starts to play:
		   transformedObj.content.callBack = 'segmentLineItemPlaybackStarted'
		   transformedObj.content.callBackData = {
			   roId: obj.roId,
			   sliId: obj['sliId']
		   }
	   }

	   return transformedObj
	}

	let groupObjects: {[id: string]: TimelineContentObject} = {}
	let transformedTimeline: Array<TimelineContentObject> = []
	let doTransform = (objs: Array<TimelineObjGeneric>) => {
		let objsLeft: Array<TimelineObjGeneric> = []
		let changedSomething: boolean = false
		_.each(objs, (obj: TimelineObjGeneric | TimelineObjGroup) => {

			let transformedObj = transformObject(obj)

			if (obj.isGroup) {
				groupObjects[transformedObj.id] = transformedObj
				changedSomething = true
			}
			if (obj.inGroup) {
				let groupObj = groupObjects[obj.inGroup]
				if (groupObj) {
					// Add object into group:
					if (groupObj.content.objects) {
						groupObj.content.objects.push(transformedObj)
						changedSomething = true
					}
				} else {
					// referenced group not found, try again later:
					objsLeft.push(obj)
				}
			} else {
				// Add object to timeline
				transformedTimeline.push(transformedObj)
				changedSomething = true
			}
		})
		// Iterate again?
		if (objsLeft.length && changedSomething) {
			doTransform(objsLeft)
		}
	}
	doTransform(timeline)
	return transformedTimeline

}

// TSR: ---------
export interface TimelineContentObject extends TimelineObject {
}
