const { BlobServiceClient } = require("@azure/storage-blob");
const { CosmosClient } = require("@azure/cosmos");
const Busboy = require("busboy");
const pdfParse = require("pdf-parse");

module.exports = async function (context, req) {
  context.res = {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  };

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    context.res.status = 200;
    context.res.body = "";
    return;
  }

  if (req.method !== "POST") {
    context.res.status = 405;
    context.res.body = JSON.stringify({
      error: "Method not allowed. Use POST.",
    });
    return;
  }

  try {
    // Parse multipart form data
    const { file, fileName, contentType } = await parseMultipartForm(req);

    if (!file || !fileName) {
      context.res.status = 400;
      context.res.body = JSON.stringify({ error: "No file uploaded" });
      return;
    }

    context.log(`Processing file: ${fileName}`);

    // Extract text from PDF
    let extractedText = "";
    if (contentType === "application/pdf") {
      try {
        const pdfData = await pdfParse(file);
        extractedText = pdfData.text;
        context.log(`Extracted ${extractedText.length} characters from PDF`);
      } catch (pdfError) {
        context.log.error("PDF parsing error:", pdfError);
        extractedText = "[PDF text extraction failed]";
      }
    }

    // Upload to Blob Storage
    const blobName = `${Date.now()}-${fileName}`;
    const blobUrl = await uploadToBlob(file, blobName, contentType);
    context.log(`Uploaded to blob: ${blobUrl}`);

    // Save metadata to Cosmos DB
    const documentMetadata = {
      id: `doc-${Date.now()}`,
      fileName: fileName,
      blobUrl: blobUrl,
      blobName: blobName,
      contentType: contentType,
      uploadDate: new Date().toISOString(),
      textLength: extractedText.length,
      textPreview: extractedText.substring(0, 500),
      userId: "default-user", // TODO: Add real user authentication later
    };

    await saveToCosmosDB(documentMetadata);
    context.log(`Saved metadata to Cosmos DB: ${documentMetadata.id}`);

    // Success response
    context.res.status = 200;
    context.res.body = JSON.stringify({
      success: true,
      message: "Document uploaded successfully",
      document: {
        id: documentMetadata.id,
        fileName: fileName,
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

// Parse multipart form data
function parseMultipartForm(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: {
        "content-type": req.headers["content-type"],
      },
    });

    let fileBuffer = null;
    let fileName = "";
    let contentType = "";

    busboy.on("file", (fieldname, file, info) => {
      fileName = info.filename;
      contentType = info.mimeType;
      const chunks = [];

      file.on("data", (chunk) => {
        chunks.push(chunk);
      });

      file.on("end", () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    busboy.on("finish", () => {
      resolve({
        file: fileBuffer,
        fileName: fileName,
        contentType: contentType,
      });
    });

    busboy.on("error", (error) => {
      reject(error);
    });

    // Feed request body to busboy
    if (req.body) {
      busboy.write(req.body);
      busboy.end();
    } else {
      reject(new Error("No request body"));
    }
  });
}

// Upload file to Azure Blob Storage
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

// Save document metadata to Cosmos DB
async function saveToCosmosDB(documentMetadata) {
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const databaseName = process.env.COSMOS_DB_DATABASE_NAME;

  const client = new CosmosClient({ endpoint, key });
  const database = client.database(databaseName);
  const container = database.container("documents");

  await container.items.create(documentMetadata);
}
