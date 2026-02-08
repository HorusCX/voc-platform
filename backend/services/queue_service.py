import boto3
import json
import logging
import os

logger = logging.getLogger(__name__)

class QueueService:
    def __init__(self, region_name=None):
        self.region_name = region_name or os.getenv("AWS_REGION", "me-central-1")
        self.sqs = boto3.client("sqs", region_name=self.region_name)

    def send_message(self, queue_url, message_body, message_attributes=None):
        """
        Send a message to the SQS queue.
        """
        try:
            params = {
                "QueueUrl": queue_url,
                "MessageBody": json.dumps(message_body)
            }
            if message_attributes:
                params["MessageAttributes"] = message_attributes

            response = self.sqs.send_message(**params)
            logger.info(f"✅ Message sent to SQS: {response.get('MessageId')}")
            return response
        except Exception as e:
            logger.error(f"❌ Failed to send message to SQS: {e}")
            raise e

    def receive_messages(self, queue_url, max_messages=1, wait_time=20):
        """
        Receive messages from the SQS queue.
        """
        try:
            response = self.sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=max_messages,
                WaitTimeSeconds=wait_time,
                AttributeNames=['All'],
                MessageAttributeNames=['All']
            )
            return response.get("Messages", [])
        except Exception as e:
            logger.error(f"❌ Failed to receive messages from SQS: {e}")
            return []

    def delete_message(self, queue_url, receipt_handle):
        """
        Delete a message from the SQS queue after successful processing.
        """
        try:
            self.sqs.delete_message(
                QueueUrl=queue_url,
                ReceiptHandle=receipt_handle
            )
            logger.info("🗑️ Message deleted from SQS")
        except Exception as e:
            logger.error(f"❌ Failed to delete message from SQS: {e}")
