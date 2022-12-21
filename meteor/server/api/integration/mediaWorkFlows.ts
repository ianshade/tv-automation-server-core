import { check, Match } from '../../../lib/check'
import { Meteor } from 'meteor/meteor'
import { logger } from '../../logging'
import { MediaWorkFlows, MediaWorkFlow, MediaWorkFlowId } from '../../../lib/collections/MediaWorkFlows'
import { MediaWorkFlowSteps, MediaWorkFlowStep, MediaWorkFlowStepId } from '../../../lib/collections/MediaWorkFlowSteps'
import { MediaWorkFlowRevision, MediaWorkFlowStepRevision } from '../../../lib/api/peripheralDevice'
import { PeripheralDeviceId, PeripheralDeviceType } from '../../../lib/collections/PeripheralDevices'
import { MethodContext } from '../../../lib/api/methods'
import { checkAccessAndGetPeripheralDevice } from '../ingest/lib'

export namespace MediaManagerIntegration {
	export async function getMediaWorkFlowStepRevisions(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string
	): Promise<MediaWorkFlowStepRevision[]> {
		logger.debug('getMediaWorkFlowStepRevisions')
		const peripheralDevice = await checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)

		if (peripheralDevice.studioId) {
			const rawSteps = (await MediaWorkFlowSteps.findFetchAsync(
				{
					studioId: peripheralDevice.studioId,
				},
				{
					fields: {
						_id: 1,
						_rev: 1,
					},
				}
			)) as Array<Pick<MediaWorkFlowStep, '_id' | '_rev'>>

			return rawSteps.map((ws) => {
				return {
					_id: ws._id,
					_rev: ws._rev,
				}
			})
		} else {
			throw new Meteor.Error(400, 'Device "' + peripheralDevice._id + '" has no studio')
		}
	}

	export async function getMediaWorkFlowRevisions(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string
	): Promise<MediaWorkFlowRevision[]> {
		logger.debug('getMediaWorkFlowRevisions')
		const peripheralDevice = await checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)

		if (peripheralDevice.studioId) {
			const rawWorkflows = (await MediaWorkFlows.findFetchAsync(
				{
					studioId: peripheralDevice.studioId,
				},
				{
					fields: {
						_id: 1,
						_rev: 1,
					},
				}
			)) as Array<Pick<MediaWorkFlow, '_id' | '_rev'>>

			return rawWorkflows.map((wf) => {
				return {
					_id: wf._id,
					_rev: wf._rev,
				}
			})
		} else {
			throw new Meteor.Error(400, 'Device "' + peripheralDevice._id + '" has no studio')
		}
	}

	export async function updateMediaWorkFlow(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		workFlowId: MediaWorkFlowId,
		obj: MediaWorkFlow | null
	): Promise<void> {
		const peripheralDevice = await checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		if (peripheralDevice.type !== PeripheralDeviceType.MEDIA_MANAGER)
			throw new Meteor.Error(
				400,
				`Device "${peripheralDevice._id}".type is "${peripheralDevice.type}", should be MEDIA_MANAGER `
			)
		if (!peripheralDevice.studioId)
			throw new Meteor.Error(400, 'Device "' + peripheralDevice._id + '" has no studio')

		check(workFlowId, String)
		check(obj, Match.Maybe(Object))

		if (obj) {
			check(obj._id, String)
			obj.deviceId = peripheralDevice._id
			obj.studioId = peripheralDevice.studioId

			await MediaWorkFlows.upsertAsync(workFlowId, obj)

			if (obj.finished && !obj.success) {
				logger.info('mm job failed')
			} else if (obj.finished && obj.success) {
				logger.info('mm job success')
			}
		} else {
			await MediaWorkFlows.removeAsync(workFlowId)

			await MediaWorkFlowSteps.removeAsync({
				workFlowId: workFlowId,
			})
		}
	}

	export async function updateMediaWorkFlowStep(
		context: MethodContext,
		deviceId: PeripheralDeviceId,
		deviceToken: string,
		stepId: MediaWorkFlowStepId,
		obj: MediaWorkFlowStep | null
	): Promise<void> {
		const peripheralDevice = await checkAccessAndGetPeripheralDevice(deviceId, deviceToken, context)
		if (peripheralDevice.type !== PeripheralDeviceType.MEDIA_MANAGER)
			throw new Meteor.Error(
				400,
				`Device "${peripheralDevice._id}".type is "${peripheralDevice.type}", should be MEDIA_MANAGER `
			)
		if (!peripheralDevice.studioId)
			throw new Meteor.Error(400, 'Device "' + peripheralDevice._id + '" has no studio')

		check(stepId, String)
		check(obj, Match.Maybe(Object))

		if (obj) {
			check(obj._id, String)
			check(obj.workFlowId, String)

			const workflow = await MediaWorkFlows.findOneAsync(obj.workFlowId)

			if (!workflow) throw new Meteor.Error(404, `Workflow "${obj.workFlowId}" not found`)

			obj.workFlowId = workflow._id
			obj.deviceId = peripheralDevice._id
			obj.studioId = peripheralDevice.studioId

			await MediaWorkFlowSteps.upsertAsync(stepId, obj)
		} else {
			await MediaWorkFlowSteps.removeAsync(stepId)
		}
	}
}
