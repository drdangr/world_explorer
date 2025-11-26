export enum ToolName {
  TOOL_1 = 'activate_tool_1',
  TOOL_2 = 'activate_tool_2',
  TOOL_3 = 'activate_tool_3',
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
  isToolCall?: boolean;
}
