import { Message } from "@langchain/langgraph-sdk";
import { AssistantMessage } from "./ai";
import { Thinking } from "./thinking";
import { useStreamContext } from "@/providers/Stream";
import { Checkpoint } from "@langchain/langgraph-sdk";

interface AssistantTurnProps {
  messages: Message[];
  isLoading: boolean;
  handleRegenerate: (parentCheckpoint: Checkpoint | null | undefined) => void;
}

export function AssistantTurn({
  messages,
  isLoading,
  handleRegenerate,
}: AssistantTurnProps) {
  // Identify "Thinking" parts and "Final" parts
  // We want to group all Tool Calls and Tool Results into a Thinking box.
  // We also want to put intermediate text into the Thinking box if possible.
  
  // Revised Heuristic:
  // 1. If the last message is a tool call/result, then EVERYTHING is thinking.
  // 2. If the last message is a text message:
  //    - If we are still loading, we treat it as "Thinking" to avoid "jump in" effect
  //      (where text starts outside, then jumps inside when tool calls arrive).
  //    - If we are done loading, it is the "Final Answer".
  
  const lastMessage = messages[messages.length - 1];
  const isLastMessageTool = lastMessage.type === "tool" || (lastMessage.type === "ai" && lastMessage.tool_calls && lastMessage.tool_calls.length > 0);
  
  let thinkingMessages: Message[] = [];
  let finalMessages: Message[] = [];
  let isThinkingLoading = false;

  if (isLastMessageTool) {
    // Case 1: The turn ends with a tool call/result.
    thinkingMessages = messages;
    isThinkingLoading = isLoading;
  } else {
    // Case 2: The turn ends with a text message.
    if (isLoading) {
       // While loading, assume it MIGHT be a thought/tool-precursor.
       // This ensures it starts inside the box.
       thinkingMessages = messages;
       finalMessages = [];
       isThinkingLoading = true;
    } else {
       // Done loading. The last message is the final answer.
       thinkingMessages = messages.slice(0, -1);
       finalMessages = [lastMessage];
       isThinkingLoading = false;
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {thinkingMessages.length > 0 && (
        <Thinking isLoading={isThinkingLoading}>
          <div className="flex flex-col gap-4">
            {thinkingMessages.map((msg, idx) => (
              <AssistantMessage
                key={msg.id || `thinking-${idx}`}
                message={msg}
                isLoading={false} // Don't show loading indicators inside thinking history
                handleRegenerate={handleRegenerate}
                hideControls={true} // We probably don't want regenerate buttons inside the thinking history
              />
            ))}
          </div>
        </Thinking>
      )}
      
      {finalMessages.map((msg, idx) => (
        <AssistantMessage
          key={msg.id || `final-${idx}`}
          message={msg}
          isLoading={isLoading && idx === finalMessages.length - 1}
          handleRegenerate={handleRegenerate}
        />
      ))}
    </div>
  );
}
