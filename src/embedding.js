require("dotenv").config();
const { chunkRepository } = require("./chunker");
const { GoogleGenAI } = require("@google/genai");
const { insertCodeChunk, pool } = require("./database");

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

async function main() {
    try {
        const repositoryPath =
            "C:\\Users\\asus\\OneDrive\\Desktop\\RAG_PROJECT\\Street_connect";

        const result = chunkRepository(repositoryPath);

        console.log("Source files:", result.totalFiles);
        console.log("Code chunks:", result.totalChunks);

        const sampleChunks = result.chunks.slice(0, 5);

        let insertedCount = 0;

        for (const chunk of sampleChunks) {
            console.log(`Embedding: ${chunk.name}`);

            const embedding = await generateEmbedding(chunk);

            const id = await insertCodeChunk(chunk, embedding);

            insertedCount++;

            console.log(`Stored chunk with ID: ${id}`);
        }

        console.log("\nIngestion completed!");
        console.log("Chunks stored:", insertedCount);
    } catch (error) {
        console.error("Ingestion failed:", error.message);
    } finally {
        await pool.end();
    }
}

main();