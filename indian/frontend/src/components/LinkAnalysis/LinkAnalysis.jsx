import React, { useState, useEffect, useMemo, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Share2, ServerCog, Maximize2, ShieldAlert } from 'lucide-react';
import './LinkAnalysis.css';

const LinkAnalysis = ({ vessels, alerts, onSelectNode }) => {
  const fgRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const containerRef = useRef(null);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const reHeatSimulation = () => {
    if (fgRef.current) {
      fgRef.current.d3ReheatSimulation();
    }
  };

  const graphData = useMemo(() => {
    const nodes = [];
    const links = [];
    const anomalyHubs = {};

    alerts.forEach(alert => {
      // Add Vessel as leaf node
      nodes.push({
        id: alert.mmsi,
        name: alert.vessel_name || alert.mmsi,
        group: 'VESSEL',
        severity: alert.severity,
        val: 10,
      });
      
      // Group by anomaly type using Hub nodes
      alert.anomaly_types.forEach(type => {
        if (type === 'NORMAL') return;
        
        if (!anomalyHubs[type]) {
          anomalyHubs[type] = true;
          nodes.push({
            id: `hub-${type}`,
            name: type.replace(/_/g, ' ') + ' NETWORK',
            group: 'HUB',
            val: 20,
          });
        }
        
        // Link vessel to the anomaly hub
        links.push({
          source: alert.mmsi,
          target: `hub-${type}`,
          type: type,
        });
      });
    });

    return { nodes, links };
  }, [alerts]);

  const renderNode = (node, ctx, globalScale) => {
    const label = node.name;
    const fontSize = node.group === 'HUB' ? 16 / globalScale : 12 / globalScale;
    ctx.font = `${node.group === 'HUB' ? 'bold' : ''} ${fontSize}px Inter, sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const padding = fontSize * 0.4;
    const bgW = textWidth + padding * 2;
    const bgH = fontSize + padding;

    // Node Background
    ctx.fillStyle = node.group === 'HUB' ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = node.group === 'HUB' ? '#ef4444' : '#64748b';
    ctx.lineWidth = 2 / globalScale;
    
    // Draw Box
    ctx.beginPath();
    ctx.roundRect(node.x - bgW / 2, node.y - bgH / 2, bgW, bgH, 4 / globalScale);
    ctx.fill();
    ctx.stroke();

    // Node Text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    if (node.group === 'HUB') {
        ctx.fillStyle = '#fca5a5';
    } else {
        switch(node.severity) {
            case 'CRITICAL': ctx.fillStyle = '#ef4444'; break;
            case 'HIGH': ctx.fillStyle = '#f97316'; break;
            case 'MEDIUM': ctx.fillStyle = '#f59e0b'; break;
            default: ctx.fillStyle = '#38bdf8'; break;
        }
    }
    
    ctx.fillText(label, node.x, node.y);
    node.__bckgDimensions = [bgW, bgH]; 
  };

  const nodePointerAreaPaint = (node, color, ctx) => {
    ctx.fillStyle = color;
    const bckgDimensions = node.__bckgDimensions;
    if (bckgDimensions) {
      ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, ...bckgDimensions);
    } else {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
      ctx.fill();
    }
  };



  return (
    <div className="link-analysis-container glass-panel">
      <div className="la-header">
        <div className="la-title">
          <Share2 className="text-cyan-400" size={24} />
          <h2>Entity Link Analysis</h2>
        </div>
        <div className="la-actions">
          <button className="icon-btn" title="Re-simulate Physics" onClick={reHeatSimulation}>
            <ServerCog size={18} />
          </button>
          <button className="icon-btn" title="Toggle Fullscreen" onClick={toggleFullscreen}>
            <Maximize2 size={18} />
          </button>
        </div>
      </div>
      
      <div className="la-stats-strip">
        <div className="stat-pill outline">Nodes: <span className="highlight-text">{graphData.nodes.length}</span></div>
        <div className="stat-pill outline">Edges: <span className="highlight-text">{graphData.links.length}</span></div>
        {alerts.length > 0 && (
          <div className="stat-pill critical outline">
             <ShieldAlert size={14} style={{marginRight: '6px'}}/> Target Networks Detected
          </div>
        )}
      </div>

      <div className="la-graph-area" ref={containerRef}>
        {graphData.nodes.length > 0 && typeof window !== 'undefined' ? (
           <ForceGraph2D
             ref={fgRef}
             width={dimensions.width}
             height={dimensions.height}
             graphData={graphData}
             nodeCanvasObject={renderNode}
             nodePointerAreaPaint={nodePointerAreaPaint}
             linkColor={link => link.type === 'STS_TRANSFER' ? 'rgba(239, 68, 68, 0.4)' : 'rgba(148, 163, 184, 0.2)'}
             linkWidth={link => link.type === 'STS_TRANSFER' ? 3 : 1.5}
             linkDirectionalParticles={link => link.type === 'STS_TRANSFER' ? 4 : 1}
             linkDirectionalParticleSpeed={0.01}
             linkDirectionalParticleColor={() => '#ef4444'}
             linkDirectionalParticleWidth={4}
             onNodeClick={node => node.group !== 'HUB' && onSelectNode(node.id)}
             onNodeHover={node => containerRef.current.style.cursor = node ? 'pointer' : null}
             backgroundColor="transparent"
             d3VelocityDecay={0.4}
             d3AlphaDecay={0.02}
             cooldownTicks={100}
             nodeRelSize={8}
           />
        ) : (
          <div className="la-empty">Insufficient tracking data to perform link analysis.</div>
        )}
        
        {graphData.nodes.length > 0 && (
          <div className="la-legend glass-panel">
            <div className="legend-item"><span className="dot hub"></span> Network Hub</div>
            <div className="legend-item"><span className="dot critical"></span> Critical Vessel</div>
            <div className="legend-item"><span className="dot normal"></span> Normal Vessel</div>
            <div className="legend-item"><span className="dot transfer"></span> Active Transfer</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LinkAnalysis;
