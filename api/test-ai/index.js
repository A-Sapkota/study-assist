const OpenAI = require("openai");
const { AzureOpenAI } = OpenAI;

module.exports = async function (context, req) {
  context.res = {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  };

  try {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.AZURE_OPENAI_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    const apiVersion =
      process.env.AZURE_OPENAI_API_VERSION || "2024-04-01-preview";

    context.log("Environment variables:");
    context.log("Endpoint:", endpoint);
    context.log("Deployment:", deployment);
    context.log("API Version:", apiVersion);
    context.log("API Key exists:", !!apiKey);

    if (!endpoint || !apiKey || !deployment) {
      context.res.status = 500;
      context.res.body = JSON.stringify({
        error: "Missing configuration",
        details: {
          hasEndpoint: !!endpoint,
          hasApiKey: !!apiKey,
          hasDeployment: !!deployment,
        },
      });
      return;
    }

    context.log("Creating AzureOpenAI client...");
    const client = new AzureOpenAI({
      endpoint,
      apiKey,
      apiVersion,
      deployment,
    });

    context.log("Client created. Sending test request...");
    const result = await client.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        {
          role: "user",
          content: "Say 'Hello, this is a test!' and nothing else.",
        },
      ],
      max_completion_tokens: 1000,
    });

    context.log("Response received!");
    context.log("Full result:", JSON.stringify(result, null, 2));

    const answer = result.choices?.[0]?.message?.content ?? "";

    context.log("Extracted answer:", answer);
    context.log("Answer type:", typeof answer);
    context.log("Answer length:", answer.length);

    context.res.status = 200;
    context.res.body = JSON.stringify({
      success: true,
      answer: answer,
      fullResponse: result,
      debug: {
        answerIsEmpty: answer === "",
        answerLength: answer.length,
        choicesCount: result.choices?.length,
        finishReason: result.choices?.[0]?.finish_reason,
      },
    });
  } catch (error) {
    context.log.error("Test error:", error);
    context.res.status = 500;
    context.res.body = JSON.stringify({
      error: "Test failed",
      details: error.message,
      stack: error.stack,
    });
  }
};
