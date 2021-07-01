import * as React from 'react'
import * as _ from 'underscore'
import {
	DashboardLayoutPlaylistName,
	DashboardLayoutTextLabel,
	RundownLayoutBase,
	RundownLayoutPlaylistName,
	RundownLayoutTextLabel,
} from '../../../lib/collections/RundownLayouts'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { dashboardElementPosition } from './DashboardPanel'
import { RundownLayoutsAPI } from '../../../lib/api/rundownLayouts'
import { withTracker } from '../../lib/ReactMeteorData/ReactMeteorData'
import { Rundown } from '../../../lib/collections/Rundowns'

interface IPlaylistNamePanelProps {
	visible?: boolean
	layout: RundownLayoutBase
	panel: RundownLayoutPlaylistName
	playlist: RundownPlaylist
}

interface IState {}

interface IPlaylistNamePannelTrackedProps {
	currentRundown?: Rundown
}

class PlaylistNamePanelInner extends MeteorReactComponent<
	IPlaylistNamePanelProps & IPlaylistNamePannelTrackedProps,
	IState
> {
	constructor(props) {
		super(props)
	}

	render() {
		const isDashboardLayout = RundownLayoutsAPI.isDashboardLayout(this.props.layout)
		let { panel } = this.props

		return (
			<div
				className="playlist-name-panel"
				style={_.extend(
					isDashboardLayout
						? {
								...dashboardElementPosition({ ...(this.props.panel as DashboardLayoutPlaylistName), height: 1 }),
								fontSize: ((panel as DashboardLayoutPlaylistName).scale || 1) * 1.5 + 'em',
						  }
						: {}
				)}
			>
				<span className="playlist-name">{this.props.playlist.name}</span>
				{this.props.panel.showCurrentRundownName && this.props.currentRundown && (
					<span className="rundown-name">{this.props.currentRundown.name}</span>
				)}
			</div>
		)
	}
}

export const PlaylistNamePanel = withTracker<IPlaylistNamePanelProps, IState, IPlaylistNamePannelTrackedProps>(
	(props: IPlaylistNamePanelProps) => {
		if (props.playlist.currentPartInstanceId) {
			let livePart = props.playlist.getActivePartInstances({ _id: props.playlist.currentPartInstanceId })[0]
			let currentRundown = props.playlist.getRundowns({ _id: livePart.rundownId })[0]

			return {
				currentRundown,
			}
		}

		return {}
	}
)(PlaylistNamePanelInner)
