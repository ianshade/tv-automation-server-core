import { RundownId } from '../collections/Rundowns'
import { SegmentId } from '../collections/Segments'
import { PartId } from '../collections/Parts'
import { PieceId } from '../collections/Pieces'
import { ITranslatableMessage } from './TranslatableMessage'
import { NoteSeverity } from '@sofie-automation/blueprints-integration'

export interface INoteBase {
	type: NoteSeverity
	message: ITranslatableMessage
}

export interface TrackedNote extends GenericNote {
	rank: number
	origin: {
		name: string
		segmentName?: string
		rundownId?: RundownId
		segmentId?: SegmentId
		partId?: PartId
		pieceId?: PieceId
	}
}

export interface GenericNote extends INoteBase {
	origin: {
		name: string
	}
}
export interface RundownNote extends INoteBase {
	origin: {
		name: string
	}
}
export interface SegmentNote extends RundownNote {
	origin: {
		name: string
	}
}

export interface PartNote extends SegmentNote {
	origin: {
		name: string
		pieceId?: PieceId
	}
}
