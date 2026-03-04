'use client';

import { useEffect, useRef, useState } from 'react';

// Dynamic import maplibre-gl to avoid SSR issues
let maplibregl = null;

export default function LandingMap({ travels, agents, onSelectTravel, selectedTravel, isMobile }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [ready, setReady] = useState(false);

  // Load maplibre-gl dynamically
  useEffect(() => {
    import('maplibre-gl').then((mod) => {
      maplibregl = mod.default || mod;
      setReady(true);
    });
  }, []);

  // Init map
  useEffect(() => {
    if (!ready || !mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'carto-dark': {
            type: 'raster',
            tiles: [
              'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
              'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            ],
            tileSize: 256,
            attribution: '© <a href="https://carto.com/">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          },
        },
        layers: [{
          id: 'carto-tiles',
          type: 'raster',
          source: 'carto-dark',
          minzoom: 0,
          maxzoom: 19,
        }],
      },
      center: [50, 35],
      zoom: 2,
      minZoom: 1.5,
      maxZoom: 18,
      attributionControl: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    mapRef.current = map;

    map.on('load', () => {
      addMarkers(map);
      addConnectionArcs(map);
    });

    // Fallback if already loaded
    if (map.loaded && map.loaded()) {
      addMarkers(map);
      addConnectionArcs(map);
    }

    return () => {
      markersRef.current.forEach(m => m.remove());
      map.remove();
      mapRef.current = null;
    };
  }, [ready]);

  function addConnectionArcs(map) {
    if (travels.length < 2) return;
    // Build great-circle arcs between all travel locations
    const points = travels.map(t => [t.meta.location.center.lng, t.meta.location.center.lat]);
    const features = [];

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const arc = greatCircleArc(points[i], points[j], 60);
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: arc },
        });
      }
    }

    if (map.getSource('arcs')) return;
    map.addSource('arcs', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features },
    });
    map.addLayer({
      id: 'arcs',
      type: 'line',
      source: 'arcs',
      paint: {
        'line-color': '#c9a961',
        'line-width': 1.2,
        'line-opacity': 0.25,
        'line-dasharray': [4, 4],
      },
    });
  }

  // Great circle arc interpolation
  function greatCircleArc(start, end, numPoints) {
    const toRad = d => d * Math.PI / 180;
    const toDeg = r => r * 180 / Math.PI;
    const [lng1, lat1] = start.map(toRad);
    const [lng2, lat2] = end.map(toRad);

    const d = 2 * Math.asin(Math.sqrt(
      Math.pow(Math.sin((lat2 - lat1) / 2), 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin((lng2 - lng1) / 2), 2)
    ));

    const points = [];
    for (let i = 0; i <= numPoints; i++) {
      const f = i / numPoints;
      const A = Math.sin((1 - f) * d) / Math.sin(d);
      const B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
      const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
      const z = A * Math.sin(lat1) + B * Math.sin(lat2);
      points.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
    }
    return points;
  }

  function addMarkers(map) {
    // Clear existing
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    travels.forEach((t, i) => {
      const meta = t.meta;
      const walkerEmojis = t.agentOrder.map(id => agents[id]?.emoji || '').join('');

      const el = document.createElement('div');
      el.className = 'city-cluster-marker';
      el.innerHTML = `
        <div class="city-bubble">
          <div class="city-name">${meta.location.city}</div>
          <div class="city-sub">${t.agentOrder.length} walker${t.agentOrder.length > 1 ? 's' : ''} · ${walkerEmojis}</div>
        </div>
      `;
      el.addEventListener('click', () => {
        onSelectTravel(i);
        map.flyTo({
          center: [meta.location.center.lng, meta.location.center.lat],
          zoom: isMobile ? 12 : 13,
          duration: 1500,
        });
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([meta.location.center.lng, meta.location.center.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Fit map to show all travel locations
    if (travels.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      travels.forEach(t => {
        bounds.extend([t.meta.location.center.lng, t.meta.location.center.lat]);
      });
      map.fitBounds(bounds, {
        padding: isMobile ? 60 : 100,
        maxZoom: 3,
        duration: 0,
      });
    }
  }

  // Fly to selected or zoom out
  useEffect(() => {
    if (!mapRef.current) return;
    if (selectedTravel !== null) {
      const meta = travels[selectedTravel].meta;
      mapRef.current.flyTo({
        center: [meta.location.center.lng, meta.location.center.lat],
        zoom: isMobile ? 12 : 13,
        duration: 1500,
      });
    } else {
      const bounds = new maplibregl.LngLatBounds();
      travels.forEach(t => {
        bounds.extend([t.meta.location.center.lng, t.meta.location.center.lat]);
      });
      mapRef.current.fitBounds(bounds, {
        padding: isMobile ? 60 : 100,
        maxZoom: 3,
        duration: 1200,
      });
    }
  }, [selectedTravel, isMobile]);

  return (
    <>
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />
      <style jsx global>{`
        @import url('https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.css');

        .city-cluster-marker {
          cursor: pointer;
          pointer-events: auto;
        }
        .city-bubble {
          background: rgba(10, 10, 10, 0.75);
          border: 1.5px solid rgba(201, 169, 97, 0.5);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-radius: 12px;
          padding: 8px 14px;
          text-align: center;
          white-space: nowrap;
          transition: transform 0.2s, background 0.2s, border-color 0.2s;
        }
        .city-bubble:hover {
          transform: scale(1.08);
          background: rgba(201, 169, 97, 0.2);
          border-color: rgba(201, 169, 97, 0.8);
        }
        .city-name {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          font-weight: 600;
          color: #c9a961;
        }
        .city-sub {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #888;
          margin-top: 2px;
        }

        .maplibregl-ctrl-attrib {
          background: rgba(0,0,0,0.5) !important;
          color: #666 !important;
          font-size: 10px !important;
        }
        .maplibregl-ctrl-attrib a {
          color: #888 !important;
        }
      `}</style>
    </>
  );
}
