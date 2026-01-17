const { BlobServiceClient } = require("@azure/storage-blob");

module.exports = async function (context, req) {
  // Set CORS headers
  context.res = {
    headers: {
      "Content-Type": "application/json",
    },
  };

  context.log("Testing Azure Blob Storage connection");

  try {
    // Get connection string from environment variable
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;

    if (!connectionString) {
      context.res.status = 500;
      context.res.body = JSON.stringify({
        error: "Storage connection string not found in environment variables",
      });
      return;
    }

    // Create BlobServiceClient
    const blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);

    // Get container reference
    const containerName = "course-materials";
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Check if container exists
    const exists = await containerClient.exists();

    if (!exists) {
      context.res.status = 404;
      context.res.body = JSON.stringify({
        error: `Container '${containerName}' does not exist`,
      });
      return;
    }

    // Create a test blob with current timestamp
    const testBlobName = `test-${Date.now()}.txt`;
    const blockBlobClient = containerClient.getBlockBlobClient(testBlobName);

    const testContent =
      "Hello from your study assistant! Storage is working! 🎉";
    await blockBlobClient.upload(testContent, testContent.length);

    // Success!
    context.res.status = 200;
    context.res.body = JSON.stringify({
      success: true,
      message: "Storage connection successful!",
      testFile: testBlobName,
      containerName: containerName,
    });
  } catch (error) {
    context.log.error("Error testing storage:", error);
    context.res.status = 500;
    context.res.body = JSON.stringify({
      error: "Failed to connect to storage",
      details: error.message,
    });
  }
};
