import { SQSBatchItemFailure, SQSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: SQSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));
  const batchItemFailures: SQSBatchItemFailure[] = [];  // NEW
  for (const record of event.Records) {
    try {  // NEW - handle each message separately
      const recordBody = JSON.parse(record.body);        // Parse SQS message
      const snsMessage = JSON.parse(recordBody.Message); // Parse SNS message
      console.log("Record body ", JSON.stringify(snsMessage));
      if (snsMessage.Records) {
        for (const s3Message of snsMessage.Records) {
          const s3e = s3Message.s3;
          // Object key may have spaces or unicode non-ASCII characters.
          const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));
          // Infer the image type from the file suffix.
          const typeMatch = srcKey.match(/\.([^.]*)$/);
          if (!typeMatch) {
            throw new Error("Could not determine the image type.");
          }
          // Check that the image type is supported
          const imageType = typeMatch[1].toLowerCase();
          if (imageType !== "jpeg" && imageType !== "jpg" && imageType !== "png") {
            throw new Error(`Unsupported image type: ${imageType}`);
          }

          await ddbDocClient.send(
            new PutCommand({
              TableName: process.env.TABLE_NAME,
              Item: {
                name: srcKey,
              },
            })
          );
        }
      }
    } catch (error) {
      // NEW - record the failed message and continue with the rest of the batch
      console.log(`Message ${record.messageId} failed: `, error);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };  // NEW
};

function createDDbDocClient() {
  const ddbClient = new DynamoDBClient({ region: process.env.REGION });
  const marshallOptions = {
    convertEmptyValues: true,
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  };
  const unmarshallOptions = {
    wrapNumbers: false,
  };
  const translateConfig = { marshallOptions, unmarshallOptions };
  return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
