import React, { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipTrimPanel } from './ClipTrimPanel'
import { VTContent } from '@sofie-automation/blueprints-integration'
import { ModalDialog, SomeEvent } from '../../lib/ModalDialog'
import { doUserAction, UserAction } from '../../../lib/clientUserAction'
import { MeteorCall } from '../../../lib/api/methods'
import { NotificationCenter, Notification, NoticeLevel } from '../../../lib/notifications/notifications'
import { protectString } from '../../../lib/lib'
import { stringifyError } from '@sofie-automation/shared-lib/dist/lib/stringifyError'
import { ClientAPI } from '../../../lib/api/client'
import { Rundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'
import { PieceInstancePiece } from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import { UIStudio } from '../../../lib/api/studios'
import { RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'

export interface IProps {
	playlistId: RundownPlaylistId
	rundown: Rundown
	studio: UIStudio
	selectedPiece: PieceInstancePiece

	onClose?: () => void
}

interface IState {
	inPoint: number
	duration: number
}

export function ClipTrimDialog({
	playlistId,
	rundown,
	studio,
	selectedPiece,

	onClose,
}: IProps): JSX.Element {
	const { t } = useTranslation()

	const vtContent = selectedPiece.content as VTContent | undefined

	const [state, setState] = useState<IState>(() => ({
		inPoint: vtContent?.editable?.editorialStart ?? 0,
		duration: vtContent?.editable?.editorialDuration ?? 0,
	}))

	const handleChange = useCallback((inPoint: number, duration: number) => {
		setState({
			inPoint,
			duration,
		})
	}, [])

	const handleAccept = useCallback((e: SomeEvent) => {
		onClose && onClose()

		doUserAction(
			t,
			e,
			UserAction.SET_IN_OUT_POINTS,
			(e, ts) =>
				MeteorCall.userAction.setInOutPoints(
					e,
					ts,
					playlistId,
					selectedPiece.startPartId,
					selectedPiece._id,
					state.inPoint,
					state.duration
				),
			(err) => {
				clearTimeout(pendingInOutPoints)

				if (
					ClientAPI.isClientResponseError(err) &&
					err.error.rawError &&
					stringifyError(err.error.rawError).match(/timed out/)
				) {
					NotificationCenter.push(
						new Notification(
							undefined,
							NoticeLevel.CRITICAL,
							(
								<>
									<strong>{selectedPiece.name}</strong>:&ensp;
									{t(
										"Trimming this clip has timed out. It's possible that the story is currently locked for writing in {{nrcsName}} and will eventually be updated. Make sure that the story is not being edited by other users.",
										{ nrcsName: rundown?.externalNRCSName || 'NRCS' }
									)}
								</>
							),
							protectString('ClipTrimDialog')
						)
					)
				} else if (ClientAPI.isClientResponseError(err) || err) {
					NotificationCenter.push(
						new Notification(
							undefined,
							NoticeLevel.CRITICAL,
							(
								<>
									<strong>{selectedPiece.name}</strong>:&ensp;
									{t('Trimming this clip has failed due to an error: {{error}}.', {
										error: err.message || err.error || err,
									})}
								</>
							),
							protectString('ClipTrimDialog')
						)
					)
				} else {
					NotificationCenter.push(
						new Notification(
							undefined,
							NoticeLevel.NOTIFICATION,
							(
								<>
									<strong>{selectedPiece.name}</strong>:&ensp;
									{t('Trimmed succesfully.')}
								</>
							),
							protectString('ClipTrimDialog')
						)
					)
				}

				return false // do not use default doUserAction failure handler
			}
		)
		const pendingInOutPoints = setTimeout(() => {
			NotificationCenter.push(
				new Notification(
					undefined,
					NoticeLevel.WARNING,
					(
						<>
							<strong>{selectedPiece.name}</strong>:&ensp;
							{t(
								"Trimming this clip is taking longer than expected. It's possible that the story is locked for writing in {{nrcsName}}.",
								{ nrcsName: rundown?.externalNRCSName || 'NRCS' }
							)}
						</>
					),
					protectString('ClipTrimDialog')
				)
			)
		}, 5 * 1000)
	}, [])

	return (
		<ModalDialog
			title={t('Trim "{{name}}"', { name: selectedPiece.name })}
			show={true}
			acceptText={t('OK')}
			secondaryText={t('Cancel')}
			onAccept={handleAccept}
			onDiscard={onClose}
			onSecondary={onClose}
			className="big"
		>
			<ClipTrimPanel
				studio={studio}
				rundownId={rundown._id}
				pieceId={selectedPiece._id}
				inPoint={state.inPoint}
				duration={state.duration}
				onChange={handleChange}
			/>
		</ModalDialog>
	)
}
