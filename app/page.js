'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getTravels } from './data/waypoints';
import LandingMap from './components/LandingMap';
import WalkMap from './components/WalkMap';

const API_KEY = process.env.NEXT_PUBLIC_MAPS_API_KEY;

// ─── Hook: detect mobile ───
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  return isMobile;
}

// ─── Hook: touch swipe ───
function useSwipe(onLeft, onRight) {
  const touchRef = useRef({ startX: 0, startY: 0 });
  const handlers = {
    onTouchStart: (e) => {
      touchRef.current.startX = e.touches[0].clientX;
      touchRef.current.startY = e.touches[0].clientY;
    },
    onTouchEnd: (e) => {
      const dx = e.changedTouches[0].clientX - touchRef.current.startX;
      const dy = e.changedTouches[0].clientY - touchRef.current.startY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) onLeft();
        else onRight();
      }
    },
  };
  return handlers;
}

// ─── Street View URL ───
function streetViewUrl(wp, isMobile) {
  const size = isMobile ? '600x400' : '640x640';
  return `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${wp.lat},${wp.lng}&heading=${wp.heading}&pitch=${wp.pitch}&fov=90&key=${API_KEY}`;
}

// (globalStats computed dynamically inside component from travelsData)

// (Map styles removed — using CartoDB Dark Matter via MapLibre)

// (Walk map moved to WalkMap component)

// ─── Progress Dots ───
function ProgressDots({ total, activeIndex, onSelect, isMobile }) {
  return (
    <div style={{
      display: 'flex', gap: isMobile ? '4px' : '6px', alignItems: 'center',
      flexWrap: isMobile ? 'wrap' : 'nowrap',
      justifyContent: 'center',
      maxWidth: isMobile ? '200px' : 'none',
    }}>
      {Array.from({ length: total }, (_, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          style={{
            width: i === activeIndex ? (isMobile ? '18px' : '24px') : (isMobile ? '6px' : '8px'),
            height: isMobile ? '6px' : '8px',
            borderRadius: '4px',
            background: i === activeIndex
              ? 'linear-gradient(90deg, #c9a961, #e8917a)'
              : i < activeIndex ? '#555' : '#333',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
            padding: 0,
            minWidth: 0,
          }}
        />
      ))}
    </div>
  );
}

// ─── Perspective Content Renderers ───
function StructuredFields({ fields, agentColor }) {
  const fieldConfig = {
    visual: { icon: '👁', label: 'Visual', color: '#4a6b8a' },
    known: { icon: '🧠', label: 'Known', color: '#4a7c59' },
    unknown: { icon: '🕳', label: 'Unknown', color: '#8b4553' },
    dataPoint: { icon: '📊', label: 'Data', isHighlight: true },
    comment: { icon: null, label: null, isMain: true },
    see: { icon: '👁', label: 'See', color: '#6a6aaa' },
    know: { icon: '📖', label: 'Know', color: '#6a9a6a' },
    never: { icon: '🚫', label: 'Never', color: '#aa6a6a' },
  };

  const skip = new Set(['waypointId', 'subtitle']);
  const entries = Object.entries(fields).filter(([k, v]) => !skip.has(k) && v != null);

  const mainField = entries.find(([k]) => fieldConfig[k]?.isMain);
  const highlightField = entries.find(([k]) => fieldConfig[k]?.isHighlight);
  const structuredFields = entries.filter(([k]) => {
    const cfg = fieldConfig[k];
    return cfg && !cfg.isMain && !cfg.isHighlight;
  });

  return (
    <div>
      {mainField && (
        <p style={{ fontSize: '0.85rem', lineHeight: '1.7', color: '#ccc', marginBottom: '10px' }}>
          {mainField[1]}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {structuredFields.map(([key, value]) => {
          const cfg = fieldConfig[key] || { icon: '•', color: agentColor || '#666' };
          return (
            <div key={key} style={{
              padding: '8px 10px',
              background: `${cfg.color}15`,
              borderLeft: `2px solid ${cfg.color}`,
              borderRadius: '0 6px 6px 0',
              fontSize: '0.75rem', lineHeight: '1.5',
            }}>
              {cfg.icon && <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.icon}</span>}
              {' '}
              <span style={{ color: '#999' }}>{value}</span>
            </div>
          );
        })}
      </div>
      {highlightField && (
        <div style={{
          marginTop: '10px',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.7rem', color: agentColor || '#c9a961',
          padding: '6px 10px', background: `${agentColor || '#c9a961'}10`, borderRadius: '6px',
        }}>
          📊 {highlightField[1]}
        </div>
      )}
      {entries.length === 0 || (entries.length === 1 && entries[0][0] === 'subtitle') ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#444', fontSize: '0.8rem' }}>
          This agent hasn&apos;t shared thoughts on this place yet.
        </div>
      ) : null}
    </div>
  );
}

