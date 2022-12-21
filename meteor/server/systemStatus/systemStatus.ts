import { Meteor } from 'meteor/meteor'
import { PeripheralDevices, PeripheralDevice, PeripheralDeviceType } from '../../lib/collections/PeripheralDevices'
import { getCurrentTime, Time, getRandomId, assertNever, literal } from '../../lib/lib'
import { PeripheralDeviceAPI } from '../../lib/api/peripheralDevice'
import {
	parseVersion,
	parseCoreIntegrationCompatabilityRange,
	stripVersion,
	compareSemverVersions,
	isPrerelease,
} from '../../lib/collections/CoreSystem'
import {
	StatusResponse,
	CheckObj,
	ExternalStatus,
	CheckError,
	SystemInstanceId,
	Component,
} from '../../lib/api/systemStatus'
import { getRelevantSystemVersions } from '../coreSystem'
import { StudioId } from '../../lib/collections/Studios'
import { Settings } from '../../lib/Settings'
import { StudioReadAccess } from '../security/studio'
import { OrganizationReadAccess } from '../security/organization'
import { resolveCredentials, Credentials } from '../security/lib/credentials'
import { SystemReadAccess } from '../security/system'
import { StatusCode } from '@sofie-automation/blueprints-integration'
import { Workers } from '../../lib/collections/Workers'
import { WorkerThreadStatuses } from '../../lib/collections/WorkerThreads'

const PackageInfo = require('../../package.json')
const integrationVersionRange = parseCoreIntegrationCompatabilityRange(PackageInfo.version)
const integrationVersionAllowPrerelease = isPrerelease(PackageInfo.version)

// Any libraries that if a gateway uses should match a certain version
const expectedLibraryVersions: { [libName: string]: string } = {
	'superfly-timeline': stripVersion(require('superfly-timeline/package.json').version),
	// eslint-disable-next-line node/no-extraneous-require
	'mos-connection': stripVersion(require('mos-connection/package.json').version),
}

/**
 * Handling of system statuses
 */

export interface StatusObject {
	studioId?: StudioId
	statusCode: StatusCode
	messages?: Array<string>
}
export interface StatusObjectInternal {
	studioId?: StudioId
	statusCode: StatusCode
	/** Timestamp when statusCode was last changed */
	timestamp: Time
	messages: Array<{
		message: string
		/** Timestamp when message appeared first */
		timestamp: Time
	}>
}

