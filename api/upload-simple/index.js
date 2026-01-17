const { BlobServiceClient } = require("@azure/storage-blob");
const { CosmosClient } = require("@azure/cosmos");
const pdfParse = require("pdf-parse");

module.exports = async function (context, req) {
  context.res = {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  };

  context.log("Upload request received");

  if (req.method !== "POST") {
    context.res.status = 405;
    context.res.body = JSON.stringify({ error: "Method not allowed" });
    return;
  }

  try {
    const body = req.body;

    if (!body || !body.fileData || !body.fileName) {
      context.res.status = 400;
      context.res.body = JSON.stringify({
        error: "Missing required fields: fileData and fileName",
      });
      return;
    }

    context.log(`Processing file: ${body.fileName}`);

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(body.fileData, "base64");
    const contentType = body.contentType || "application/pdf";

    // Extract text from PDF
    let extractedText = "";
    if (contentType === "application/pdf") {
      try {
        const pdfData = await pdfParse(fileBuffer);
        extractedText = pdfData.text;
        context.log(`Extracted ${extractedText.length} characters`);
      } catch (pdfError) {
        context.log.error("PDF parsing error:", pdfError);
        extractedText = "[PDF text extraction failed]";
      }
    }

    // Upload to Blob Storage
    const blobName = `${Date.now()}-${body.fileName}`;
    const blobUrl = await uploadToBlob(fileBuffer, blobName, contentType);
    context.log(`Uploaded to blob: ${blobUrl}`);

    // Save metadata to Cosmos DB
    const documentMetadata = {
      id: `doc-${Date.now()}`,
      fileName: body.fileName,
      blobUrl: blobUrl,
      blobName: blobName,
      contentType: contentType,
      uploadDate: new Date().toISOString(),
      textLength: extractedText.length,
      textPreview: extractedText.substring(0, 500),
      userId: "default-user",
    };

    await saveToCosmosDB(documentMetadata);
    context.log(`Saved metadata: ${documentMetadata.id}`);

    // Success
    context.res.status = 200;
    context.res.body = JSON.stringify({
      success: true,
      message: "Document uploaded successfully",
      document: {
        id: documentMetadata.id,
        fileName: body.fileName,
        uploadDate: documentMetadata.uploadDate,
        textLength: extractedText.length,
      },
    });
  } catch (error) {
    context.log.error("Upload error:", error);
    context.res.status = 500;
    context.res.body = JSON.stringify({
      error: "Failed to upload document",
      details: error.message,
    });
  }
};

async function uploadToBlob(fileBuffer, blobName, contentType) {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const containerName = "course-materials";

  const blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString);
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  });

  return blockBlobClient.url;
}

async function saveToCosmosDB(documentMetadata) {
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const databaseName = process.env.COSMOS_DB_DATABASE_NAME;

  const client = new CosmosClient({ endpoint, key });
  const database = client.database(databaseName);
  const container = database.container("documents");

  await container.items.create(documentMetadata);
}
