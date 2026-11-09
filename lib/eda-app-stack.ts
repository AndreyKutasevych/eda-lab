import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";


import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    const imagesTable = new dynamodb.Table(this, "ImagesTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "name", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "Images",
    });


    // Output
    
    new cdk.CfnOutput(this, "bucketName", {
      value: imagesBucket.bucketName,
    });
    const queue = new sqs.Queue(this, "img-uploaded-q", {
      receiveMessageWaitTime: cdk.Duration.seconds(6),
    });

    // Lambda functions

        const persistImageDataFn = new lambdanode.NodejsFunction(
      this,
      "PersistImageDataFn",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `./lambdas/persistImageData.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imagesTable.tableName,
          BUCKET_NAME: imagesBucket.bucketName,
          REGION: 'eu-west-1'
        },
      }
    );

        // NEW
    const dlq = new sqs.Queue(this, "img-dlq", {
      receiveMessageWaitTime: cdk.Duration.seconds(6),
    });
    // UPDATE
    const imageProcessQueue = new sqs.Queue(this, "img-process-q", {
      receiveMessageWaitTime: cdk.Duration.seconds(6),
      deadLetterQueue: {
        queue: dlq,
        maxReceiveCount: 1,
      },
    });

        const rejectedFileFn = new lambdanode.NodejsFunction(
      this,
      "RejectedFileFn",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: `${__dirname}/../lambdas/rejectedFile.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
      }
    );

    const rejectedFileEventSource = new events.SqsEventSource(dlq, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(10),
    });

    rejectedFileFn.addEventSource(rejectedFileEventSource);

    const newImageTopic = new sns.Topic(this, "NewImageTopic", {
      displayName: "New Image topic",
    });

    const mailerQ = new sqs.Queue(this, "mailer-q", {
      receiveMessageWaitTime: cdk.Duration.seconds(6),
    });

    newImageTopic.addSubscription(
      new subs.SqsSubscription(imageProcessQueue)
    );

    const mailerFn = new lambdanode.NodejsFunction(this, "mailer", {
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(3),
      entry: `./lambdas/mailer.ts`,
    });

    newImageTopic.addSubscription(new subs.SqsSubscription(mailerQ));

        const newImageMailEventSource = new events.SqsEventSource(mailerQ, {
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
    });

    mailerFn.addEventSource(newImageMailEventSource);

    mailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );


    const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {  // Changed
      batchSize: 5,
      maxBatchingWindow: cdk.Duration.seconds(5),
    });

    persistImageDataFn.addEventSource(newImageEventSource);  // Changed
     // Changed


    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(newImageTopic)
    );

    imagesBucket.grantRead(persistImageDataFn); 
    
    imagesTable.grantReadWriteData(persistImageDataFn);

  }
  
}
