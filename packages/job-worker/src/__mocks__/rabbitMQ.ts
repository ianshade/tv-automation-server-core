import { ExternalMessageQueueObjRabbitMQ } from '@sofie-automation/blueprints-integration'
import { ExternalMessageQueueObj } from '@sofie-automation/corelib/dist/dataModel/ExternalMessageQueue'

export async function sendRabbitMQMessage(
	msg0: ExternalMessageQueueObjRabbitMQ & ExternalMessageQueueObj
): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		process.nextTick(() => {
			if (msg0.message.message.match(/error/)) {
				reject(new Error('Failed to send slack rabbitMQ message'))
			} else {
				resolve()
			}
		})
	})
}

const sendRabbitMQMock = jest.fn(sendRabbitMQMessage)

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function setup() {
	return {
		sendRabbitMQMessage: sendRabbitMQMock,
	}
}
