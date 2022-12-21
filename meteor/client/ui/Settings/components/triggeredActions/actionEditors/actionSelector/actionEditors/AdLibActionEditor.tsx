import * as React from 'react'
import _ from 'underscore'
import { useTranslation } from 'react-i18next'
import { PlayoutActions, SomeAction } from '@sofie-automation/blueprints-integration'
import { EditAttribute } from '../../../../../../../lib/EditAttribute'
import { useTracker } from '../../../../../../../lib/ReactMeteorData/ReactMeteorData'
import { RundownBaselineAdLibActions } from '../../../../../../../../lib/collections/RundownBaselineAdLibActions'
import { AdLibActions } from '../../../../../../../../lib/collections/AdLibActions'

export function AdLibActionEditor({
	action,
	onChange,
}: {
	action: SomeAction
	onChange: (newVal: Partial<typeof action>) => void
}) {
	const { t } = useTranslation()
	const allTriggerModes = useTracker(
		() => {
			return _.chain([
				...RundownBaselineAdLibActions.find().map((action) =>
					action.triggerModes?.map((triggerMode) => triggerMode.data)
				),
				...AdLibActions.find().map((action) => action.triggerModes?.map((triggerMode) => triggerMode.data)),
			])
				.flatten()
				.compact()
				.uniq()
				.value() as string[]
		},
		[],
		[]
	)

	// this Editor only renders for AdLib
	if (action.action !== PlayoutActions.adlib) return null

	return (
		<>
			<div className="mts">
				<EditAttribute
					className="form-control"
					modifiedClassName="bghl"
					type={'toggle'}
					label={t('Use Trigger Mode')}
					overrideDisplayValue={!!action.arguments}
					attribute={''}
					updateFunction={(_e, newVal) => {
						onChange({
							...action,
							arguments: newVal ? { triggerMode: '' } : null,
						})
					}}
				/>
			</div>
			{action.arguments && (
				<>
					<div className="mts">
						<label className="block">{t('Trigger Mode')}</label>
						<EditAttribute
							className="form-control input text-input input-m"
							type="dropdowntext"
							options={allTriggerModes}
							overrideDisplayValue={action.arguments.triggerMode}
							attribute={''}
							updateFunction={(_e, newVal) => {
								onChange({
									...action,
									arguments: {
										...action.arguments,
										triggerMode: newVal,
									},
								})
							}}
						/>
					</div>
				</>
			)}
		</>
	)
}
