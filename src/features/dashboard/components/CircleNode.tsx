"use client";

import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { memo } from "react";

interface CircleNodeData {
  label: string;
  radius: number;
  mapDescription: string;
  isEntry: boolean;
  isPlayerHere: boolean;
}

function CircleNodeComponent({ data, selected }: NodeProps<CircleNodeData>) {
  const { label, radius, isEntry, isPlayerHere } = data;
  
  return (
    <>
      <Handle 
        type="target" 
        position={Position.Top} 
        style={{ background: 'transparent', border: 'none' }}
        id="target"
      />
      <div
        style={{
          width: radius * 2,
          height: radius * 2,
          borderRadius: "50%",
          border: isPlayerHere 
            ? "3px solid #34d399" 
            : isEntry 
            ? "2px solid rgba(59,130,246,0.6)" 
            : selected
            ? "2px solid rgba(168, 85, 247, 0.6)"
            : "1.5px solid rgba(148, 163, 184, 0.4)",
          padding: 0,
          background: isEntry 
            ? "linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(30,41,59,0.8) 100%)" 
            : "rgba(30,41,59,0.7)",
          color: "rgba(226,232,240,1)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 500,
          textAlign: "center",
          overflow: "hidden",
          boxShadow: isPlayerHere 
            ? "0 0 20px rgba(52, 211, 153, 0.4)"
            : selected
            ? "0 0 15px rgba(168, 85, 247, 0.3)"
            : "0 2px 8px rgba(0,0,0,0.3)",
          transition: "all 0.2s ease",
          cursor: "grab",
        }}
        className="draggable-node"
      >
        <span className="truncate px-2" title={label}>
          {label}
        </span>
      </div>
      <Handle 
        type="source" 
        position={Position.Bottom} 
        style={{ background: 'transparent', border: 'none' }}
        id="source"
      />
    </>
  );
}

export const CircleNode = memo(CircleNodeComponent);