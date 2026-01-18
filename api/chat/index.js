const OpenAI = require("openai");
const { AzureOpenAI } = OpenAI;
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

    context.log(`Documents found: ${documents.length}`);

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
    documents.forEach((doc) => {
      context.log(
        `- ${doc.fileName}: ${doc.textLength} chars, preview: ${doc.textPreview?.length || 0} chars`,
      );
    });

    // Step 2: Search for relevant content (simple keyword matching for now)
    const relevantChunks = searchDocuments(documents, question);

    context.log(`Relevant chunks found: ${relevantChunks.length}`);
    relevantChunks.forEach((chunk) => {
      context.log(`- ${chunk.fileName}: score ${chunk.score}`);
    });

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
    context.log("Calling OpenAI with context length:", contextText.length);
    const answer = await getAIAnswer(question, contextText);
    context.log("Received answer:", answer);
    context.log("Answer length:", answer?.length);

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
    .filter((w) => w.length > 2);
  const results = [];

  for (const doc of documents) {
    // Use fullText if available, otherwise fall back to textPreview
    const textToSearch = doc.fullText || doc.textPreview || "";

    if (!textToSearch) continue;

    const text = textToSearch.toLowerCase();
    let relevanceScore = 0;

    // Count matching keywords (more lenient)
    for (const word of questionWords) {
      // Check if the word appears anywhere in the text
      const regex = new RegExp(word, "gi");
      const matches = text.match(regex);
      if (matches) {
        relevanceScore += matches.length;
      }
    }

    // For full text documents, extract relevant snippets around matches
    let relevantText = textToSearch;
    if (doc.fullText && relevanceScore > 0) {
      // Find the first occurrence of the best matching word
      const bestWord = questionWords.find((w) =>
        text.includes(w.toLowerCase()),
      );
      if (bestWord) {
        const index = text.indexOf(bestWord.toLowerCase());
        const start = Math.max(0, index - 500);
        const end = Math.min(textToSearch.length, index + 1500);
        relevantText = textToSearch.substring(start, end);
      } else {
        // If no direct match, take first 2000 chars
        relevantText = textToSearch.substring(0, 2000);
      }
    }

    // Always include documents even with low scores
    results.push({
      fileName: doc.fileName,
      text: relevantText,
      score: relevanceScore,
      hasFullText: !!doc.fullText,
    });
  }

  // Sort by relevance
  results.sort((a, b) => b.score - a.score);

  // Return all documents if search score is low (fallback behavior)
  if (results.length > 0 && results[0].score < 2) {
    // If best match has very low score, return all documents anyway
    return results;
  }

  return results.slice(0, 3);
}

// Get answer from Azure OpenAI
async function getAIAnswer(question, contextText) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_KEY;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const apiVersion =
    process.env.AZURE_OPENAI_API_VERSION || "2024-04-01-preview";

  if (!endpoint || !apiKey || !deployment) {
    throw new Error(
      "Missing AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, or AZURE_OPENAI_DEPLOYMENT_NAME",
    );
  }

  const client = new AzureOpenAI({
    endpoint,
    apiKey,
    apiVersion,
    deployment, // sets the default deployment
  });

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful study assistant. Answer using ONLY the provided context. If the answer is not in the context, say you cannot find it.",
    },
    {
      role: "user",
      content: `Context from uploaded documents:\n${contextText}\n\nStudent's Question: ${question}\n\nAnswer concisely and cite sources by filename when relevant.`,
    },
  ];

  const result = await client.chat.completions.create({
    messages,
    max_completion_tokens: 500,
  });

  return result.choices?.[0]?.message?.content ?? "";
}
