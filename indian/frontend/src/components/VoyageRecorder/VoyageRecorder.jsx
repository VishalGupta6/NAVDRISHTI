import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, FastForward, Clock, ShieldAlert, Navigation, Compass } from 'lucide-react';
import './VoyageRecorder.css';

function VoyageRecorder({ trackHistory = [], vesselName = 'UNIT', onPointSelect }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, 5x

  const totalPoints = trackHistory.length;
  const currentPoint = trackHistory[currentIndex] || trackHistory[0] || {};

  useEffect(() => {
    let timer;
    if (isPlaying && totalPoints > 0) {
      timer = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= totalPoints - 1) {
            setIsPlaying(false);
            return prev;
          }
          const next = prev + 1;
          if (onPointSelect) onPointSelect(trackHistory[next]);
          return next;
        });
      }, 1000 / playbackSpeed);
    }
    return () => clearInterval(timer);
  }, [isPlaying, totalPoints, playbackSpeed, trackHistory, onPointSelect]);

  const handleSliderChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setCurrentIndex(val);
    if (onPointSelect && trackHistory[val]) onPointSelect(trackHistory[val]);
  };

  return (
    <div className="voyage-recorder-panel glass-panel">
      <div className="recorder-header">
        <div className="rec-title">
          <Clock size={16} color="#00f2fe" />
          <span>BLACK BOX VOYAGE & INCIDENT REPLAY</span>
        </div>
        <div className="rec-speed-group">
          <span className="speed-lbl">SPEED:</span>
          {[1, 2, 5].map((spd) => (
            <button
              key={spd}
              className={`speed-btn ${playbackSpeed === spd ? 'active' : ''}`}
              onClick={() => setPlaybackSpeed(spd)}
            >
              {spd}x
            </button>
          ))}
        </div>
      </div>

      <div className="recorder-scrubber-area">
        <button 
          className="play-pause-btn" 
          onClick={() => setIsPlaying(!isPlaying)}
          title={isPlaying ? "Pause Replay" : "Play Blackbox Voyage"}
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <button 
          className="reset-btn" 
          onClick={() => { setIsPlaying(false); setCurrentIndex(0); }}
          title="Reset to Start"
        >
          <RotateCcw size={14} />
        </button>

        <div className="scrubber-track">
          <input
            type="range"
            min="0"
            max={Math.max(0, totalPoints - 1)}
            value={currentIndex}
            onChange={handleSliderChange}
            className="timeline-slider"
          />
          <div className="timeline-meta">
            <span>START: {trackHistory[0]?.timestamp?.substring(11, 19) || '00:00:00'}</span>
            <span className="current-stamp">
              REC PING #{currentIndex + 1}/{totalPoints || 1} • {currentPoint.timestamp?.substring(11, 19) || 'LIVE'}
            </span>
            <span>END: {trackHistory[totalPoints - 1]?.timestamp?.substring(11, 19) || 'NOW'}</span>
          </div>
        </div>
      </div>

      <div className="telemetry-snapshot">
        <div className="snap-item">
          <Navigation size={12} color="#38bdf8" />
          <span>LAT/LON: <strong>{currentPoint.lat?.toFixed(4) || '---'}°N, {currentPoint.lon?.toFixed(4) || '---'}°E</strong></span>
        </div>
        <div className="snap-item">
          <Compass size={12} color="#38bdf8" />
          <span>SOG/COG: <strong>{currentPoint.sog || 14} kts / {currentPoint.cog || 210}°</strong></span>
        </div>
        <div className="snap-item">
          <span>STATUS: <strong>{currentPoint.nav_status || 'Underway'}</strong></span>
        </div>
      </div>
    </div>
  );
}

export default VoyageRecorder;
