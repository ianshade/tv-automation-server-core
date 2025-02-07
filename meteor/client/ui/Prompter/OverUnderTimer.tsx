import * as React from 'react'
import { withTiming, WithTiming } from '../RundownView/RundownTiming/withTiming'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { RundownUtils } from '../../lib/rundown'
import ClassNames from 'classnames'
import { PlaylistTiming } from '../../../lib/rundown/rundownTiming'

interface IProps {
	rundownPlaylist: RundownPlaylist
	style?: React.CSSProperties | undefined
}

/**
 * Shows an over/under timer for the rundownPlaylist. Requires a RundownTimingContext from the RundownTimingProvider
 */
export const OverUnderTimer = withTiming<IProps, {}>()(function OverUnderTimer({
	rundownPlaylist,
	style,
	timingDurations,
}: WithTiming<IProps>) {
	const overUnderClock = PlaylistTiming.getDiff(rundownPlaylist, timingDurations) ?? 0

	return (
		<span
			style={style}
			className={ClassNames('prompter-timing-clock heavy-light', {
				heavy: Math.floor(overUnderClock / 1000) < 0,
				light: Math.floor(overUnderClock / 1000) >= 0,
			})}
		>
			{RundownUtils.formatDiffToTimecode(overUnderClock, true, false, true, true, true, undefined, true, true)}
		</span>
	)
})
