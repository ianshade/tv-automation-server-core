import { getCurrentTime } from '../../lib/lib'
import { Session } from 'meteor/session'
import { Meteor } from 'meteor/meteor'
import { Tracker } from 'meteor/tracker'
import * as _ from 'underscore'
import { MeteorCall } from '../../lib/api/methods'
import { ClientCollections, PublicationCollections } from '../../lib/collections/lib'
import { logger } from '../../lib/logging'

// Note: These things are convenience functions to be used during development:

Meteor.startup(() => {
	window['Collections'] = Object.fromEntries(ClientCollections.entries())
	window['PublicationCollections'] = Object.fromEntries(PublicationCollections.entries())
})

window['getCurrentTime'] = getCurrentTime
window['Session'] = Session

function setDebugData() {
	Tracker.autorun(() => {
		const stats = {}
		for (const [name, collection] of ClientCollections.entries()) {
			stats[name] = collection.find().count()
		}
		console.log(
			_.map(stats, (count: any, name: string) => {
				return name + ': ' + count
			}).join('\n')
		)
	})
}
window['setDebugData'] = setDebugData
const debugData = false
if (debugData) {
	console.log('Debug: comment out this!')
	setDebugData()
}
window['MeteorCall'] = MeteorCall
window['logger'] = logger
