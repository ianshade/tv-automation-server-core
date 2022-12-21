import { meteorPublish, AutoFillSelector } from './lib'
import { PubSub } from '../../lib/api/pubsub'
import { Blueprints, Blueprint } from '../../lib/collections/Blueprints'
import { Evaluation, Evaluations } from '../../lib/collections/Evaluations'
import { SnapshotItem, Snapshots } from '../../lib/collections/Snapshots'
import { UserActionsLog, UserActionsLogItem } from '../../lib/collections/UserActionsLog'
import { OrganizationReadAccess } from '../security/organization'
import { FindOptions } from '../../lib/typings/meteor'
import { Organizations, DBOrganization } from '../../lib/collections/Organization'
import { isProtectedString } from '@sofie-automation/corelib/dist/protectedString'

meteorPublish(PubSub.organization, async function (selector0, token) {
	const { cred, selector } = await AutoFillSelector.organizationId(this.userId, selector0, token)
	const modifier: FindOptions<DBOrganization> = {
		fields: {
			name: 1,
			applications: 1,
			broadcastMediums: 1,
			userRoles: 1, // to not expose too much information consider [`userRoles.${this.userId}`]: 1, and a method/publication for getting all the roles, or limiting the returned roles based on requesting user's role
		},
	}
	if (
		isProtectedString(selector.organizationId) &&
		(!cred || (await OrganizationReadAccess.organizationContent(selector.organizationId, cred)))
	) {
		return Organizations.find({ _id: selector.organizationId }, modifier)
	}
	return null
})

meteorPublish(PubSub.blueprints, async function (selector0, token) {
	const { cred, selector } = await AutoFillSelector.organizationId<Blueprint>(this.userId, selector0, token)
	const modifier: FindOptions<Blueprint> = {
		fields: {
			code: 0,
		},
	}
	if (!cred || (await OrganizationReadAccess.organizationContent(selector.organizationId, cred))) {
		return Blueprints.find(selector, modifier)
	}
	return null
})
meteorPublish(PubSub.evaluations, async function (selector0, token) {
	const { cred, selector } = await AutoFillSelector.organizationId<Evaluation>(this.userId, selector0, token)
	if (!cred || (await OrganizationReadAccess.organizationContent(selector.organizationId, cred))) {
		return Evaluations.find(selector)
	}
	return null
})
meteorPublish(PubSub.snapshots, async function (selector0, token) {
	const { cred, selector } = await AutoFillSelector.organizationId<SnapshotItem>(this.userId, selector0, token)
	if (!cred || (await OrganizationReadAccess.organizationContent(selector.organizationId, cred))) {
		return Snapshots.find(selector)
	}
	return null
})
meteorPublish(PubSub.userActionsLog, async function (selector0, token) {
	const { cred, selector } = await AutoFillSelector.organizationId<UserActionsLogItem>(this.userId, selector0, token)
	if (!cred || (await OrganizationReadAccess.organizationContent(selector.organizationId, cred))) {
		return UserActionsLog.find(selector)
	}
	return null
})
