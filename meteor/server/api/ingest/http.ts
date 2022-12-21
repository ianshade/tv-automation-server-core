import { IncomingMessage, ServerResponse } from 'http'
import { logger } from '../../../lib/logging'
import { Meteor } from 'meteor/meteor'
import { StudioId } from '../../../lib/collections/Studios'
import { check } from '../../../lib/check'
import { Rundowns } from '../../../lib/collections/Rundowns'
import { getRundownId, runIngestOperation } from './lib'
import { protectString, stringifyError } from '../../../lib/lib'
import { PickerPOST } from '../http'
import { IngestJobs } from '@sofie-automation/corelib/dist/worker/ingest'
import { IngestRundown } from '@sofie-automation/blueprints-integration'
import { getExternalNRCSName } from '@sofie-automation/corelib/dist/dataModel/PeripheralDevice'
import { checkStudioExists } from '../../../lib/collections/optimizations'

PickerPOST.route('/ingest/:studioId', async (params, req: IncomingMessage, response: ServerResponse) => {
	check(params.studioId, String)
	response.setHeader('Content-Type', 'text/plain')

	const content = ''
	try {
		let ingestRundown: any = req.body
		if (!ingestRundown) throw new Meteor.Error(400, 'Upload rundown: Missing request body')
		if (typeof ingestRundown !== 'object') {
			// sometimes, the browser can send the JSON with wrong mimetype, resulting in it not being parsed
			ingestRundown = JSON.parse(ingestRundown)
		}

		await importIngestRundown(protectString<StudioId>(params.studioId), ingestRundown)

		response.statusCode = 200
		response.end(content)
	} catch (e) {
		response.setHeader('Content-Type', 'text/plain')
		response.statusCode = e instanceof Meteor.Error && typeof e.error === 'number' ? e.error : 500
		response.end('Error: ' + stringifyError(e))

		if (response.statusCode !== 404) {
			logger.error(stringifyError(e))
		}
	}
})
export async function importIngestRundown(studioId: StudioId, ingestRundown: IngestRundown): Promise<void> {
	const studioExists = await checkStudioExists(studioId)
	if (!studioExists) throw new Meteor.Error(404, `Studio ${studioId} does not exist`)

	const rundownId = getRundownId(studioId, ingestRundown.externalId)

	const existingDbRundown = await Rundowns.findOneAsync(rundownId)
	// If the RO exists and is not from http then don't replace it. Otherwise, it is free to be replaced
	if (existingDbRundown && existingDbRundown.externalNRCSName !== getExternalNRCSName(undefined))
		throw new Meteor.Error(
			403,
			`Cannot replace existing rundown from '${existingDbRundown.externalNRCSName}' with http data`
		)

	await runIngestOperation(studioId, IngestJobs.UpdateRundown, {
		rundownExternalId: ingestRundown.externalId,
		peripheralDeviceId: null,
		ingestRundown: ingestRundown,
		isCreateAction: true,
	})
}
