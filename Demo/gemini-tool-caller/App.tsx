import React, { useState, useEffect } from 'react';
import { initializeChat, sendMessage, sendToolResponse } from './services/geminiService';
import { ToolName } from './types';
import { GenerateContentResponse } from "@google/genai";

const App: React.FC = () => {
  const [activeToolMessage, setActiveToolMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    initializeChat();
    addLog("System: Chat initialized. Ready for tool calling.");
  }, []);

  const addLog = (message: string) => {
    setLogs((prev) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...prev]);
  };

  const handleToolTrigger = async (toolNumber: number) => {
    setIsLoading(true);
    setActiveToolMessage(null); // Clear previous output
    const prompt = `Please activate tool ${toolNumber}`;
    
    addLog(`User: "${prompt}"`);

    try {
      // 1. Send the request to Gemini
      const response = await sendMessage(prompt);
      
      // 2. Check for Function Calls in the response
      // Note: In @google/genai, we look at candidates[0].content.parts to find function calls
      const candidates = response.candidates;
      
      if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
        let toolCalled = false;

        for (const part of candidates[0].content.parts) {
          if (part.functionCall) {
            toolCalled = true;
            const fc = part.functionCall;
            const functionName = fc.name;
            const callId = fc.id || 'unknown-id';

            addLog(`Gemini: Decided to call function "${functionName}"`);

            // 3. Execute the client-side logic (The "Tools")
            let resultMessage = "";
            
            switch (functionName) {
              case ToolName.TOOL_1:
                resultMessage = "это инструмент 1";
                setActiveToolMessage(resultMessage);
                break;
              case ToolName.TOOL_2:
                resultMessage = "это инструмент 2";
                setActiveToolMessage(resultMessage);
                break;
              case ToolName.TOOL_3:
                resultMessage = "это инструмент 3";
                setActiveToolMessage(resultMessage);
                break;
              default:
                resultMessage = "Unknown tool called";
                addLog(`Error: ${resultMessage}`);
            }

            // 4. Send the result back to Gemini to complete the loop
            // Although strictly not needed just to update the UI, it keeps the chat history clean in the model's memory.
            await sendToolResponse(callId, functionName, resultMessage);
            addLog(`System: Tool executed. Output: "${resultMessage}"`);
          }
        }

        if (!toolCalled) {
             // If Gemini didn't call a tool (maybe it just chatted), show the text
             const text = response.text;
             if (text) {
                 addLog(`Gemini (Text): ${text}`);
             }
        }
      }
      
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error: Failed to process request. ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
      <div className="max-w-2xl w-full bg-white shadow-xl rounded-2xl overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white">
          <h1 className="text-2xl font-bold">Gemini Tool Caller</h1>
          <p className="text-blue-100 mt-1 text-sm">
            AI-driven Function Calling Demo
          </p>
        </div>

        {/* Main Control Area */}
        <div className="p-8">
          <p className="text-slate-600 mb-6 text-center">
            Нажмите кнопку, чтобы отправить запрос к Gemini. Модель проанализирует запрос и вызовет соответствующую функцию (инструмент).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <ToolButton 
              number={1} 
              onClick={() => handleToolTrigger(1)} 
              disabled={isLoading} 
              color="bg-emerald-500 hover:bg-emerald-600"
            />
            <ToolButton 
              number={2} 
              onClick={() => handleToolTrigger(2)} 
              disabled={isLoading} 
              color="bg-amber-500 hover:bg-amber-600"
            />
            <ToolButton 
              number={3} 
              onClick={() => handleToolTrigger(3)} 
              disabled={isLoading} 
              color="bg-rose-500 hover:bg-rose-600"
            />
          </div>

          {/* Active Tool Output Display */}
          <div className="bg-slate-100 rounded-xl p-6 min-h-[120px] flex flex-col items-center justify-center border-2 border-dashed border-slate-300 relative transition-all">
            {isLoading && (
              <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-xl z-10 backdrop-blur-sm">
                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            )}
            
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Результат инструмента
            </h3>
            
            {activeToolMessage ? (
              <p className="text-2xl font-bold text-slate-800 animate-in fade-in zoom-in duration-300">
                {activeToolMessage}
              </p>
            ) : (
              <p className="text-slate-400 text-sm italic">
                Ожидание вызова инструмента...
              </p>
            )}
          </div>
        </div>

        {/* Logs Console */}
        <div className="bg-slate-900 text-slate-300 p-4 text-xs font-mono h-48 overflow-y-auto border-t border-slate-800">
          <div className="mb-2 text-slate-500 font-bold uppercase tracking-wider">Event Log</div>
          {logs.map((log, index) => (
            <div key={index} className="mb-1 break-words">
              {log}
            </div>
          ))}
          {logs.length === 0 && <span className="opacity-50">System ready.</span>}
        </div>
      </div>
    </div>
  );
};

// Sub-component for buttons
interface ToolButtonProps {
  number: number;
  onClick: () => void;
  disabled: boolean;
  color: string;
}

const ToolButton: React.FC<ToolButtonProps> = ({ number, onClick, disabled, color }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${color} text-white font-bold py-4 px-6 rounded-xl shadow-md 
        transform transition-all duration-200 
        hover:shadow-lg hover:-translate-y-1 active:scale-95 active:shadow-sm
        disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
        flex flex-col items-center justify-center gap-2
      `}
    >
      <span className="text-sm opacity-90 font-medium">Запустить</span>
      <span className="text-xl">Tool {number}</span>
    </button>
  );
};

export default App;