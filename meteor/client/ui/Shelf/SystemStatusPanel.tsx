import * as React from 'react'
import * as _ from 'underscore'
import {
	DashboardLayoutSystemStatus,
	RundownLayoutBase,
	RundownLayoutSytemStatus,
} from '../../../lib/collections/RundownLayouts'
import { Translated, translateWithTracker } from '../../lib/ReactMeteorData/ReactMeteorData'
import { MeteorReactComponent } from '../../lib/MeteorReactComponent'
import { RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { dashboardElementPosition } from './DashboardPanel'
import { RundownLayoutsAPI } from '../../../lib/api/rundownLayouts'
import { RundownSystemStatus } from '../RundownView/RundownSystemStatus'
import { DBStudio } from '../../../lib/collections/Studios'
import { Rundown, RundownId } from '../../../lib/collections/Rundowns'

interface ISystemStatusPanelProps {
	studio: DBStudio
	visible?: boolean
	layout: RundownLayoutBase
	panel: RundownLayoutSytemStatus
	playlist: RundownPlaylist
}

interface IState {}

interface ISystemStatusPanelTrackedProps {
	firstRundown: Rundown | undefined
	rundownIds: RundownId[]
}

class SystemStatusPanelInner extends MeteorReactComponent<
	Translated<ISystemStatusPanelProps & ISystemStatusPanelTrackedProps>,
	IState
> {
	constructor(props) {
		super(props)
	}

	render() {
		const isDashboardLayout = RundownLayoutsAPI.isDashboardLayout(this.props.layout)
		let { t, panel } = this.props

		return (
			<div
				className="part-timing-panel timing"
				style={_.extend(
					isDashboardLayout
						? {
								...dashboardElementPosition({ ...(this.props.panel as DashboardLayoutSystemStatus), height: 1 }),
								fontSize: ((panel as DashboardLayoutSystemStatus).scale || 1) * 1.5 + 'em',
						  }
						: {}
				)}
			>
				<span className="timing-clock left">
					<span className="timing-clock-label">{t('System Status')}</span>
					<RundownSystemStatus
						studio={this.props.studio}
						playlist={this.props.playlist}
						rundownIds={this.props.rundownIds}
						firstRundown={this.props.firstRundown}
					/>
				</span>
			</div>
		)
	}
}

export const SystemStatusPanel = translateWithTracker<ISystemStatusPanelProps, IState, ISystemStatusPanelTrackedProps>(
	(props: ISystemStatusPanelProps) => {
		let rundownIds = props.playlist.getRundownIDs() ?? []
		let firstRundown = rundownIds.length ? props.playlist.getRundowns({ _id: rundownIds[0] })[0] : undefined
		return {
			rundownIds,
			firstRundown,
		}
	}
)(SystemStatusPanelInner)
