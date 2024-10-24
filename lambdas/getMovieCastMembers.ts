import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  QueryCommandInput,
} from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDocumentClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
  try {
    console.log("Event: ", JSON.stringify(event));
    const queryParams = event.queryStringParameters;

    // Check for missing query parameters
    if (!queryParams) {
      return createErrorResponse(500, "Missing query parameters");
    }

    if (!queryParams.movieId) {
      return createErrorResponse(500, "Missing movie Id parameter");
    }

    const movieId = parseInt(queryParams.movieId);
    let commandInput: QueryCommandInput = {
      TableName: process.env.CAST_TABLE_NAME,
    };

    // Build command input based on query parameters
    if ("roleName" in queryParams) {
      commandInput = {
        ...commandInput,
        IndexName: "roleIx",
        KeyConditionExpression: "movieId = :m and begins_with(roleName, :r)",
        ExpressionAttributeValues: {
          ":m": movieId,
          ":r": queryParams.roleName,
        },
      };
    } else if ("actorName" in queryParams) {
      commandInput = {
        ...commandInput,
        KeyConditionExpression: "movieId = :m and begins_with(actorName, :a)",
        ExpressionAttributeValues: {
          ":m": movieId,
          ":a": queryParams.actorName,
        },
      };
    } else {
      commandInput = {
        ...commandInput,
        KeyConditionExpression: "movieId = :m",
        ExpressionAttributeValues: {
          ":m": movieId,
        },
      };
    }

    // If facts parameter is present, query the movie table as well
    let castItems;
    if (queryParams.facts === 'true') {
      const movieDetails = await getMovieDetails(movieId);
      const commandOutput = await ddbDocClient.send(new QueryCommand(commandInput));
      castItems = commandOutput.Items;

      return {
        statusCode: 200,
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          data: castItems,
          movieDetails: movieDetails, // Include movie details if facts parameter is true
        }),
      };
    }

    const commandOutput = await ddbDocClient.send(new QueryCommand(commandInput));
    castItems = commandOutput.Items;

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        data: castItems,
      }),
    };

  } catch (error: any) {
    console.log(JSON.stringify(error));
    return createErrorResponse(500, error);
  }
};

// Helper function to create error response
function createErrorResponse(statusCode: number, message: string) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ message }),
  };
}

// Function to get movie details based on movieId
async function getMovieDetails(movieId: number) {
  const movieTableName = process.env.MOVIE_TABLE_NAME; // Ensure this environment variable is set in your Lambda function
  const commandInput: QueryCommandInput = {
    TableName: movieTableName,
    KeyConditionExpression: "id = :m",
    ExpressionAttributeValues: {
      ":m": movieId,
    },
  };

  const commandOutput = await ddbDocClient.send(new QueryCommand(commandInput));
  return commandOutput.Items ? commandOutput.Items[0] : null; // Return movie details or null if not found
}

// Create DynamoDB Document Client
function createDocumentClient() {
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
