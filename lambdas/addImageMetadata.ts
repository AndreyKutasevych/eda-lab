import { SNSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: SNSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));
  const message = JSON.parse(event.Records[0].Sns.Message);
  const attributeName =
    event.Records[0].Sns.MessageAttributes.metadata_type.Value.toString();
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: process.env.TABLE_NAME,
      Key: {
        name: message.name,
      },
      UpdateExpression: "SET #attr = :value",
      ExpressionAttributeNames: {
        "#attr": attributeName,
      },
      ExpressionAttributeValues: {
        ":value": message.value,
      },
    })
  );
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
