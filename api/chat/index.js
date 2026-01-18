const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
const { CosmosClient } = require("@azure/cosmos");

module.exports = async function (context, req) {
  context.res = {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  };

  if (req.method !== "POST") {
    context.res.status = 405;
    context.res.body = JSON.stringify({ error: "Method not allowed" });
    return;
  }

  try {
    const { question, userId = "default-user" } = req.body;

    if (!question) {
      context.res.status = 400;
      context.res.body = JSON.stringify({ error: "Question is required" });
      return;
    }

    context.log(`Processing question: ${question}`);

    // Step 1: Retrieve all user's documents from Cosmos DB
    const documents = await getUserDocuments(userId);

    if (documents.length === 0) {
      context.res.status = 200;
      context.res.body = JSON.stringify({
        answer:
          "You haven't uploaded any documents yet. Please upload course materials first!",
        sources: [],
      });
      return;
    }

    context.log(`Found ${documents.length} documents`);

    // Step 2: Search for relevant content (simple keyword matching for now)
    const relevantChunks = searchDocuments(documents, question);

    if (relevantChunks.length === 0) {
      context.res.status = 200;
      context.res.body = JSON.stringify({
        answer:
          "I couldn't find relevant information in your uploaded documents to answer this question.",
        sources: [],
      });
      return;
    }

    // Step 3: Build context from relevant chunks
    const contextText = relevantChunks
      .map((chunk, i) => `[Source ${i + 1}: ${chunk.fileName}]\n${chunk.text}`)
      .join("\n\n");

    // Step 4: Call Azure OpenAI with the context
    const answer = await getAIAnswer(question, contextText);

    // Step 5: Extract unique sources
    const sources = [...new Set(relevantChunks.map((c) => c.fileName))];

    context.res.status = 200;
    context.res.body = JSON.stringify({
      answer: answer,
      sources: sources,
      chunksUsed: relevantChunks.length,
    });
  } catch (error) {
    context.log.error("Chat error:", error);
    context.res.status = 500;
    context.res.body = JSON.stringify({
      error: "Failed to process question",
      details: error.message,
    });
  }
};

// Retrieve user's documents from Cosmos DB
async function getUserDocuments(userId) {
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const databaseName = process.env.COSMOS_DB_DATABASE_NAME;

  const client = new CosmosClient({ endpoint, key });
  const database = client.database(databaseName);
  const container = database.container("documents");

  const querySpec = {
    query: "SELECT * FROM c WHERE c.userId = @userId",
    parameters: [{ name: "@userId", value: userId }],
  };

  const { resources } = await container.items.query(querySpec).fetchAll();
  return resources;
}

// Simple keyword-based search (we'll upgrade this to vector search later)
function searchDocuments(documents, question) {
  const questionWords = question
    .toLowerCase()
    .split(" ")
    .filter((w) => w.length > 3);
  const results = [];

  for (const doc of documents) {
    if (!doc.textPreview) continue;

    const text = doc.textPreview.toLowerCase();
    let relevanceScore = 0;

    // Count matching keywords
    for (const word of questionWords) {
      if (text.includes(word)) {
        relevanceScore++;
      }
    }

    if (relevanceScore > 0) {
      results.push({
        fileName: doc.fileName,
        text: doc.textPreview,
        score: relevanceScore,
      });
    }
  }

  // Sort by relevance and return top 3
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 3);
}

// Get answer from Azure OpenAI
async function getAIAnswer(question, context) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;

  const client = new OpenAIClient(endpoint, new AzureKeyCredential(apiKey));

  const prompt = `You are a helpful study assistant. Answer the student's question based ONLY on the provided context from their course materials. If the answer is not in the context, say so.

Context from uploaded documents:
${context}

Student's Question: ${question}

Answer (be concise and cite which sources you used):`;

  const result = await client.getChatCompletions(
    deploymentName,
    [
      {
        role: "system",
        content:
          "You are a helpful study assistant that answers questions based on course materials.",
      },
      { role: "user", content: prompt },
    ],
    {
      maxTokens: 500,
      temperature: 0.7,
    },
  );

  return result.choices[0].message.content;
}
