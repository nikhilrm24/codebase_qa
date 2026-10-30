require("dotenv").config();
const { chunkRepository } = require("./chunker");
const { GoogleGenAI } = require("@google/genai");

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
        const embeddedChunks = [];

        for (const chunk of sampleChunks) {
            console.log(`Embedding: ${chunk.name}`);

            const embedding = await generateEmbedding(chunk);

            embeddedChunks.push({
                ...chunk,
                embedding
            });
        }

        console.log("\nEmbedding generation completed!");
        console.log("Chunks processed:", embeddedChunks.length);
        console.log(
            "Vector dimensions:",
            embeddedChunks[0]?.embedding.length
        );

        const embedding = await generateEmbedding(chunk);

        console.log("\nEmbedding generated successfully!");
        console.log("Chunk name:", chunk.name);
        console.log("File:", chunk.filePath);
        console.log("Vector dimensions:", embedding.length);
    } catch (error) {
        console.error("Embedding generation failed:", error.message);
    }
}

main();