import { useState } from "react";

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload-document", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data);
      } else {
        setError(data.error || "Upload failed");
      }
    } catch (err) {
      setError(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: "600px",
        margin: "50px auto",
        padding: "20px",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1>Upload Course Material</h1>

      <div style={{ marginTop: "30px" }}>
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          style={{
            padding: "10px",
            border: "2px solid #ddd",
            borderRadius: "4px",
            width: "100%",
            marginBottom: "20px",
          }}
        />

        {file && (
          <p style={{ color: "#666", marginBottom: "20px" }}>
            Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
          </p>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          style={{
            padding: "12px 24px",
            backgroundColor: uploading ? "#ccc" : "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            fontSize: "16px",
            cursor: uploading ? "not-allowed" : "pointer",
            width: "100%",
          }}
        >
          {uploading ? "Uploading..." : "Upload Document"}
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: "20px",
            padding: "15px",
            backgroundColor: "#fee",
            border: "1px solid #fcc",
            borderRadius: "4px",
            color: "#c00",
          }}
        >
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: "20px",
            padding: "15px",
            backgroundColor: "#efe",
            border: "1px solid #cfc",
            borderRadius: "4px",
            color: "#060",
          }}
        >
          <h3>✓ Upload Successful!</h3>
          <p>
            <strong>File:</strong> {result.document.fileName}
          </p>
          <p>
            <strong>Document ID:</strong> {result.document.id}
          </p>
          <p>
            <strong>Text extracted:</strong> {result.document.textLength}{" "}
            characters
          </p>
          <p>
            <strong>Uploaded:</strong>{" "}
            {new Date(result.document.uploadDate).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