function getSystemStatusForDevice(device: PeripheralDevice): StatusResponse {
	const deviceStatus: StatusCode = device.status.statusCode
	const deviceStatusMessages: Array<string> = device.status.messages || []

	const checks: Array<CheckObj> = []
	const pushStatusAsCheck = (name: string, statusCode: StatusCode, messages: string[]) => {
		checks.push({
			description: `expectedVersion.${name}`,
			status: status2ExternalStatus(statusCode),
			updated: new Date(device.lastSeen).toISOString(),
			_status: statusCode,
			errors: messages.map((message: string): CheckError => {
				return {
					type: 'version-differ',
					time: new Date(device.lastSeen).toISOString(),
					message: message,
				}
			}),
		})
	}

	if (deviceStatus === StatusCode.GOOD && !device.disableVersionChecks) {
		if (!device.versions) device.versions = {}
		const deviceVersions = device.versions

		// Check core-integration version is as expected
		if (
			device.subType === PeripheralDeviceAPI.SUBTYPE_PROCESS ||
			deviceVersions['@sofie-automation/server-core-integration']
		) {
			const integrationVersion = parseVersion(deviceVersions['@sofie-automation/server-core-integration'])
			const checkMessage = compareSemverVersions(
				integrationVersion,
				integrationVersionRange,
				integrationVersionAllowPrerelease,
				`Device has to be updated`,
				`Device "${device.name}"`,
				'@sofie-automation/server-core-integration'
			)
			pushStatusAsCheck(
				'@sofie-automation/server-core-integration',
				checkMessage.statusCode,
				checkMessage.messages
			)
		}

		// Check blueprint-integration version is as expected, if it exposes that
		if (deviceVersions['@sofie-automation/blueprint-integration']) {
			const integrationVersion = parseVersion(deviceVersions['@sofie-automation/blueprint-integration'])
			const checkMessage = compareSemverVersions(
				integrationVersion,
				integrationVersionRange,
				integrationVersionAllowPrerelease,
				`Device has to be updated`,
				`Device "${device.name}"`,
				'@sofie-automation/blueprint-integration'
			)
			pushStatusAsCheck('@sofie-automation/blueprint-integration', checkMessage.statusCode, checkMessage.messages)
		}

		// check for any known libraries
		for (const [libName, targetVersion] of Object.entries(expectedLibraryVersions)) {
			if (deviceVersions[libName] && targetVersion !== '0.0.0') {
				const deviceLibVersion = parseVersion(deviceVersions[libName])
				const checkMessage = compareSemverVersions(
					deviceLibVersion,
					targetVersion,
					integrationVersionAllowPrerelease,
					`Device has mismatched library version`,
					`Device "${device.name}"`,
					libName
				)
				pushStatusAsCheck(libName, checkMessage.statusCode, checkMessage.messages)
			}
		}
	}
	const so: StatusResponse = {
		name: device.name,
		instanceId: device._id,
		status: 'UNDEFINED',
		updated: new Date(device.lastSeen).toISOString(),
		_status: deviceStatus,
		documentation: '',
		statusMessage: deviceStatusMessages.length ? deviceStatusMessages.join(', ') : undefined,
		_internal: {
			// statusCode: deviceStatus,
			statusCodeString: StatusCode[deviceStatus],
			messages: deviceStatusMessages,
			versions: device.versions || {},
		},
		checks: checks,
	}
	if (device.type === PeripheralDeviceType.MOS) {
		so.documentation = 'https://github.com/nrkno/tv-automation-mos-gateway'
	} else if (device.type === PeripheralDeviceType.SPREADSHEET) {
		so.documentation = 'https://github.com/SuperFlyTV/spreadsheet-gateway'
	} else if (device.type === PeripheralDeviceType.PLAYOUT) {
		so.documentation = 'https://github.com/nrkno/tv-automation-playout-gateway'
	} else if (device.type === PeripheralDeviceType.MEDIA_MANAGER) {
		so.documentation = 'https://github.com/nrkno/tv-automation-media-management'
	} else if (device.type === PeripheralDeviceType.INEWS) {
		so.documentation = 'https://github.com/olzzon/tv2-inews-ftp-gateway'
	} else if (device.type === PeripheralDeviceType.PACKAGE_MANAGER) {
		so.documentation = 'https://github.com/nrkno/tv-automation-package-manager'
	} else {
		assertNever(device.type)
	}

	return so
}

/**
 * Returns system status
 * @param studioId (Optional) If provided, limits the status to what's affecting the studio
 */
