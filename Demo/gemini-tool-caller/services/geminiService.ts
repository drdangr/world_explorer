import { GoogleGenAI, FunctionDeclaration, Type, GenerateContentResponse, Chat } from "@google/genai";
import { ToolName } from "../types";

// Initialize Gemini Client
// Hardcoded for demo reliability
const apiKey = "AIzaSyAl5ux0Vv7n7aHEwCbdKkGivKvnnt1rJmI";
const ai = new GoogleGenAI({ apiKey: apiKey });

// Use a valid model name - as in original demo
export const MODEL_NAME = 'gemini-2.5-flash';

// Define the tools
const toolDefinitions: FunctionDeclaration[] = [
  {
    name: ToolName.TOOL_1,
    description: "Activates tool number 1 when the user requests it.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: ToolName.TOOL_2,
    description: "Activates tool number 2 when the user requests it.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: ToolName.TOOL_3,
    description: "Activates tool number 3 when the user requests it.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];

let chatSession: Chat | null = null;

export const initializeChat = () => {
  chatSession = ai.chats.create({
    model: MODEL_NAME,
    config: {
      systemInstruction: "You are a helpful assistant. When the user clicks a button or asks to use a tool, immediately call the corresponding function. Do not ask for confirmation.",
      tools: [{ functionDeclarations: toolDefinitions }],
      toolConfig: {
        functionCallingConfig: {
          mode: "ANY" as any, // Force the model to call a function
        },
      },
    },
  });
};

export const sendMessage = async (message: string): Promise<GenerateContentResponse> => {
  if (!chatSession) {
    initializeChat();
  }

  if (!chatSession) {
    throw new Error("Failed to initialize chat session");
  }

  // Send the user message
  const response = await chatSession.sendMessage({ message });
  return response;
};

export const sendToolResponse = async (toolId: string, toolName: string, result: string): Promise<GenerateContentResponse> => {
  if (!chatSession) {
    throw new Error("No active chat session");
  }

  // Send the execution result back to Gemini so it can complete the turn.
  // We must wrap the parts array in the 'message' property.
  const response = await chatSession.sendMessage({
    message: [
      {
        functionResponse: {
          name: toolName,
          response: { result: result },
          id: toolId
        }
      }
    ]
  });
  return response;
}