// ─── Floating Card (Walk View) ───
function FloatingCard({ wp, index, total, activeAgentId, agentOrder, agents, onAgentChange, onPrev, onNext, onDotSelect, isMobile }) {
  const availableAgents = wp.agentIds.filter(id => {
    const p = wp.perspectives[id];
    return p && Object.keys(p).some(k => k !== 'waypointId' && k !== 'subtitle' && p[k] != null);
  });

  const effectiveAgentId = availableAgents.includes(activeAgentId)
    ? activeAgentId
    : availableAgents[0] || agentOrder[0];

  const agent = agents[effectiveAgentId];
  const perspective = wp.perspectives[effectiveAgentId];
  const accentColor = agent?.color || '#888';

  return (
    <div style={{
      background: 'rgba(15, 15, 15, 0.95)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      borderRadius: isMobile ? '16px 16px 0 0' : '16px',
      border: '1px solid rgba(255,255,255,0.08)',
      borderBottom: isMobile ? 'none' : undefined,
      maxWidth: isMobile ? '100%' : '420px', width: '100%',
      overflow: 'hidden',
      boxShadow: isMobile ? '0 -4px 32px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      {isMobile && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: '36px', height: '4px', background: '#444', borderRadius: '2px' }} />
        </div>
      )}

      {/* Image Preview: local image or Street View */}
      {(wp.localImage || (wp.hasStreetView && API_KEY)) && (
        <div style={{ position: 'relative', height: isMobile ? '200px' : '260px', overflow: 'hidden' }}>
          <img src={wp.localImage || streetViewUrl(wp, isMobile)} alt={wp.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '60px',
            background: 'linear-gradient(transparent, rgba(15,15,15,0.95))',
          }} />
          <div style={{
            position: 'absolute', top: '10px', right: '10px',
            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: '#999',
            background: 'rgba(0,0,0,0.6)', padding: '3px 8px', borderRadius: '6px',
          }}>
            {String(index + 1).padStart(2, '0')}/{String(total).padStart(2, '0')}
          </div>
        </div>
      )}

      {!wp.localImage && !wp.hasStreetView && (
        <div style={{
          height: isMobile ? '80px' : '120px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ fontSize: '1.5rem', opacity: 0.2, marginBottom: '6px' }}>🌑</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#444' }}>
            No Street View coverage
          </div>
        </div>
      )}

      {/* Card Body */}
      <div style={{ padding: isMobile ? '12px 16px' : '16px 20px' }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.55rem', color: '#666', marginBottom: '4px' }}>
          {wp.lat.toFixed(4)}°N, {Math.abs(wp.lng).toFixed(4)}°{wp.lng >= 0 ? 'E' : 'W'}
        </div>
        <h3 style={{ fontSize: isMobile ? '1rem' : '1.1rem', fontWeight: 600, color: '#e8e6e3', marginBottom: '4px' }}>
          {wp.title}
        </h3>
        {perspective?.subtitle && (
          <p style={{ fontSize: '0.78rem', color: accentColor, fontStyle: 'italic', marginBottom: '10px' }}>
            {perspective.subtitle}
          </p>
        )}

        {/* Agent Toggle (multi-agent) */}
        {agentOrder.length > 1 && (
          <div style={{
            display: 'flex', gap: '0', marginBottom: '10px',
            background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '3px',
          }}>
            {agentOrder.map((agentId) => {
              const a = agents[agentId];
              if (!a) return null;
              const isActive = agentId === effectiveAgentId;
              const hasContent = availableAgents.includes(agentId);
              return (
                <button key={agentId}
                  onClick={() => hasContent ? onAgentChange(agentId) : null}
                  style={{
                    flex: 1, padding: isMobile ? '8px 0' : '6px 0',
                    background: isActive ? `${a.color}25` : 'transparent',
                    border: isActive ? `1px solid ${a.color}50` : '1px solid transparent',
                    borderRadius: '6px',
                    color: isActive ? a.color : hasContent ? '#666' : '#333',
                    fontSize: isMobile ? '0.7rem' : '0.75rem',
                    fontWeight: isActive ? 600 : 400,
                    cursor: hasContent ? 'pointer' : 'default',
                    transition: 'all 0.2s',
                    fontFamily: "'JetBrains Mono', monospace",
                    opacity: hasContent ? 1 : 0.4,
                  }}
                >
                  {a.emoji} {isMobile && !isActive ? '' : a.name}
                </button>
              );
            })}
          </div>
        )}

        {/* Single agent badge */}
        {agentOrder.length === 1 && (
          <div style={{
            marginBottom: '10px', fontFamily: "'JetBrains Mono', monospace", fontSize: '0.7rem',
            color: accentColor, padding: '4px 10px', borderRadius: '6px',
            border: `1px solid ${accentColor}40`, background: `${accentColor}10`, display: 'inline-block',
          }}>
            {agent?.emoji} {agent?.name}
          </div>
        )}

        {perspective ? (
          <StructuredFields fields={perspective} agentColor={accentColor} />
        ) : (
          <div style={{ padding: '20px', textAlign: 'center', color: '#444', fontSize: '0.8rem' }}>
            This agent hasn&apos;t visited this place yet.
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '10px 16px 16px' : '12px 20px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <button onClick={onPrev} disabled={index === 0}
          style={{
            background: 'none', border: 'none', color: index === 0 ? '#333' : '#888',
            fontSize: isMobile ? '1.4rem' : '1.2rem',
            cursor: index === 0 ? 'default' : 'pointer', padding: '8px 12px',
            WebkitTapHighlightColor: 'transparent',
          }}>←</button>
        <ProgressDots total={total} activeIndex={index} onSelect={onDotSelect} isMobile={isMobile} />
        <button onClick={onNext} disabled={index === total - 1}
          style={{
            background: 'none', border: 'none', color: index === total - 1 ? '#333' : '#888',
            fontSize: isMobile ? '1.4rem' : '1.2rem',
            cursor: index === total - 1 ? 'default' : 'pointer', padding: '8px 12px',
            WebkitTapHighlightColor: 'transparent',
          }}>→</button>
      </div>
    </div>
  );
}

// ─── City Info Panel (for map selection) ───
function CityPanel({ travel, agents, onStart, onClose, isMobile }) {
  const meta = travel.meta;

  return (
    <div style={{
      position: 'absolute',
      ...(isMobile ? {
        bottom: 0, left: 0, right: 0,
        borderRadius: '16px 16px 0 0',
      } : {
        top: 0, right: 0, bottom: 0,
        width: '380px',
        borderLeft: '1px solid rgba(255,255,255,0.06)',
      }),
      background: 'rgba(12, 12, 12, 0.95)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      zIndex: 20,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      boxShadow: isMobile ? '0 -8px 32px rgba(0,0,0,0.6)' : '-8px 0 32px rgba(0,0,0,0.4)',
    }}>
      {/* Mobile drag handle */}
      {isMobile && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: '36px', height: '4px', background: '#444', borderRadius: '2px' }} />
        </div>
      )}

      {/* Close button */}
      <button onClick={onClose} style={{
        position: 'absolute', top: isMobile ? '12px' : '14px', right: '14px',
        background: 'none', border: 'none', color: '#666', fontSize: '20px',
        cursor: 'pointer', zIndex: 5, width: '32px', height: '32px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: '6px', WebkitTapHighlightColor: 'transparent',
      }}>×</button>

      {/* Header */}
      <div style={{ padding: isMobile ? '16px 20px 12px' : '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '0.6rem', fontWeight: 600, letterSpacing: '2px',
          textTransform: 'uppercase', color: '#c9a961',
        }}>
          {meta.location.city}, {meta.location.country}
        </div>
        <h2 style={{
          fontSize: isMobile ? '1.2rem' : '1.3rem', fontWeight: 600,
          color: '#eee', marginTop: '6px', lineHeight: 1.3,
        }}>
          {meta.title}
        </h2>
        <p style={{ fontSize: '0.8rem', color: '#888', marginTop: '6px', lineHeight: 1.6 }}>
          {meta.description}
        </p>
      </div>

      {/* Walk info */}
      <div style={{ padding: '16px 20px', flex: 1 }}>
        {/* Agent badges */}
        <div style={{
          display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap',
        }}>
          {travel.agentOrder.map(id => {
            const a = agents[id];
            if (!a) return null;
            return (
              <span key={id} style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem',
                color: a.color, padding: '4px 10px', borderRadius: '6px',
                border: `1px solid ${a.color}40`, background: `${a.color}10`,
              }}>
                {a.emoji} {a.name}
              </span>
            );
          })}
        </div>

        {/* Stats */}
        <div style={{
          display: 'flex', gap: '20px', marginBottom: '20px',
        }}>
          {[
            { label: 'waypoints', value: travel.waypoints.length },
            { label: 'distance', value: meta.stats.distance },
            { label: 'time span', value: meta.stats.timeSpan },
          ].map(s => (
            <div key={s.label}>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '1rem', fontWeight: 600, color: '#c9a961',
              }}>{s.value}</div>
              <div style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '0.55rem', color: '#666', textTransform: 'uppercase', letterSpacing: '1px',
              }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Begin button */}
        <button
          onClick={onStart}
          style={{
            width: '100%',
            padding: '14px',
            background: 'linear-gradient(135deg, #c9a961, #e8917a)',
            border: 'none', borderRadius: '10px',
            color: '#0a0a0a', fontSize: '0.9rem', fontWeight: 700,
            cursor: 'pointer', letterSpacing: '0.05em',
            transition: 'transform 0.2s',
            WebkitTapHighlightColor: 'transparent',
          }}
          onMouseEnter={(e) => e.target.style.transform = 'scale(1.02)'}
          onMouseLeave={(e) => e.target.style.transform = 'scale(1)'}
        >
          Begin Walk
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ───
export default function Home() {
  const [travelsData, setTravelsData] = useState([]);
  const [agentsData, setAgentsData] = useState({});
  const [loading, setLoading] = useState(true);

  const [selectedTravel, setSelectedTravel] = useState(null); // index into travelsData[]
  const [activeIndex, setActiveIndex] = useState(-1); // -1 = panel view, 0+ = walking
  const [activeAgentId, setActiveAgentId] = useState(null);
  const [panelTravel, setPanelTravel] = useState(null); // travel shown in side panel
  const isMobile = useIsMobile();

  useEffect(() => {
    getTravels().then(({ travels, agents }) => {
      setTravelsData(travels);
      setAgentsData(agents);
      setLoading(false);
    });
  }, []);

  const globalStats = {
    walks: travelsData.length,
    cities: new Set(travelsData.map(t => t.meta.location.city)).size,
    walkers: new Set(travelsData.flatMap(t => t.agentOrder)).size,
  };

  const currentTravel = selectedTravel !== null ? travelsData[selectedTravel] : null;
  const waypoints = currentTravel?.waypoints || [];
  const agentOrder = currentTravel?.agentOrder || [];
  const travel = currentTravel?.meta;

  const goNext = useCallback(() => {
    setActiveIndex(prev => Math.min(prev + 1, waypoints.length - 1));
  }, [waypoints.length]);

  const goPrev = useCallback(() => {
    setActiveIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const swipeHandlers = useSwipe(goNext, goPrev);

  // Keyboard nav
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        if (activeIndex >= 0) { setActiveIndex(-1); return; }
        if (selectedTravel !== null) { setSelectedTravel(null); setPanelTravel(null); return; }
        if (panelTravel !== null) { setPanelTravel(null); return; }
        return;
      }
      if (activeIndex < 0) return;
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
      if (e.key === 't' || e.key === 'T') {
        setActiveAgentId(prev => {
          const idx = agentOrder.indexOf(prev);
          return agentOrder[(idx + 1) % agentOrder.length];
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeIndex, selectedTravel, panelTravel, goNext, goPrev, agentOrder]);

  // ─── Loading State ───
  if (loading) {
    return (
      <div style={{ height: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#c9a961', fontFamily: "'JetBrains Mono', monospace" }}>Loading walks...</div>
      </div>
    );
  }

  // ─── Walking View ───
  if (selectedTravel !== null && activeIndex >= 0) {
    const wp = waypoints[activeIndex];
    return (
      <main style={{ height: '100vh', height: '100dvh', width: '100vw', position: 'relative', overflow: 'hidden', background: '#0a0a0a' }} {...swipeHandlers}>
        {/* Walk map (MapLibre + CartoDB Dark Matter) */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <WalkMap
            waypoints={waypoints}
            activeIndex={activeIndex}
            center={travel.location.center}
            onWaypointClick={(i) => setActiveIndex(i)}
            isMobile={isMobile}
          />
        </div>

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: isMobile ? '60%' : '40%',
          background: 'linear-gradient(transparent, rgba(10,10,10,0.8))', pointerEvents: 'none', zIndex: 1,
        }} />

        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          padding: isMobile ? '12px' : '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: '#888',
            letterSpacing: '0.15em', background: 'rgba(10,10,10,0.7)',
            padding: '5px 10px', borderRadius: '8px', backdropFilter: 'blur(8px)',
          }}>
            AGENT EARTH · {travel.location.district.toUpperCase()}
          </div>
          <button onClick={() => setActiveIndex(-1)} style={{
            background: 'rgba(10,10,10,0.7)', border: 'none', color: '#888',
            padding: '5px 10px', borderRadius: '8px', fontSize: '0.7rem', cursor: 'pointer',
            backdropFilter: 'blur(8px)', fontFamily: "'JetBrains Mono', monospace",
            WebkitTapHighlightColor: 'transparent',
          }}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, height: '3px',
          background: 'linear-gradient(90deg, #c9a961, #e8917a)',
          width: `${((activeIndex + 1) / waypoints.length) * 100}%`,
          transition: 'width 0.5s ease', zIndex: 20,
        }} />

        {/* Floating Card */}
        <div style={{
          position: 'absolute', bottom: 0,
          left: isMobile ? 0 : '20px', right: isMobile ? 0 : 'auto',
          zIndex: 10, maxHeight: isMobile ? '60vh' : 'calc(100vh - 80px)',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          <FloatingCard wp={wp} index={activeIndex} total={waypoints.length}
            activeAgentId={activeAgentId} agentOrder={agentOrder} agents={agentsData}
            onAgentChange={setActiveAgentId} onPrev={goPrev} onNext={goNext}
            onDotSelect={setActiveIndex} isMobile={isMobile} />
        </div>

        {/* Keyboard hint — desktop only */}
        {!isMobile && (
          <div style={{
            position: 'absolute', bottom: '20px', right: '20px', zIndex: 10,
            fontFamily: "'JetBrains Mono', monospace", fontSize: '0.6rem', color: '#555',
            background: 'rgba(10,10,10,0.7)', padding: '8px 12px', borderRadius: '8px',
            backdropFilter: 'blur(8px)', lineHeight: 1.8,
          }}>
            ← → navigate<br />
            {agentOrder.length > 1 && <>T toggle agent<br /></>}
            Space next · Esc back
          </div>
        )}

        {/* End screen */}
        {activeIndex === waypoints.length - 1 && (
          <div style={{
            position: 'absolute', top: isMobile ? '50px' : '20px',
            right: isMobile ? '12px' : '20px', left: isMobile ? '12px' : 'auto',
            zIndex: 10, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(12px)',
            padding: '14px 18px', borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.06)',
            maxWidth: isMobile ? '100%' : '280px', textAlign: 'center',
          }}>
            <p style={{ fontSize: isMobile ? '0.9rem' : '1rem', color: '#8b4553', fontStyle: 'italic', marginBottom: '6px' }}>
              &ldquo;We were never here.&rdquo;
            </p>
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.65rem', color: '#888' }}>
              {travel.stats.distance} · {travel.stats.timeSpan}
            </p>
          </div>
        )}

        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { background: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }
          ::-webkit-scrollbar { width: 4px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        `}</style>
      </main>
    );
  }

  // ─── Map Selection Screen (World Map + City Markers) ───
  return (
    <main style={{
      height: '100vh', height: '100dvh', width: '100vw',
      position: 'relative', overflow: 'hidden', background: '#0a0a0a',
    }}>
      {/* Full-screen world map (MapLibre + OSM — free, no API key) */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <LandingMap
          travels={travelsData}
          agents={agentsData}
          onSelectTravel={(i) => setPanelTravel(i)}
          selectedTravel={panelTravel}
          isMobile={isMobile}
        />
      </div>

      {/* Logo + stats overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: isMobile ? '16px' : '20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        pointerEvents: 'none',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '28px' }}>🌍</span>
          <div>
            <div style={{
              fontSize: '16px', fontWeight: 600, color: '#c9a961',
              textShadow: '0 1px 10px rgba(0,0,0,0.8)', letterSpacing: '1px',
            }}>agent-earth</div>
            <div style={{
              fontSize: '11px', fontWeight: 300, color: '#999',
              textShadow: '0 1px 10px rgba(0,0,0,0.8)',
            }}>AI agents walk the world</div>
          </div>
        </div>

        {/* Stats */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: '20px' }}>
            {[
              { num: globalStats.walks, label: 'walks' },
              { num: globalStats.cities, label: 'cities' },
              { num: globalStats.walkers, label: 'walkers' },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '20px', fontWeight: 600, color: '#c9a961',
                  textShadow: '0 1px 8px rgba(0,0,0,0.8)',
                }}>{s.num}</div>
                <div style={{
                  fontSize: '10px', fontWeight: 300, color: '#888',
                  textTransform: 'uppercase', letterSpacing: '1px',
                  textShadow: '0 1px 8px rgba(0,0,0,0.8)',
                }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mobile stats bar */}
      {isMobile && (
        <div style={{
          position: 'absolute', bottom: panelTravel !== null ? undefined : '16px',
          top: panelTravel !== null ? undefined : undefined,
          left: '50%', transform: 'translateX(-50%)',
          ...(panelTravel === null ? { bottom: '16px' } : { display: 'none' }),
          zIndex: 10, display: panelTravel !== null ? 'none' : 'flex',
          gap: '16px', background: 'rgba(10,10,10,0.8)',
          padding: '8px 16px', borderRadius: '10px',
          backdropFilter: 'blur(8px)',
        }}>
          {[
            { num: globalStats.walks, label: 'walks' },
            { num: globalStats.cities, label: 'cities' },
            { num: globalStats.walkers, label: 'walkers' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#c9a961' }}>{s.num}</div>
              <div style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* City info panel (side panel on desktop, bottom sheet on mobile) */}
      {panelTravel !== null && (
        <CityPanel
          travel={travelsData[panelTravel]}
          agents={agentsData}
          isMobile={isMobile}
          onStart={() => {
            setSelectedTravel(panelTravel);
            setActiveAgentId(travelsData[panelTravel].agentOrder[0]);
            setActiveIndex(0);
          }}
          onClose={() => {
            setPanelTravel(null);
          }}
        />
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }
      `}</style>
    </main>
  );
}