export async function getSystemStatus(cred0: Credentials, studioId?: StudioId): Promise<StatusResponse> {
	const checks: Array<CheckObj> = []

	await SystemReadAccess.systemStatus(cred0)

	// Check systemStatuses:
	for (const [key, status] of Object.entries(systemStatuses)) {
		checks.push({
			description: key,
			status: status2ExternalStatus(status.statusCode),
			updated: new Date(status.timestamp).toISOString(),
			_status: status.statusCode,
			errors: status.messages.map((m): CheckError => {
				return {
					type: 'message',
					time: new Date(m.timestamp).toISOString(),
					message: m.message,
				}
			}),
		})
	}

	const statusObj: StatusResponse = {
		name: 'Sofie Automation system',
		instanceId: instanceId,
		updated: new Date(getCurrentTime()).toISOString(),
		status: 'UNDEFINED',
		_status: StatusCode.UNKNOWN,
		documentation: 'https://github.com/nrkno/sofie-core',
		_internal: {
			// this _internal is set later
			statusCodeString: StatusCode[StatusCode.UNKNOWN],
			messages: [],
			versions: {},
		},
		checks: checks,
	}

	// Check status of workers
	const workerStatuses = await Workers.findFetchAsync({})
	if (workerStatuses.length) {
		for (const workerStatus of workerStatuses) {
			if (!statusObj.components) statusObj.components = []
			const status = workerStatus.connected ? StatusCode.GOOD : StatusCode.BAD
			statusObj.components.push(
				literal<Component>({
					name: `worker-${workerStatus.name}`,
					status: workerStatus.connected ? 'OK' : 'FAIL',
					updated: new Date().toISOString(),
					_status: status,
					_internal: {
						statusCodeString: StatusCode[status],
						messages: [workerStatus.status],
						versions: {},
					},
				})
			)

			const statuses = await WorkerThreadStatuses.findFetchAsync({ workerId: workerStatus._id })
			for (const wts of statuses) {
				if (!statusObj.components) statusObj.components = []
				statusObj.components.push(
					literal<Component>({
						name: `worker-${wts.name}`,
						status: status2ExternalStatus(wts.statusCode),
						updated: new Date().toISOString(),
						_status: wts.statusCode,
						_internal: {
							statusCodeString: StatusCode[status],
							messages: [wts.reason],
							versions: {},
						},
					})
				)
			}
		}
	}

	// Check status of devices:
	let devices: PeripheralDevice[] = []
	if (studioId) {
		// Check status for a certain studio:

		if (!(await StudioReadAccess.studioContent(studioId, cred0))) {
			throw new Meteor.Error(403, `Not allowed`)
		}
		devices = await PeripheralDevices.findFetchAsync({ studioId: studioId })
	} else {
		if (Settings.enableUserAccounts) {
			// Check status for the user's studios:

			const cred = await resolveCredentials(cred0)
			if (!cred.organizationId) throw new Meteor.Error(500, 'user has no organization')
			if (!(await OrganizationReadAccess.organizationContent(cred.organizationId, cred))) {
				throw new Meteor.Error(403, `Not allowed`)
			}
			devices = await PeripheralDevices.findFetchAsync({ organizationId: cred.organizationId })
		} else {
			// Check status for all studios:

			devices = await PeripheralDevices.findFetchAsync({})
		}
	}
	for (const device of devices) {
		const so = getSystemStatusForDevice(device)

		if (!statusObj.components) statusObj.components = []
		statusObj.components.push(so)
	}

	const systemStatus: StatusCode = setStatus(statusObj)
	statusObj._internal = {
		// statusCode: systemStatus,
		statusCodeString: StatusCode[systemStatus],
		messages: collectMesages(statusObj),
		versions: getRelevantSystemVersions(),
	}
	statusObj.statusMessage = statusObj._internal.messages.join(', ')

	return statusObj
}
export function setSystemStatus(type: string, status: StatusObject): void {
	let systemStatus: StatusObjectInternal = systemStatuses[type]
	if (!systemStatus) {
		systemStatus = {
			statusCode: StatusCode.UNKNOWN,
			timestamp: 0,
			messages: [],
		}
		systemStatuses[type] = systemStatus
	}

	if (systemStatus.statusCode !== status.statusCode) {
		systemStatus.statusCode = status.statusCode
		systemStatus.timestamp = getCurrentTime()
	}

	const messages: Array<{
		message: string
		timestamp: Time
	}> = []
	if (status.messages) {
		for (const message of status.messages) {
			const existingMessage = systemStatus.messages.find((m) => m.message === message)
			if (existingMessage) {
				messages.push(existingMessage)
			} else {
				messages.push({
					message: message,
					timestamp: getCurrentTime(),
				})
			}
		}
	}
	systemStatus.messages = messages
}
export function removeSystemStatus(type: string): void {
	delete systemStatuses[type]
}
/** Random id for this running instance of core */
const instanceId: SystemInstanceId = getRandomId()
/** Map of surrent system statuses */
const systemStatuses: { [key: string]: StatusObjectInternal } = {}
function setStatus(statusObj: StatusResponse | Component): StatusCode {
	let s: StatusCode = statusObj._status

	if (statusObj.checks) {
		for (const check of statusObj.checks) {
			if (check._status > s) s = check._status
		}
	}
	if (statusObj.components) {
		for (const component of statusObj.components) {
			const s2: StatusCode = setStatus(component)
			if (s2 > s) s = s2
		}
	}
	statusObj.status = status2ExternalStatus(s)
	statusObj._status = s
	return s
}
function collectMesages(statusObj: StatusResponse | Component): Array<string> {
	const allMessages: Array<string> = []

	if (statusObj._internal) {
		allMessages.push(...statusObj._internal.messages)
	}
	if (statusObj.checks) {
		for (const check of statusObj.checks) {
			if (check._status !== StatusCode.GOOD && check.errors) {
				for (const errMsg of check.errors) {
					allMessages.push(`check ${check.description}: ${errMsg.message}`)
				}
			}
		}
	}
	if (statusObj.components) {
		for (const component of statusObj.components) {
			const messages = collectMesages(component)

			for (const msg of messages) {
				allMessages.push(`${component.name}: ${msg}`)
			}
		}
	}
	return allMessages
}
export function status2ExternalStatus(statusCode: StatusCode): ExternalStatus {
	if (statusCode === StatusCode.GOOD) {
		return 'OK'
	} else if (statusCode === StatusCode.WARNING_MINOR || statusCode === StatusCode.WARNING_MAJOR) {
		return 'WARNING'
	} else if (statusCode === StatusCode.BAD || statusCode === StatusCode.FATAL) {
		return 'FAIL'
	}
	return 'UNDEFINED'
}
