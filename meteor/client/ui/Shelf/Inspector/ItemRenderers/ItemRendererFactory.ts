import * as React from 'react'
import DefaultItemRenderer from './DefaultItemRenderer'
import NoraItemRenderer, { isNoraItem } from './NoraItemRenderer'
import ActionItemRenderer, { isActionItem } from './ActionItemRenderer'

import { PieceUi } from '../../../SegmentTimeline/SegmentTimelineContainer'
import { AdLibPieceUi } from '../../AdLibPanel'
import { ShowStyleBase } from '../../../../../lib/collections/ShowStyleBases'
import { Studio } from '../../../../../lib/collections/Studios'
import { BucketAdLibItem } from '../../RundownViewBuckets'

export default function renderItem(
	piece: BucketAdLibItem | AdLibPieceUi | PieceUi,
	showStyleBase: ShowStyleBase,
	studio: Studio
): JSX.Element {
	if (!piece['isAction'] && isNoraItem(piece as AdLibPieceUi | PieceUi)) {
		const noraPiece = piece as AdLibPieceUi | PieceUi
		return React.createElement(NoraItemRenderer, { piece: noraPiece, showStyleBase, studio })
	} else if (isActionItem(piece)) {
		return React.createElement(ActionItemRenderer, { piece, showStyleBase, studio })
	}

	return React.createElement(DefaultItemRenderer, { piece, showStyleBase, studio })
}
