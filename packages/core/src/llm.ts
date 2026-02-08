import { minimax } from "vercel-minimax-ai-provider";
import { generateText } from "ai";

const result = await generateText({
  model: minimax("MiniMax-M2"),
  prompt: "Explain quantum computing in simple terms.",
});

console.log(result.text);
