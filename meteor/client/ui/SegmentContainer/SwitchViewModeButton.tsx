import Tooltip from 'rc-tooltip'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { getUseOnePartPerLine } from '../../lib/localStorage'
import { SegmentViewMode as SegmentViewModeIcon } from '../../lib/ui/icons/listView'

import { SegmentViewMode } from './SegmentViewModes'

export function getNextMode(currentMode: SegmentViewMode | undefined): SegmentViewMode {
	switch (currentMode) {
		case undefined:
		case SegmentViewMode.Timeline:
			return SegmentViewMode.Storyboard
		case SegmentViewMode.Storyboard:
			return getUseOnePartPerLine() ? SegmentViewMode.List : SegmentViewMode.Timeline
		case SegmentViewMode.List:
			return SegmentViewMode.Timeline
	}
}

export function SwitchViewModeButton({
	currentMode,
	onSwitchViewMode,
}: {
	currentMode: SegmentViewMode
	onSwitchViewMode?: (viewMode: SegmentViewMode) => void
}) {
	const { t } = useTranslation()

	const nextMode = getNextMode(currentMode)
	let label = t('Switch Segment View Mode')

	switch (nextMode) {
		case SegmentViewMode.Timeline:
			label = t('Switch to Timeline View')
			break
		case SegmentViewMode.Storyboard:
			label = t('Switch to Storyboard View')
			break
		case SegmentViewMode.List:
			label = t('Switch to List View')
			break
	}

	return (
		<Tooltip overlay={label} destroyTooltipOnHide>
			<button
				className="segment-timeline__switch-view-mode-button"
				onClick={() => onSwitchViewMode && onSwitchViewMode(nextMode)}
			>
				<SegmentViewModeIcon />
			</button>
		</Tooltip>
	)
}
