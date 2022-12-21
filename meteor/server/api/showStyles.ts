import { check } from '../../lib/check'
import { registerClassToMeteorMethods } from '../methods'
import { NewShowStylesAPI, ShowStylesAPIMethods } from '../../lib/api/showStyles'
import { Meteor } from 'meteor/meteor'
import { ShowStyleBases, ShowStyleBase, ShowStyleBaseId } from '../../lib/collections/ShowStyleBases'
import {
	ShowStyleVariants,
	ShowStyleVariantId,
	ShowStyleCompound,
	ShowStyleVariant,
} from '../../lib/collections/ShowStyleVariants'
import { protectString, getRandomId } from '../../lib/lib'
import { RundownLayouts } from '../../lib/collections/RundownLayouts'
import { MethodContextAPI, MethodContext } from '../../lib/api/methods'
import { OrganizationContentWriteAccess } from '../security/organization'
import { ShowStyleContentWriteAccess } from '../security/showStyle'
import { Credentials } from '../security/lib/credentials'
import { OrganizationId } from '../../lib/collections/Organization'
import deepmerge from 'deepmerge'
import { ShowStyleBaseLight } from '../../lib/collections/optimizations'
import { IBlueprintConfig } from '@sofie-automation/blueprints-integration'

export async function getShowStyleCompound(
	showStyleVariantId: ShowStyleVariantId
): Promise<ShowStyleCompound | undefined> {
	const showStyleVariant = await ShowStyleVariants.findOneAsync(showStyleVariantId)
	if (!showStyleVariant) return undefined
	const showStyleBase = await ShowStyleBases.findOneAsync(showStyleVariant.showStyleBaseId)
	if (!showStyleBase) return undefined

	return createShowStyleCompound(showStyleBase, showStyleVariant)
}

export function createShowStyleCompound(
	showStyleBase: ShowStyleBase,
	showStyleVariant: ShowStyleVariant
): ShowStyleCompound | undefined {
	if (showStyleBase._id !== showStyleVariant.showStyleBaseId) return undefined

	const configs = deepmerge(showStyleBase.blueprintConfig, showStyleVariant.blueprintConfig, {
		arrayMerge: (_destinationArray, sourceArray, _options) => sourceArray,
	})

	return {
		...showStyleBase,
		showStyleVariantId: showStyleVariant._id,
		name: `${showStyleBase.name}-${showStyleVariant.name}`,
		blueprintConfig: configs,
		_rundownVersionHash: showStyleBase._rundownVersionHash,
		_rundownVersionHashVariant: showStyleVariant._rundownVersionHash,
	}
}

export async function insertShowStyleBase(context: MethodContext | Credentials): Promise<ShowStyleBaseId> {
	const access = await OrganizationContentWriteAccess.showStyleBase(context)
	return insertShowStyleBaseInner(access.organizationId)
}
export async function insertShowStyleBaseInner(organizationId: OrganizationId | null): Promise<ShowStyleBaseId> {
	const showStyleBase: ShowStyleBase = {
		_id: getRandomId(),
		name: 'New show style',
		organizationId: organizationId,
		blueprintId: protectString(''),
		outputLayers: [],
		sourceLayers: [],
		blueprintConfig: {},
		_rundownVersionHash: '',
	}
	ShowStyleBases.insert(showStyleBase)
	await insertShowStyleVariantInner(showStyleBase, 'Default')
	return showStyleBase._id
}
export async function insertShowStyleVariant(
	context: MethodContext | Credentials,
	showStyleBaseId: ShowStyleBaseId,
	name?: string
): Promise<ShowStyleVariantId> {
	check(showStyleBaseId, String)

	const access = await ShowStyleContentWriteAccess.anyContent(context, showStyleBaseId)
	const showStyleBase = access.showStyleBase
	if (!showStyleBase) throw new Meteor.Error(404, `showStyleBase "${showStyleBaseId}" not found`)

	return insertShowStyleVariantInner(showStyleBase, name)
}
export async function insertShowStyleVariantWithProperties(
	context: MethodContext | Credentials,
	showStyleVariant: ShowStyleVariant,
	id?: ShowStyleVariantId
): Promise<ShowStyleVariantId> {
	const access = await ShowStyleContentWriteAccess.anyContent(context, showStyleVariant.showStyleBaseId)
	const showStyleBase = access.showStyleBase
	if (!showStyleBase) throw new Meteor.Error(404, `showStyleBase "${showStyleVariant.showStyleBaseId}" not found`)

	return insertShowStyleVariantInner(showStyleBase, showStyleVariant.name, id, showStyleVariant.blueprintConfig)
}
export async function insertShowStyleVariantInner(
	showStyleBase: ShowStyleBaseLight,
	name?: string,
	id?: ShowStyleVariantId,
	blueprintConfig?: IBlueprintConfig
): Promise<ShowStyleVariantId> {
	return ShowStyleVariants.insertAsync({
		_id: id || getRandomId(),
		showStyleBaseId: showStyleBase._id,
		name: name || 'Variant',
		blueprintConfig: blueprintConfig || {},
		_rundownVersionHash: '',
	})
}
export async function removeShowStyleBase(context: MethodContext, showStyleBaseId: ShowStyleBaseId): Promise<void> {
	check(showStyleBaseId, String)
	const access = await ShowStyleContentWriteAccess.anyContent(context, showStyleBaseId)
	const showStyleBase = access.showStyleBase
	if (!showStyleBase) throw new Meteor.Error(404, `showStyleBase "${showStyleBaseId}" not found`)

	await Promise.allSettled([
		ShowStyleBases.removeAsync(showStyleBase._id),
		ShowStyleVariants.removeAsync({
			showStyleBaseId: showStyleBase._id,
		}),
		RundownLayouts.removeAsync({
			showStyleBaseId: showStyleBase._id,
		}),
	])
}
export async function removeShowStyleVariant(
	context: MethodContext,
	showStyleVariantId: ShowStyleVariantId
): Promise<void> {
	check(showStyleVariantId, String)

	const access = await ShowStyleContentWriteAccess.showStyleVariant(context, showStyleVariantId)
	const showStyleVariant = access.showStyleVariant
	if (!showStyleVariant) throw new Meteor.Error(404, `showStyleVariant "${showStyleVariantId}" not found`)

	await ShowStyleVariants.removeAsync(showStyleVariant._id)
}

class ServerShowStylesAPI extends MethodContextAPI implements NewShowStylesAPI {
	async insertShowStyleBase() {
		return insertShowStyleBase(this)
	}
	async insertShowStyleVariant(showStyleBaseId: ShowStyleBaseId) {
		return insertShowStyleVariant(this, showStyleBaseId)
	}
	async insertShowStyleVariantWithProperties(showStyleVariant: ShowStyleVariant, id?: ShowStyleVariantId) {
		return insertShowStyleVariantWithProperties(this, showStyleVariant, id)
	}
	async removeShowStyleBase(showStyleBaseId: ShowStyleBaseId) {
		return removeShowStyleBase(this, showStyleBaseId)
	}
	async removeShowStyleVariant(showStyleVariantId: ShowStyleVariantId) {
		return removeShowStyleVariant(this, showStyleVariantId)
	}
}
registerClassToMeteorMethods(ShowStylesAPIMethods, ServerShowStylesAPI, false)
