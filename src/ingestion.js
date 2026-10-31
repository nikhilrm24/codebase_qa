require("dotenv").config();

const { chunkRepository } = require("./chunker");

const { generateEmbedding } = require("./embedding");

const {
  insertCodeChunk,
  codeChunkExists,
  pool
} = require("./database");

async function ingestRepository(repositoryPath) {
  try {
    console.log("Starting repository ingestion...\n");

    // Step 1: Extract code chunks
    const result = chunkRepository(repositoryPath);

    console.log("Source files:", result.totalFiles);
    console.log("Code chunks:", result.totalChunks);

    let insertedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // Step 2: Process every code chunk
    for (const chunk of result.chunks) {
      try {
        console.log(`\nChecking: ${chunk.name}`);

        // Check whether chunk already exists
        const exists = await codeChunkExists(chunk);

        if (exists) {
          skippedCount++;
          console.log("Skipped existing chunk");
          continue;
        }

        // Generate embedding
        const embedding = await generateEmbedding(chunk);

        // Store in PostgreSQL
        const id = await insertCodeChunk(chunk, embedding);

        if (id !== null) {
          insertedCount++;
          console.log(`Inserted chunk ID: ${id}`);
        } else {
          skippedCount++;
          console.log("Skipped duplicate chunk");
        }

      } catch (error) {
        failedCount++;
        console.error(
          `Failed: ${chunk.name}`,
          error.message
        );
      }
    }

    console.log("\nIngestion completed!");
    console.log("New chunks inserted:", insertedCount);
    console.log("Existing chunks skipped:", skippedCount);
    console.log("Failed chunks:", failedCount);

  } catch (error) {
    console.error("Ingestion failed:", error.message);
  }
}

async function main() {
  const repositoryPath =
    "C:\\Users\\asus\\OneDrive\\Desktop\\RAG_PROJECT\\Street_connect";

  try {
    await ingestRepository(repositoryPath);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}