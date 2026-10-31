require("dotenv").config();
const { chunkRepository } = require("./chunker");
const { GoogleGenAI } = require("@google/genai");
const {
  insertCodeChunk,
  codeChunkExists,
   searchSimilarChunks,
  pool
} = require("./database");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

async function generateEmbedding(chunk) {
    const text = `title: ${chunk.name} | text: ${chunk.code}`;

    const response = await ai.models.embedContent({
        model: "gemini-embedding-2",
        contents: text
    });

    return response.embeddings[0].values;
}
async function generateQueryEmbedding(question) {
  const response = await ai.models.embedContent({
    model: "gemini-embedding-2",
    contents: question
  });

  return response.embeddings[0].values;
}

async function testSemanticSearch() {
  try {
    const question = "Where is the login functionality implemented?";

    console.log("\nUser question:", question);

    // Generate embedding for the question
    const queryEmbedding = await generateQueryEmbedding(question);

    // Retrieve the five most relevant code chunks
    const results = await searchSimilarChunks(queryEmbedding, 5);

    console.log("\nRelevant code chunks:\n");

    results.forEach((chunk, index) => {
      console.log(`Result ${index + 1}`);
      console.log("Name:", chunk.name);
      console.log("File:", chunk.file_path);
      console.log("Lines:", `${chunk.start_line}-${chunk.end_line}`);
      console.log("Distance:", chunk.distance);
      console.log("--------------------------");
    });
  } catch (error) {
    console.error("Semantic search failed:", error.message);
  }
}

async function main() {
    try {
        const repositoryPath =
            "C:\\Users\\asus\\OneDrive\\Desktop\\RAG_PROJECT\\Street_connect";

        const result = chunkRepository(repositoryPath);

        console.log("Source files:", result.totalFiles);
        console.log("Code chunks:", result.totalChunks);

        const sampleChunks = result.chunks;

      
       
        let insertedCount = 0;
        let skippedCount = 0;

        for (const chunk of sampleChunks) {
        try {
            console.log(`Checking: ${chunk.name}`);

            // Step 1: Check whether the chunk already exists.
            const exists = await codeChunkExists(chunk);

            if (exists) {
            skippedCount++;
            console.log(`Skipped existing chunk: ${chunk.name}`);
            continue;
            }

            // Step 2: Generate an embedding only for new chunks.
            console.log(`Generating embedding: ${chunk.name}`);

            const embedding = await generateEmbedding(chunk);

            // Step 3: Store the chunk and its embedding.
            const id = await insertCodeChunk(chunk, embedding);

            if (id !== null) {
            insertedCount++;
            console.log(`Inserted chunk with ID: ${id}`);
            } else {
            skippedCount++;
            console.log(`Skipped duplicate chunk: ${chunk.name}`);
            }
        } catch (error) {
            console.error(`Failed to process ${chunk.name}:`, error.message);
        }
        }

        console.log("\nIngestion completed!");
        console.log("New chunks inserted:", insertedCount);
        console.log("Existing or duplicate chunks skipped:", skippedCount);

        
    } catch (error) {
        console.error("Ingestion failed:", error.message);
    } finally {
        await pool.end();
    }
}

testSemanticSearch().finally(async () => {
  await pool.end();
});