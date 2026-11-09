import { SQSHandler } from "aws-lambda";

export const handler: SQSHandler = async (event) => {
  console.log("Event ", JSON.stringify(event));
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);        // Parse SQS message
    const snsMessage = JSON.parse(recordBody.Message); // Parse SNS message
    if (snsMessage.Records) {
      for (const s3Message of snsMessage.Records) {
        const s3e = s3Message.s3;
        console.log("Rejected file: ", s3e.object.key);
      }
    }
  }
};
