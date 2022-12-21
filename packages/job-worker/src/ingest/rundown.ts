import { ExtendedIngestRundown } from '@sofie-automation/blueprints-integration'
import { ShowStyleBaseId, ShowStyleVariantId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { DBShowStyleBase } from '@sofie-automation/corelib/dist/dataModel/ShowStyleBase'
import { ShowStyleCompound } from '@sofie-automation/corelib/dist/dataModel/ShowStyleCompound'
import { DBShowStyleVariant } from '@sofie-automation/corelib/dist/dataModel/ShowStyleVariant'
import { protectString } from '@sofie-automation/corelib/dist/protectedString'
import { logger } from '../logging'
import { createShowStyleCompound } from '../showStyles'
import _ = require('underscore')
import { StudioUserContext } from '../blueprints/context'
import { JobContext } from '../jobs'
import { stringifyError } from '@sofie-automation/corelib/dist/lib'
import { ReadonlyDeep } from 'type-fest'
import { convertShowStyleBaseToBlueprints, convertShowStyleVariantToBlueprints } from '../blueprints/context/lib'

export interface SelectedShowStyleVariant {
	variant: ReadonlyDeep<DBShowStyleVariant>
	base: ReadonlyDeep<DBShowStyleBase>
	compound: ReadonlyDeep<ShowStyleCompound>
}

export async function selectShowStyleVariant(
	context: JobContext,
	blueprintContext: StudioUserContext,
	ingestRundown: ExtendedIngestRundown
): Promise<SelectedShowStyleVariant | null> {
	const studio = blueprintContext.studio
	if (!studio.supportedShowStyleBase.length) {
		logger.debug(`Studio "${studio._id}" does not have any supportedShowStyleBase`)
		return null
	}

	const showStyleBases = await context.getShowStyleBases()
	let showStyleBase = _.first(showStyleBases)
	if (!showStyleBase) {
		logger.debug(
			`No showStyleBases matching with supportedShowStyleBase [${studio.supportedShowStyleBase}] from studio "${studio._id}"`
		)
		return null
	}

	const studioBlueprint = context.studioBlueprint
	if (!studioBlueprint) throw new Error(`Studio "${studio._id}" does not have a blueprint`)

	let showStyleId: ShowStyleBaseId | null = null
	try {
		showStyleId = protectString(
			studioBlueprint.blueprint.getShowStyleId(
				blueprintContext,
				showStyleBases.map(convertShowStyleBaseToBlueprints),
				ingestRundown
			)
		)
	} catch (err) {
		logger.error(`Error in studioBlueprint.getShowStyleId: ${stringifyError(err)}`)
		showStyleId = null
	}

	if (showStyleId === null) {
		logger.debug(`StudioBlueprint for studio "${studio._id}" returned showStyleId = null`)
		return null
	}
	showStyleBase = _.find(showStyleBases, (s) => s._id === showStyleId)
	if (!showStyleBase) {
		logger.debug(
			`No ShowStyleBase found matching showStyleId "${showStyleId}", from studio "${studio._id}" blueprint`
		)
		return null
	}

	const showStyleVariants = await context.getShowStyleVariants(showStyleBase._id)
	if (!showStyleVariants.length) throw new Error(`ShowStyleBase "${showStyleBase._id}" has no variants`)

	const showStyleBlueprint = await context.getShowStyleBlueprint(showStyleBase._id)
	if (!showStyleBlueprint) throw new Error(`ShowStyleBase "${showStyleBase._id}" does not have a valid blueprint`)

	let variantId: ShowStyleVariantId | null = null
	try {
		variantId = protectString(
			showStyleBlueprint.blueprint.getShowStyleVariantId(
				blueprintContext,
				showStyleVariants.map(convertShowStyleVariantToBlueprints),
				ingestRundown
			)
		)
	} catch (err) {
		logger.error(`Error in showStyleBlueprint.getShowStyleVariantId: ${stringifyError(err)}`)
		variantId = null
	}

	if (variantId === null) {
		logger.debug(`StudioBlueprint for studio "${studio._id}" returned variantId = null in .getShowStyleVariantId`)
		return null
	} else {
		const showStyleVariant = _.find(showStyleVariants, (s) => s._id === variantId)
		if (!showStyleVariant) throw new Error(`Blueprint returned variantId "${variantId}", which was not found!`)

		const compound = createShowStyleCompound(showStyleBase, showStyleVariant)
		if (!compound) throw new Error(`no showStyleCompound for "${showStyleVariant._id}"`)

		return {
			variant: showStyleVariant,
			base: showStyleBase,
			compound,
		}
	}
}
