import React, { useEffect, useState, useLayoutEffect } from 'react'
import { useSubscription, useTracker } from '../../lib/ReactMeteorData/react-meteor-data'
import { Time, unprotectString } from '../../../lib/lib'
import { UserActionsLog, UserActionsLogItem } from '../../../lib/collections/UserActionsLog'
import { DatePickerFromTo } from '../../lib/datePicker'
import moment from 'moment'
import { PubSub } from '../../../lib/api/pubsub'
import { useTranslation } from 'react-i18next'
import { parse as queryStringParse } from 'query-string'
import { Link, useHistory, useLocation } from 'react-router-dom'
import classNames from 'classnames'
import Tooltip from 'rc-tooltip'

const PARAM_DATE_FORMAT = 'YYYY-MM-DD'
const PARAM_NAME_FROM_DATE = 'fromDate'

interface IUserActionsListProps {
	logItems: UserActionsLogItem[]
	startDate?: number
	highlighted?: string
	onItemClick?: (item: UserActionsLogItem) => void
	renderButtons?: (item: UserActionsLogItem) => React.ReactElement
}

function prettyPrintJsonString(str: string): string {
	try {
		return JSON.stringify(JSON.parse(str), undefined, 4)
	} catch (_e) {
		return str
	}
}

export function UserActionsList(props: IUserActionsListProps) {
	const { t } = useTranslation()

	function renderMessageHead() {
		return (
			<thead>
				<tr>
					<th className="c3 user-action-log__timestamp">{t('Timestamp')}</th>
					<th className="c3 user-action-log__executionTime">{t('Execution times')}</th>
					<th className="c1 user-action-log__userId">{t('User ID')}</th>
					<th className="c2 user-action-log__clientAddress">{t('Client IP')}</th>
					<th className="c3 user-action-log__context">{t('Action')}</th>
					<th className="c3 user-action-log__method">{t('Method')}</th>
					<th className="c1 user-action-log__status">{t('Status')}</th>
					<th className="c1 user-action-log__args">{t('Parameters')}</th>
					{props.renderButtons ? <th className="c1 user-action-log__buttons"></th> : null}
				</tr>
			</thead>
		)
	}

	return (
		<table className="table user-action-log">
			{renderMessageHead()}
			<tbody>
				{props.logItems.map((msg) => {
					const formattedTimestamp = moment(msg.timestamp).format('YYYY/MM/DD HH:mm:ss.SSS')
					const anchorId = `t${msg.timestamp}`
					const selfLink = `${location.pathname}?${PARAM_NAME_FROM_DATE}=${moment(props.startDate).format(
						PARAM_DATE_FORMAT
					)}#${anchorId}`
					return (
						<tr
							className={classNames({
								clickable: props.onItemClick,
								hl: props.highlighted === anchorId,
							})}
							key={unprotectString(msg._id)}
							onClick={() => props.onItemClick && props.onItemClick(msg)}
						>
							<td className="user-action-log__timestamp">
								<Link id={anchorId} to={selfLink}>
									{formattedTimestamp}
								</Link>
							</td>
							<td className="user-action-log__executionTime">
								<table>
									<tbody>
										{msg.clientTime ? (
											<tr>
												<td>
													<Tooltip
														overlay={t('Time from platform user event to Action received by Core')}
														placement="top"
														align="left"
													>
														<span>{t('GUI')}:</span>
													</Tooltip>
												</td>
												<td>{Math.round((msg.timestamp - msg.clientTime) * 100) / 100} ms</td>
											</tr>
										) : null}
										{msg.executionTime ? (
											<tr>
												<td>
													<Tooltip overlay={t('Core + Worker processing time')} placement="top" align="left">
														<span>{t('Core')}:</span>
													</Tooltip>
												</td>
												<td>{msg.executionTime} ms</td>
											</tr>
										) : null}
										{msg.workerTime ? (
											<tr>
												<td>{t('Worker')}:</td>
												<td>{msg.workerTime} ms</td>
											</tr>
										) : null}
										{msg.gatewayDuration ? (
											<tr>
												<td>{t('Gateway')}:</td>
												<td>{msg.gatewayDuration.join(', ')} ms</td>
											</tr>
										) : null}
										{msg.timelineResolveDuration ? (
											<tr>
												<td>{t('TSR')}:</td>
												<td>{msg.timelineResolveDuration.join(', ')} ms</td>
											</tr>
										) : null}
									</tbody>
								</table>
							</td>
							<td className="user-action-log__userId">{msg.userId}</td>
							<td className="user-action-log__clientAddress">{msg.clientAddress}</td>
							<td className="user-action-log__context">{msg.context}</td>
							<td className="user-action-log__method">{msg.method}</td>
							<td className="user-action-log__status">
								{msg.success ? 'Success' : msg.success === false ? 'Error: ' + msg.errorMessage : null}
							</td>
							<td className="user-action-log__args">{prettyPrintJsonString(msg.args)}</td>
							{props.renderButtons ? <td className="user-action-log__buttons">{props.renderButtons(msg)}</td> : null}
						</tr>
					)
				})}
			</tbody>
		</table>
	)
}

function UserActivity() {
	const { t } = useTranslation()

	const [dateFrom, setDateFrom] = useState<Time>(moment().startOf('day').valueOf())
	const [dateTo, setDateTo] = useState<Time>(moment().add(1, 'days').startOf('day').valueOf())

	useSubscription(PubSub.userActionsLog, {
		timestamp: {
			$gte: dateFrom,
			$lt: dateTo,
		},
	})

	const log = useTracker(
		() =>
			UserActionsLog.find(
				{},
				{
					sort: {
						timestamp: 1,
					},
				}
			).fetch(),
		[],
		[]
	)

	const location = useLocation()
	const history = useHistory()

	useEffect(() => {
		const queryParams = queryStringParse(location.search, {
			arrayFormat: 'comma',
		})

		const qsStartDate = moment(queryParams[PARAM_NAME_FROM_DATE], PARAM_DATE_FORMAT, true)

		if (qsStartDate.isValid()) {
			setDateFrom(qsStartDate.startOf('day').valueOf())
			setDateTo(qsStartDate.add(1, 'days').startOf('day').valueOf())
		}
	}, [location])

	function onDateChange(from: Time, to: Time) {
		setDateFrom(from)
		setDateTo(to)
		location.search = `?${PARAM_NAME_FROM_DATE}=` + moment(from).format(PARAM_DATE_FORMAT)
		history.replace(location)
	}

	const logItems = log.filter(({ timestamp }) => timestamp >= dateFrom && timestamp < dateTo)

	const [highlighted, setHighlighted] = useState<string | undefined>(undefined)

	function renderUserActivity() {
		return (
			<div>
				<div className="paging">
					<DatePickerFromTo from={dateFrom} to={dateTo} onChange={onDateChange} />
				</div>
				<UserActionsList logItems={logItems} startDate={dateFrom} highlighted={highlighted} />
			</div>
		)
	}

	useLayoutEffect(() => {
		const targetId = location.hash ? location.hash.substring(1) : undefined
		if (highlighted !== targetId && logItems.length && targetId) {
			const targetElement = document.getElementById(targetId)
			if (!targetElement) return
			targetElement.scrollIntoView()
			setHighlighted(targetId)
		}
	}, [location, location.hash, highlighted, logItems.length])

	return (
		<div className="mhl gutter external-message-status">
			<header className="mbs">
				<h1>{t('User Activity Log')}</h1>
			</header>
			<div className="mod mvl">{renderUserActivity()}</div>
		</div>
	)
}

export { UserActivity }
