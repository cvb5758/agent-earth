'use client';

import { useEffect, useRef, useState } from 'react';

let maplibregl = null;

export default function WalkMap({ waypoints, activeIndex, center, onWaypointClick, isMobile = false }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const polylineRef = useRef(null);
  const walkedPolylineRef = useRef(null);
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
            attribution: '© CARTO © OpenStreetMap',
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
      center: [center.lng, center.lat],
      zoom: 16,
      minZoom: 10,
      maxZoom: 19,
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      drawRoute(map);
      addMarkers(map);

      // Initial position: fly to active waypoint with padding
      const wp = waypoints[activeIndex];
      if (wp) {
        const h = map.getContainer().clientHeight;
        const w = map.getContainer().clientWidth;
        const padding = isMobile
          ? { top: 60, bottom: Math.round(h * 0.65), left: 20, right: 20 }
          : { top: 40, bottom: Math.round(h * 0.35), left: Math.round(w * 0.3), right: 40 };
        map.flyTo({ center: [wp.lng, wp.lat], zoom: 17, duration: 500, padding });
      }
    });

    return () => {
      clearMarkers();
      map.remove();
      mapRef.current = null;
    };
  }, [ready]);

  // Update on activeIndex change
  useEffect(() => {
    if (!mapRef.current || !ready) return;
    const map = mapRef.current;
    const wp = waypoints[activeIndex];
    if (!wp) return;

    // Use padding to push the effective center above the card overlay
    // Mobile: card covers ~60% of bottom → pad bottom 65%
    // Desktop: card is bottom-left → pad bottom 40%, left 30%
    const h = map.getContainer().clientHeight;
    const w = map.getContainer().clientWidth;
    const padding = isMobile
      ? { top: 60, bottom: Math.round(h * 0.65), left: 20, right: 20 }
      : { top: 40, bottom: Math.round(h * 0.35), left: Math.round(w * 0.3), right: 40 };

    map.flyTo({
      center: [wp.lng, wp.lat],
      zoom: activeIndex >= 10 ? 16 : 17,
      duration: 800,
      padding,
    });

    // Update walked polyline
    updateWalkedPolyline(map);
    // Update marker styles
    updateMarkerStyles();
  }, [activeIndex, ready]);

  function drawRoute(map) {
    const coords = waypoints.map(w => [w.lng, w.lat]);

    // Full route (faint)
    map.addSource('route-full', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } },
    });
    map.addLayer({
      id: 'route-full',
      type: 'line',
      source: 'route-full',
      paint: { 'line-color': '#c9a961', 'line-width': 2, 'line-opacity': 0.4 },
    });

    // Walked route (bright)
    map.addSource('route-walked', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords.slice(0, 1) } },
    });
    map.addLayer({
      id: 'route-walked',
      type: 'line',
      source: 'route-walked',
      paint: { 'line-color': '#c9a961', 'line-width': 3, 'line-opacity': 0.9 },
    });
  }

  function updateWalkedPolyline(map) {
    const source = map.getSource('route-walked');
    if (!source) return;
    const coords = waypoints.slice(0, activeIndex + 1).map(w => [w.lng, w.lat]);
    source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
  }

  function addMarkers(map) {
    clearMarkers();
    waypoints.forEach((wp, i) => {
      const el = document.createElement('div');
      el.className = 'wp-marker';
      el.dataset.idx = i;
      updateSingleMarker(el, i);

      el.addEventListener('click', () => {
        if (onWaypointClick) onWaypointClick(i);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([wp.lng, wp.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }

  function updateSingleMarker(el, i) {
    const isActive = i === activeIndex;
    const isVisited = i < activeIndex;
    const size = isActive ? '18px' : '10px';
    const bg = isActive ? '#c9a961' : isVisited ? '#666' : '#333';
    const border = isActive ? '3px solid #fff' : '2px solid #555';
    const shadow = isActive ? '0 0 12px rgba(201,169,97,0.6)' : 'none';

    Object.assign(el.style, {
      width: size, height: size,
      background: bg, border: border,
      borderRadius: '50%', cursor: 'pointer',
      boxShadow: shadow,
      transition: 'all 0.3s ease',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '9px', fontWeight: '700', color: '#fff',
    });

    el.textContent = isActive ? String(i + 1) : '';
  }

  function updateMarkerStyles() {
    markersRef.current.forEach((marker, i) => {
      updateSingleMarker(marker.getElement(), i);
    });
  }

  function clearMarkers() {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
  }

  return (
    <>
      <div ref={mapContainer} style={{ position: 'absolute', inset: 0 }} />
      <style jsx global>{`
        @import url('https://unpkg.com/maplibre-gl@4.1.2/dist/maplibre-gl.css');
        .wp-marker { pointer-events: auto; }
        .wp-marker:hover { transform: scale(1.2); }
      `}</style>
    </>
  );
}
