"use client";

import { useEffect, useRef } from "react";
import { findDistrict } from "@/lib/districts.js";

export function RouteMap({ fromDistrict, toDistrict, referenceRoute, points = [], current = null }) {
  const nodeRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const signature = JSON.stringify({
    fromDistrict,
    toDistrict,
    route: referenceRoute?.coordinates?.length || 0,
    points: points.length ? [points[0], points[points.length - 1], points.length] : [],
    current,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      const L = leaflet.default || leaflet;
      if (cancelled || !nodeRef.current) return;
      leafletRef.current = L;
      if (!mapRef.current) {
        const map = L.map(nodeRef.current);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);
        mapRef.current = map;
      }
      draw(L);
    })();
    return () => {
      cancelled = true;
    };
    // The map instance stays mounted; data refreshes in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (leafletRef.current && mapRef.current) draw(leafletRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  function draw(L) {
    const map = mapRef.current;
    if (!map) return;
    const removable = [];
    map.eachLayer((layer) => {
      if (!layer._url) removable.push(layer);
    });
    removable.forEach((layer) => map.removeLayer(layer));

    const bounds = [];
    const start = findDistrict(fromDistrict);
    const end = findDistrict(toDistrict);
    if (start) {
      bounds.push([start.latitude, start.longitude]);
      L.circleMarker([start.latitude, start.longitude], { radius: 8, color: "#15803d", fillOpacity: 0.9 })
        .addTo(map)
        .bindPopup(`Start: ${start.name}`);
    }
    if (end && end.name !== start?.name) {
      bounds.push([end.latitude, end.longitude]);
      L.circleMarker([end.latitude, end.longitude], { radius: 8, color: "#b91c1c", fillOpacity: 0.9 })
        .addTo(map)
        .bindPopup(`Destination: ${end.name}`);
    }
    if (referenceRoute?.coordinates?.length > 1) {
      const line = referenceRoute.coordinates.map(([lng, lat]) => [lat, lng]);
      bounds.push(...line);
      L.polyline(line, { color: "#64748b", weight: 4, dashArray: "6 8" }).addTo(map);
    }
    if (points.length > 1) {
      const walked = points.map((point) => [point.latitude, point.longitude]);
      bounds.push(...walked);
      L.polyline(walked, { color: "#1d4ed8", weight: 5 }).addTo(map);
    }
    if (current && Number.isFinite(current.latitude) && Number.isFinite(current.longitude)) {
      bounds.push([current.latitude, current.longitude]);
      L.circleMarker([current.latitude, current.longitude], { radius: 7, color: "#1d4ed8", fillColor: "#93c5fd", fillOpacity: 1 })
        .addTo(map)
        .bindPopup("Current location");
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 16 });
    else map.setView([10.5, 76.3], 7);
  }

  return (
    <div className="space-y-2">
      <div ref={nodeRef} className="h-72 w-full overflow-hidden rounded-2xl border border-border bg-muted md:h-96" />
      <p className="text-xs text-muted-foreground">
        The blue line is your recorded walk. A dashed line, when shown, is only a district-to-district reference.
        Your position on the map is your GPS location, not a percentage along that reference.
      </p>
    </div>
  );
}
