import { PieceLifespan, SourceLayerType } from '@sofie-automation/blueprints-integration'
import React, { useMemo } from 'react'
import { PartExtended, PieceExtended } from '../../../lib/Rundown'
import { findPieceExtendedToShowFromOrderedResolvedInstances } from '../PieceIcons/utils'
import { LinePartMainPiece } from './LinePartMainPiece/LinePartMainPiece'
import { OnAirLine } from './OnAirLine'
import { TakeLine } from './TakeLine'
import { LinePartTransitionPiece } from './LinePartTransitionPiece/LinePartTransitionPiece'
import { LinePartSecondaryPiece } from './LinePartSecondaryPiece/LinePartSecondaryPiece'
import { unprotectString } from '@sofie-automation/corelib/dist/protectedString'
import { OvertimeShadow } from './OvertimeShadow'
import { PartAutoNextMarker } from './PartAutoNextMarker'
import { PieceUi } from '../SegmentContainer/withResolvedSegment'
import StudioContext from '../RundownView/StudioContext'

const TIMELINE_DEFAULT_BASE = 30 * 1000

interface IProps {
	part: PartExtended
	isLive: boolean
	isNext: boolean
	isFinished: boolean
	currentPartWillAutonext: boolean
	hasAlreadyPlayed: boolean
	onPieceClick?: (item: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
	onPieceDoubleClick?: (item: PieceUi, e: React.MouseEvent<HTMLDivElement>) => void
}

const supportedSourceLayerTypes = new Set(
	Object.values(SourceLayerType).filter(
		// Support all types, apart from TRANSITION and also filter out the inverse-enum strings
		(val) => typeof val !== 'string' && val !== SourceLayerType.TRANSITION
	) as SourceLayerType[]
)

function findMainPiece(pieces: PieceExtended[], original?: boolean) {
	return findPieceExtendedToShowFromOrderedResolvedInstances(
		pieces.filter(
			(piece) =>
				piece.outputLayer?.isPGM &&
				piece.sourceLayer?.onPresenterScreen &&
				(!original || !piece.instance.dynamicallyInserted)
		),
		supportedSourceLayerTypes
	)
}

function findTransitionPiece(pieces: PieceExtended[]) {
	return pieces.slice().find((piece) => {
		if (piece.sourceLayer?.type === SourceLayerType.TRANSITION) {
			return true
		}
	})
}

function findTimedGraphics(pieces: PieceExtended[]) {
	return pieces.slice().filter((piece) => {
		if (
			piece.sourceLayer?.type === SourceLayerType.LOWER_THIRD &&
			!piece.sourceLayer?.isHidden &&
			piece.instance.piece.lifespan === PieceLifespan.WithinPart &&
			piece.instance.piece.enable.duration
		) {
			return true
		}
	})
}

export const LinePartTimeline: React.FC<IProps> = function LinePartTimeline({
	part,
	isLive,
	isNext,
	currentPartWillAutonext,
	hasAlreadyPlayed,
	onPieceClick,
	onPieceDoubleClick,
}) {
	// const [highlight] = useState(false)

	const mainPiece = useMemo(() => findMainPiece(part.pieces), [part.pieces])
	// const mainDisplayPiece = useMemo(() => findMainPiece(part.pieces), [part.pieces])
	const transitionPiece = useMemo(() => findTransitionPiece(part.pieces), [part.pieces])
	const timedGraphics = useMemo(() => findTimedGraphics(part.pieces), [part.pieces])

	const partDuration = part.renderedDuration
	const mainPieceSourceDuration = mainPiece?.instance.piece.content.sourceDuration
	const mainPieceInPoint = mainPiece?.renderedInPoint
	const maxDuration = Math.max((mainPieceInPoint ?? 0) + (mainPieceSourceDuration ?? 0), partDuration)
	const timelineBase = Math.max(TIMELINE_DEFAULT_BASE, maxDuration)

	const willAutoNextIntoThisPart = isNext ? currentPartWillAutonext : part.willProbablyAutoNext
	const willAutoNextOut = !!part.instance.part.autoNext

	const isInvalid = !!part.instance.part.invalid

	const endsInFreeze = !part.instance.part.autoNext && !!mainPiece?.instance.piece.content.sourceDuration
	const mainSourceEnd = mainPiece?.instance.piece.content.sourceDuration
		? (mainPieceInPoint ?? 0) + mainPiece?.instance.piece.content.sourceDuration
		: null

	const isPartZeroBudget =
		(part.instance.part.expectedDuration === 0 || part.instance.part.expectedDuration === undefined) &&
		!part.instance.part.displayDurationGroup

	return (
		<div className="segment-opl__part-timeline" data-base={timelineBase / 1000}>
			{timedGraphics.map((piece) => (
				<LinePartSecondaryPiece
					key={unprotectString(piece.instance._id)}
					piece={piece}
					timelineBase={timelineBase}
					partDuration={partDuration}
					partId={part.partId}
					partInstanceId={part.instance._id}
					onClick={onPieceClick}
					onDoubleClick={onPieceDoubleClick}
				/>
			))}
			{mainPiece && (
				<StudioContext.Consumer>
					{(studio) => (
						<LinePartMainPiece
							piece={mainPiece}
							partId={part.partId}
							partInstanceId={part.instance._id}
							studio={studio}
							timelineBase={timelineBase}
							partDuration={partDuration}
							capToPartDuration={part.instance.part.autoNext ?? false}
							isLive={isLive}
						/>
					)}
				</StudioContext.Consumer>
			)}
			{part.instance.part.invalid && !part.instance.part.gap && <div className="segment-opl__main-piece invalid"></div>}
			{!isLive && !isInvalid && <TakeLine isNext={isNext} autoNext={willAutoNextIntoThisPart} />}
			{transitionPiece && <LinePartTransitionPiece piece={transitionPiece} />}
			{!willAutoNextOut && !isInvalid && (
				<OvertimeShadow
					partId={part.instance.part._id}
					timelineBase={timelineBase}
					maxDuration={maxDuration}
					mainSourceEnd={mainSourceEnd ?? partDuration}
					endsInFreeze={endsInFreeze}
					isPartZeroBudget={isPartZeroBudget}
					partRenderedDuration={partDuration}
					partActualDuration={part.instance.timings?.duration}
					isLive={isLive}
					hasAlreadyPlayed={hasAlreadyPlayed}
				/>
			)}
			{willAutoNextOut && <PartAutoNextMarker partDuration={partDuration} timelineBase={timelineBase} />}
			{isLive && (
				<OnAirLine
					partInstance={part.instance}
					timelineBase={timelineBase}
					mainSourceEnd={mainSourceEnd}
					maxDuration={endsInFreeze ? maxDuration : timelineBase}
					endsInFreeze={endsInFreeze}
				/>
			)}
		</div>
	)
}
