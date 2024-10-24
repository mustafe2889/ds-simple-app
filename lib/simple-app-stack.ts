import * as cdk from 'aws-cdk-lib';
import * as lambdanode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';  // Ensure this import is present
import * as custom from 'aws-cdk-lib/custom-resources'; // Import for custom resource
import { Construct } from 'constructs';
import { movies, movieCasts } from "../seed/movies"; // Updated import for seed data
import { generateBatch } from '../shared/util'; // Import the generateBatch function

export class SimpleAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Reference the existing DynamoDB table using only the ARN
    const moviesTable = dynamodb.Table.fromTableAttributes(this, 'MoviesTable', {
      tableArn: 'arn:aws:dynamodb:eu-west-1:515246745010:table/Movies', // Use the actual ARN of your existing table
    });

    // Existing simpleFn Lambda
    const simpleFn = new lambdanode.NodejsFunction(this, "SimpleFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/simple.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
    });

    const simpleFnURL = simpleFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,   // Keep previous change
      cors: {
        allowedOrigins: ["*"],
      },
    });

    new cdk.CfnOutput(this, "Simple Function Url", { value: simpleFnURL.url });

    // GetMovieById Lambda Function
    const getMovieByIdFn = new lambdanode.NodejsFunction(this, "GetMovieByIdFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/getMovieById.ts`,
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: moviesTable.tableName,
        REGION: 'eu-west-1',
      },
    });

    // New MovieCast Table
    const movieCastsTable = new dynamodb.Table(this, "MovieCastTable", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "movieId", type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "actorName", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,  // Automatically delete on stack destroy for dev purposes
      tableName: "MovieCast",
    });
    
    // Adding a local secondary index on roleName
    movieCastsTable.addLocalSecondaryIndex({
      indexName: "roleIx",
      sortKey: { name: "roleName", type: dynamodb.AttributeType.STRING },
    });

    const getMovieByIdURL = getMovieByIdFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
      },
    });

    moviesTable.grantReadData(getMovieByIdFn);

    new cdk.CfnOutput(this, "Get Movie Function Url", { value: getMovieByIdURL.url });

    // New getAllMovies Lambda Function
    const getAllMoviesFn = new lambdanode.NodejsFunction(this, "GetAllMoviesFn", {
      architecture: lambda.Architecture.ARM_64,
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/getAllMovies.ts`,  // The new Lambda function file
      timeout: cdk.Duration.seconds(10),
      memorySize: 128,
      environment: {
        TABLE_NAME: moviesTable.tableName,
        REGION: 'eu-west-1',
      },
    });

    const getAllMoviesURL = getAllMoviesFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
      },
    });

    moviesTable.grantReadData(getAllMoviesFn);  // Grant permission to read data from the table

    new cdk.CfnOutput(this, "Get All Movies Function Url", { value: getAllMoviesURL.url });

    // Custom Resource for seeding data
    new custom.AwsCustomResource(this, "moviesddbInitData", {
      onCreate: {
        service: "DynamoDB",
        action: "batchWriteItem",
        parameters: {
          RequestItems: {
            [moviesTable.tableName]: generateBatch(movies),
            [movieCastsTable.tableName]: generateBatch(movieCasts),  // Added seeding for MovieCast table
          },
        },
        physicalResourceId: custom.PhysicalResourceId.of("moviesddbInitData"), // Unique ID
      },
      policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
        resources: [moviesTable.tableArn, movieCastsTable.tableArn],  // Includes movie cast
      }),
    });

    // New getMovieCastMembers Lambda Function
    const getMovieCastMembersFn = new lambdanode.NodejsFunction(
      this,
      "GetCastMemberFn",
      {
        architecture: lambda.Architecture.ARM_64,
        runtime: lambda.Runtime.NODEJS_16_X,
        entry: `${__dirname}/../lambdas/getMovieCastMembers.ts`,
        timeout: cdk.Duration.seconds(10),
        memorySize: 128,
        environment: {
          CAST_TABLE_NAME: movieCastsTable.tableName,
          REGION: "eu-west-1",
        },
      }
    );

    const getMovieCastMembersURL = getMovieCastMembersFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: ["*"],
      },
    });

    // Grant the new lambda permission to read from the new table
    movieCastsTable.grantReadData(getMovieCastMembersFn);

    // Add a new output resource for the Get Movie Cast URL
    new cdk.CfnOutput(this, "Get Movie Cast Url", {
      value: getMovieCastMembersURL.url,
    });
  }
}
