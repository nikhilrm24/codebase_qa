const {
  pool,
  createConversation,
  saveMessage,
  getConversationHistory
} = require("./database");

async function main() {
  try {
    // 1. Create a conversation
    const conversationId = await createConversation(
      "Testing conversation history"
    );

    console.log("Conversation ID:", conversationId);

    // 2. Save messages
    await saveMessage(
      conversationId,
      "user",
      "How does login work?"
    );

    await saveMessage(
      conversationId,
      "assistant",
      "Login is handled by the authentication logic."
    );

    await saveMessage(
      conversationId,
      "user",
      "Which file contains it?"
    );

    // 3. Retrieve conversation history
    const history = await getConversationHistory(conversationId);

    console.log("\nConversation History:");
    console.log(history);

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await pool.end();
  }
}

main();