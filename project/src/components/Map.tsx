import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, ChevronDown } from 'lucide-react';

const icon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

interface Package {
  id: string;
  from: string;
  to: string;
  status: string;
  statusColor: string;
  fromCoords: [number, number];
  toCoords: [number, number];
}

interface TableLayer {
  id: string;
  name: string;
  table_name: string;
  type: 'points' | 'polygons' | 'routes' | 'packages';
  active: boolean;
  count: number;
  color?: string;
  data?: any;
  filterColumn?: string;
  filterValue?: string;
  colorGradient?: {
    column: string;
    minValue: number;
    maxValue: number;
    colorRange: [string, string];
    presetName?: string;
  };
  linkedLayer?: string;
  linkedColumn?: string;
  gradientColumn?: string;
  numericColumns?: string[];
  textColumns?: string[];
  showLabels?: boolean;
  labelColumn?: string;
  logScale?: boolean;
  propFilterColumn?: string;
  propFilterValue?: string;
}

interface MapProps {
  selectedPackage?: Package | null;
  searchResults?: Package[];
  mapLayer?: string;
  tableLayers?: TableLayer[];
  selectedCommune?: string;
  focusedLayerId?: string | null;
}

interface SelectedPoint {
  name: string;
  coordinates: [number, number];
  layerName: string;
  geometryType: string;
  properties: Record<string, any>;
  linkedValue?: number | string;
  linkedLayer?: string;
}

// ─── Map Controller ──────────────────────────────────────────────────────────

function MapController({ selectedPackage, searchResults }: MapProps) {
  const map = useMap();

  useEffect(() => {
    if (selectedPackage) {
      const bounds = L.latLngBounds([selectedPackage.fromCoords, selectedPackage.toCoords]);
      const padding = [20, 20, 20, 320];
      map.fitBounds(bounds, { padding, duration: 1 });
    }
  }, [selectedPackage, map]);

  useEffect(() => {
    if (searchResults && searchResults.length > 0 && !selectedPackage) {
      const allCoords = searchResults.flatMap(pkg => [pkg.fromCoords, pkg.toCoords]);
      const bounds = L.latLngBounds(allCoords);
      const padding = [20, 20, 20, 320];
      map.fitBounds(bounds, { padding, duration: 1 });
    }
  }, [searchResults, selectedPackage, map]);

  return null;
}

// ─── Tile Layer Controller ─────────────────────────────────────────────────

function TileLayerController({ mapLayer = 'default' }: { mapLayer?: string }) {
  const map = useMap();

  useEffect(() => {
    map.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        map.removeLayer(layer);
      }
    });

    let tileLayerUrl: string;
    let attribution: string;
    let maxZoom: number = 19;

    switch (mapLayer) {
      case 'hybrid':
        tileLayerUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        attribution = 'Tiles &copy; Esri';
        break;
      case 'dark':
        tileLayerUrl = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
        attribution = '&copy; OpenStreetMap &copy; CARTO';
        break;
      case 'transport':
        tileLayerUrl = 'https://tile.thunderforest.com/transport/{z}/{x}/{y}.png?apikey=024fcf69ff67426e8ab14a2fd50c00d1';
        attribution = 'Maps © Thunderforest, Data © OpenStreetMap';
        maxZoom = 22;
        break;
      default:
        tileLayerUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        attribution = '&copy; OpenStreetMap';
        break;
    }

    const newTileLayer = L.tileLayer(tileLayerUrl, { 
      attribution,
      maxZoom,
      detectRetina: true
    });
    newTileLayer.addTo(map);
  }, [mapLayer, map]);

  return null;
}

// ─── Color Helper ────────────────────────────────────────────────────────────

const getColorForValue = (
  value: number,
  minValue: number,
  maxValue: number,
  colorRange: [string, string]
): string => {
  if (isNaN(value) || minValue === maxValue || value === undefined || value === null) {
    return colorRange[0];
  }

  const normalized = (value - minValue) / (maxValue - minValue);
  const clamped = Math.max(0, Math.min(1, normalized));
  const enhancedValue = Math.pow(clamped, 0.5);

  const hexToRgb = (hex: string): { r: number, g: number, b: number } => {
    const hexColor = hex.startsWith('#') ? hex : `#${hex}`;
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  };

  const rgbToHex = (r: number, g: number, b: number): string => {
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  };

  const startColor = hexToRgb(colorRange[0]);
  const endColor = hexToRgb(colorRange[1]);

  const r = Math.round(startColor.r + (endColor.r - startColor.r) * enhancedValue);
  const g = Math.round(startColor.g + (endColor.g - startColor.g) * enhancedValue);
  const b = Math.round(startColor.b + (endColor.b - startColor.b) * enhancedValue);

  return rgbToHex(r, g, b);
};

// ─── Centroid Calculator ───────────────────────────────────────────────────

function getFeatureCentroid(feature: any): [number, number] {
  const geom = feature.geometry;
  if (!geom) return [0, 0];

  if (geom.type === 'Point') {
    return [geom.coordinates[1], geom.coordinates[0]];
  }

  if (geom.type === 'Polygon') {
    const coords = geom.coordinates[0];
    let latSum = 0, lngSum = 0;
    coords.forEach((c: number[]) => { latSum += c[1]; lngSum += c[0]; });
    return [latSum / coords.length, lngSum / coords.length];
  }

  if (geom.type === 'MultiPolygon') {
    const coords = geom.coordinates[0][0];
    let latSum = 0, lngSum = 0;
    coords.forEach((c: number[]) => { latSum += c[1]; lngSum += c[0]; });
    return [latSum / coords.length, lngSum / coords.length];
  }

  if (geom.coordinates && geom.coordinates.length > 0) {
    const first = geom.coordinates[0];
    if (Array.isArray(first)) {
      return [first[1], first[0]];
    }
  }
  return [0, 0];
}

function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
}

// ─── Point-in-Polygon ────────────────────────────────────────────────────────

function pointInRing(px: number, py: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(px: number, py: number, geometry: any): boolean {
  if (geometry.type === 'Polygon') {
    return pointInRing(px, py, geometry.coordinates[0]) &&
      !geometry.coordinates.slice(1).some((hole: number[][]) => pointInRing(px, py, hole));
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly: number[][][]) =>
      pointInRing(px, py, poly[0]) &&
      !poly.slice(1).some((hole: number[][]) => pointInRing(px, py, hole))
    );
  }
  return false;
}

function pointInAnyCommune(px: number, py: number, communeGeometries: any[]): boolean {
  return communeGeometries.some(geom => pointInPolygon(px, py, geom));
}

// ─── Gradient Legend ─────────────────────────────────────────────────────────

function GradientLegend({ 
  colorGradient, 
  minValue, 
  maxValue 
}: { 
  colorGradient?: { 
    column: string; 
    minValue: number; 
    maxValue: number; 
    colorRange: [string, string];
  }; 
  minValue?: number; 
  maxValue?: number; 
}) {
  if (!colorGradient || minValue === undefined || maxValue === undefined) {
    return null;
  }

  const actualMin = minValue;
  const actualMax = maxValue;
  const adjustedMax = actualMax > actualMin ? actualMax : actualMin + 1;
  const range = adjustedMax - actualMin;

  return (
    <div className="absolute bottom-6 left-6 z-[1000]">
      <div className="rounded-lg p-4" style={{ 
        background: 'rgba(255, 255, 255, 0.95)', 
        backdropFilter: 'blur(8px)', 
        border: '1px solid rgba(0,0,0,0.06)', 
        boxShadow: '0 2px 12px rgba(0,0,0,0.08)' 
      }}>
        <div className="text-[11px] font-semibold mb-2 text-gray-700 uppercase tracking-wider">{colorGradient.column}</div>
        <div className="flex items-center space-x-2 mb-2">
          <div className="flex-1 h-3 rounded overflow-hidden">
            <div className="h-full w-full" style={{ background: `linear-gradient(90deg, ${colorGradient.colorRange[0]}, ${colorGradient.colorRange[1]})` }} />
          </div>
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 font-mono">
          <span>{actualMin.toFixed(1)}</span>
          <span>{(actualMin + range * 0.5).toFixed(1)}</span>
          <span>{adjustedMax.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Table Layers ──────────────────────────────────────────────────────────

function TableLayers({ 
  tableLayers = [], 
  selectedCommune,
  onFeatureSelect,
  onMapClick
}: { 
  tableLayers: TableLayer[]; 
  selectedCommune?: string;
  onFeatureSelect: (point: SelectedPoint | null) => void;
  onMapClick: () => void;
}) {
  const map = useMap();
  const layerGroupRef = useRef<L.LayerGroup>();
  const [currentGradientLayer, setCurrentGradientLayer] = useState<TableLayer | null>(null);
  const onFeatureSelectRef = useRef(onFeatureSelect);
  const onMapClickRef = useRef(onMapClick);
  // Track which layer ids we have already zoomed to — zoom fires once when data first arrives
  const zoomedLayerIdsRef = useRef<Set<string>>(new Set());
  const prevPropFilterRef = useRef<{layerId: string, column: string, value: string} | null>(null);
  const prevCommuneRef = useRef<string | undefined>(undefined);
  useEffect(() => { onFeatureSelectRef.current = onFeatureSelect; }, [onFeatureSelect]);
  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);

  useEffect(() => {
    const handleMapClick = () => {
      if (isRedrawingRef.current) return; // ignore spurious clicks during layer redraw
      onMapClickRef.current();
    };
    map.on('click', handleMapClick);
    return () => { map.off('click', handleMapClick); };
  }, [map]);

  const isRedrawingRef = useRef(false);

  useEffect(() => {
    if (!layerGroupRef.current) {
      layerGroupRef.current = L.layerGroup().addTo(map);
    } else {
      isRedrawingRef.current = true;
      layerGroupRef.current.clearLayers();
      // Allow clicks again after microtask queue clears
      setTimeout(() => { isRedrawingRef.current = false; }, 50);
    }

    const sortedLayers = [...tableLayers].sort((a, b) => {
      const aIsCommune = a.id.toLowerCase().includes('commune');
      const bIsCommune = b.id.toLowerCase().includes('commune');
      const aIsCaidat = a.id.toLowerCase() === 'caidats';
      const bIsCaidat = b.id.toLowerCase() === 'caidats';

      if (aIsCommune && !bIsCommune) return -1;
      if (!aIsCommune && bIsCommune) return 1;
      if (aIsCaidat && !bIsCaidat) return -1;
      if (!aIsCaidat && bIsCaidat) return 1;
      return 0;
    });

    const activeFilterValues = (() => {
      const fv = sortedLayers
        .find(l => l.filterValue)?.filterValue || (selectedCommune || '');
      return fv ? fv.split('|').map(v => v.toLowerCase()).filter(Boolean) : [];
    })();

    // Build commune geometries AND collect code_commune values for the selected communes
    const communeGeometries: any[] = [];
    const selectedCommuneCodes = new Set<string>(); // e.g. code_commune values

    if (activeFilterValues.length > 0) {
      sortedLayers.forEach(l => {
        if (l.id.toLowerCase().includes('commune') && l.data?.features) {
          l.data.features.forEach((f: any) => {
            const name = (f.properties.commune_fr || f.properties.commune || f.properties.nom || f.properties.name || '').toLowerCase();
            if (activeFilterValues.includes(name)) {
              if (f.geometry) communeGeometries.push(f.geometry);
              // Collect any code-like columns from commune features
              const code = f.properties.code_commune || f.properties.code || f.properties.commune_code || f.properties.code_geo;
              if (code) selectedCommuneCodes.add(String(code).toLowerCase());
            }
          });
        }
      });
    }

    // Clear zoom-tracking for layers that are currently inactive,
    // so toggling them back on will zoom to them again
    tableLayers.forEach(l => {
      if (!l.active) zoomedLayerIdsRef.current.delete(l.id);
    });

    let gradientLayerFound = false;
    sortedLayers.forEach(layer => {
      if (layer.active && layer.data && layer.data.features && layer.data.features.length > 0) {
        try {
          let filteredFeatures = layer.data.features;

          const isCommune = layer.id.toLowerCase().includes('commune');
          const isCaidat = layer.id.toLowerCase() === 'caidats';

          // '__none__' means this layer is suppressed (another layer is focused)
          if (layer.filterColumn === '__none__' && !isCommune && !isCaidat) return;

          const hasAttributeFilter = (layer.filterValue || selectedCommune) && layer.filterColumn && layer.filterColumn !== '__none__';
          const hasGeomFilter = activeFilterValues.length > 0 && !isCommune && !isCaidat;

          // Detect whether this layer has a code_commune-like column
          const firstProps = layer.data.features[0]?.properties || {};
          const communeCodeKey = Object.keys(firstProps).find(k =>
            ['code_commune', 'commune_code', 'code_geo'].includes(k.toLowerCase())
          );
          const hasCommuneCodeCol = !!communeCodeKey && selectedCommuneCodes.size > 0;

          // 1. Spatial / code_commune filter for non-commune, non-caidat layers
          if (hasGeomFilter || hasAttributeFilter) {
            if (!isCommune && !isCaidat) {
              if (hasCommuneCodeCol) {
                // Precise join via code_commune — preferred over name match or point-in-polygon
                filteredFeatures = layer.data.features.filter((feature: any) => {
                  const code = feature.properties[communeCodeKey!];
                  return code && selectedCommuneCodes.has(String(code).toLowerCase());
                });
              } else if (hasAttributeFilter) {
                // Name-based attribute filter (commune_fr / commune / nom / name)
                filteredFeatures = layer.data.features.filter((feature: any) => {
                  const featureCommune =
                    feature.properties.commune_fr ||
                    feature.properties.commune ||
                    feature.properties.nom ||
                    feature.properties.name;
                  if (!featureCommune) return false;
                  const filterValues = (layer.filterValue || selectedCommune!).split('|').map(v => v.toLowerCase());
                  return filterValues.some(v => featureCommune.toLowerCase() === v);
                });
              } else if (communeGeometries.length > 0) {
                // Point-in-polygon fallback
                filteredFeatures = layer.data.features.filter((feature: any) => {
                  const geom = feature.geometry;
                  if (!geom) return false;
                  let px: number, py: number;
                  if (geom.type === 'Point') {
                    [px, py] = geom.coordinates;
                  } else {
                    const centroid = getFeatureCentroid(feature);
                    py = centroid[0]; px = centroid[1];
                  }
                  return pointInAnyCommune(px, py, communeGeometries);
                });
              }
              if (filteredFeatures.length === 0) return;
            } else if (isCommune && hasAttributeFilter) {
              // Filter commune polygons themselves by name
              filteredFeatures = layer.data.features.filter((feature: any) => {
                const featureCommune =
                  feature.properties.commune_fr ||
                  feature.properties.commune ||
                  feature.properties.nom ||
                  feature.properties.name;
                if (!featureCommune) return false;
                const filterValues = (layer.filterValue || selectedCommune!).split('|').map(v => v.toLowerCase());
                return filterValues.some(v => featureCommune.toLowerCase() === v);
              });
              if (filteredFeatures.length === 0) return;
            }
          }

          // 2. Property filter ("Filter by property" in sidebar) — stacks on top of commune filter
          if (layer.propFilterColumn && layer.propFilterValue && layer.propFilterValue.trim() !== '') {
            const col = layer.propFilterColumn;
            const val = layer.propFilterValue.toLowerCase();
            filteredFeatures = filteredFeatures.filter((feature: any) => {
              const featureVal = feature.properties[col];
              if (featureVal === null || featureVal === undefined) return false;
              return String(featureVal).toLowerCase() === val;
            });
            if (filteredFeatures.length === 0) return;
          }

          if (layer.colorGradient && !gradientLayerFound) {
            setCurrentGradientLayer(layer);
            gradientLayerFound = true;
          }

          let numericValues: number[] = [];
          if (layer.colorGradient) {
            numericValues = filteredFeatures
              .map((feature: any) => {
                const value = feature.properties[layer.colorGradient!.column] ||
                             feature.properties[layer.gradientColumn || ''];
                if (value === null || value === undefined) return 0;
                const numValue = typeof value === 'number' ? value : parseFloat(value);
                return isNaN(numValue) || !isFinite(numValue) ? 0 : numValue;
              })
              .filter((value: number) => !isNaN(value));
          }

          const minValue = numericValues.length > 0 ? Math.min(...numericValues) : 0;
          const maxValue = numericValues.length > 0 ? Math.max(...numericValues) : 0;

          const geoJSONLayer = L.geoJSON({
            type: 'FeatureCollection',
            features: filteredFeatures
          }, {
            style: (feature) => {
              const isPolygon = feature?.geometry?.type === 'Polygon' || feature?.geometry?.type === 'MultiPolygon';
              let fillColor = layer.color || '#d4a574';

              if (layer.colorGradient && feature?.properties) {
                const value = feature.properties[layer.colorGradient.column] ||
                             feature.properties[layer.gradientColumn || ''];
                let numValue = 0;
                if (value !== undefined && value !== null) {
                  numValue = typeof value === 'number' ? value : parseFloat(value);
                  if (isNaN(numValue) || !isFinite(numValue)) numValue = 0;
                }
                if (!isNaN(numValue)) {
                  const actualMin = layer.colorGradient.minValue || minValue;
                  const actualMax = layer.colorGradient.maxValue || maxValue;
                  if (actualMax > actualMin) {
                    fillColor = getColorForValue(numValue, actualMin, actualMax, layer.colorGradient.colorRange || ['#fef3c7', '#d97706']);
                  } else {
                    fillColor = layer.colorGradient.colorRange[0];
                  }
                }
              }

              if (isPolygon) {
                return {
                  fillColor: fillColor,
                  color: '#b45309',
                  weight: 0.8,
                  opacity: 0.6,
                  fillOpacity: 0.75,
                  dashArray: undefined
                };
              } else {
                return {
                  fillColor: fillColor,
                  color: '#b45309',
                  weight: 1.5,
                  opacity: 0.7,
                  fillOpacity: 0.85,
                  radius: 5
                };
              }
            },
            pointToLayer: (feature, latlng) => {
              if (feature.geometry.type === 'Point') {
                const labelText = feature.properties.nom_fr
                  || feature.properties.nom
                  || feature.properties.name
                  || feature.properties.commune_fr
                  || feature.properties.commune
                  || feature.properties.libelle
                  || feature.properties.ville
                  || feature.properties.city
                  || feature.properties.etablissem
                  || '';

                const color = layer.color || '#d4a574';

                const iconHtml = `
                  <div style="position:relative; display:flex; flex-direction:column; align-items:center; pointer-events:none;">
                    <div style="
                      width:10px; height:10px; border-radius:50%;
                      background:${color};
                      border:1.5px solid #fff;
                      box-shadow:0 1px 4px rgba(0,0,0,0.2);
                    "></div>
                    ${labelText ? `
                    <div style="
                      margin-top:2px;
                      background:rgba(255,255,255,0.92);
                      color:#374151;
                      font-size:9px;
                      font-weight:600;
                      padding:1px 5px;
                      border-radius:4px;
                      border:1px solid rgba(0,0,0,0.08);
                      white-space:nowrap;
                      box-shadow:0 1px 3px rgba(0,0,0,0.1);
                      letter-spacing:0.01em;
                    ">${labelText}</div>` : ''}
                  </div>`;

                return L.marker(latlng, {
                  icon: L.divIcon({
                    className: '',
                    html: iconHtml,
                    iconSize: [120, labelText ? 28 : 12],
                    iconAnchor: [60, 6],
                  })
                });
              }
              return L.marker(latlng);
            },
            onEachFeature: (feature, leafletLayer) => {
              if (feature.properties) {
                const name = feature.properties.nom_fr
                  ? feature.properties.nom_fr 
                  : feature.properties.nom
                  ? feature.properties.nom 
                  : feature.properties.name
                  ? feature.properties.name 
                  : feature.properties.commune_fr
                  ? feature.properties.commune_fr 
                  : feature.properties.commune
                  ? feature.properties.commune 
                  : feature.properties.id 
                  ? feature.properties.id 
                  : feature.properties.caidat 
                  ? feature.properties.caidat 
                  : 'Unnamed';

                const gradientValue = layer.colorGradient ? 
                  (feature.properties[layer.colorGradient.column] || feature.properties[layer.gradientColumn || '']) : 
                  null;
                const gradientInfo = gradientValue !== null && gradientValue !== undefined ? `
                  <div class="flex justify-between mb-1">
                    <span class="font-medium text-gray-500">${layer.gradientColumn || layer.colorGradient?.column}:</span> 
                    <span class="text-gray-800 font-medium">${typeof gradientValue === 'number' ? gradientValue.toFixed(2) : gradientValue}</span>
                  </div>
                  ${layer.linkedLayer ? `
                  <div class="flex justify-between text-xs text-gray-400">
                    <span>Linked from:</span>
                    <span>${layer.linkedLayer}</span>
                  </div>
                  ` : ''}
                ` : '';

                const popupContent = `
                  <div class="p-3 min-w-[200px]">
                    <h3 class="font-bold text-sm mb-2 text-gray-800">${name}</h3>
                    <div class="space-y-1 text-xs">
                      <div class="flex justify-between">
                        <span class="font-medium text-gray-500">Layer:</span> 
                        <span class="text-gray-800">${layer.name}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="font-medium text-gray-500">Type:</span> 
                        <span class="text-gray-800">${feature.geometry.type}</span>
                      </div>
                      ${gradientInfo}
                      ${Object.entries(feature.properties)
                    .filter(([key]) => !key.startsWith('_') &&
                      key !== 'name' && key !== 'nom' && key !== 'nom_fr' &&
                      key !== 'commune' && key !== 'commune_fr' &&
                      key !== (layer.colorGradient?.column || '') &&
                      key !== 'linked_value' && key !== 'source_value' &&
                      key !== (layer.gradientColumn || ''))
                    .slice(0, 4)
                    .map(([key, value]) =>
                      `<div class="flex justify-between"><span class="font-medium text-gray-500">${key}:</span> <span class="text-gray-800">${value}</span></div>`
                    )
                    .join('')}
                    </div>
                  </div>
                `;

                leafletLayer.on('click', (e: L.LeafletMouseEvent) => {
                  L.DomEvent.stopPropagation(e);

                  const centroid = getFeatureCentroid(feature);
                  const coordsStr = formatCoords(centroid[0], centroid[1]);

                  const linkedVal = layer.colorGradient 
                    ? (feature.properties[layer.colorGradient.column] || feature.properties[layer.gradientColumn || ''])
                    : undefined;

                  onFeatureSelectRef.current({
                    name,
                    coordinates: centroid,
                    layerName: layer.name,
                    geometryType: feature.geometry.type,
                    properties: feature.properties,
                    linkedValue: linkedVal,
                    linkedLayer: layer.linkedLayer,
                  });
                });

                leafletLayer.on('mouseover', function () {
                  this.setStyle({
                    weight: layer.id.toLowerCase() === 'caidats' ? 1.5 : 2.5,
                    fillOpacity: layer.id.toLowerCase() === 'caidats' ? 0.5 : 0.6
                  });
                });
                leafletLayer.on('mouseout', function () {
                  this.setStyle({
                    weight: layer.id.toLowerCase() === 'caidats' ? 0.8 : 1.5,
                    fillOpacity: layer.id.toLowerCase() === 'caidats' ? 0.75 : 0.85
                  });
                });
              }
            }
          });

          layerGroupRef.current?.addLayer(geoJSONLayer);

          const communeChanged = selectedCommune !== prevCommuneRef.current;

          // Detect prop filter change for this layer
          const currentPropFilter = layer.propFilterColumn && layer.propFilterValue 
            ? { layerId: layer.id, column: layer.propFilterColumn, value: layer.propFilterValue }
            : null;
          const prevPropFilter = prevPropFilterRef.current;
          const propFilterChanged = currentPropFilter && (
            !prevPropFilter || 
            prevPropFilter.layerId !== currentPropFilter.layerId ||
            prevPropFilter.column !== currentPropFilter.column ||
            prevPropFilter.value !== currentPropFilter.value
          );
          const propFilterCleared = !currentPropFilter && prevPropFilter?.layerId === layer.id;

          // Zoom the first time this layer has rendered features, when commune changes, or when prop filter changes
          const hasNotBeenZoomed = !zoomedLayerIdsRef.current.has(layer.id);
          const shouldZoom = layer.id.toLowerCase() !== 'caidats' && filteredFeatures.length > 0 && 
            (communeChanged || hasNotBeenZoomed || propFilterChanged || propFilterCleared);

          if (shouldZoom) {
            const bounds = geoJSONLayer.getBounds();
            if (bounds.isValid()) {
              // If prop filter is active and we have very few features, zoom in closer
              const isPropFiltered = !!layer.propFilterValue;
              const padding = isPropFiltered && filteredFeatures.length <= 3 ? [100, 100] : [50, 50];
              const maxZoom = isPropFiltered && filteredFeatures.length === 1 ? 16 : undefined;
              map.fitBounds(bounds, { padding, maxZoom });
              zoomedLayerIdsRef.current.add(layer.id);
            }
          }

          // Update prop filter tracking
          if (layer.propFilterColumn && layer.propFilterValue) {
            prevPropFilterRef.current = { layerId: layer.id, column: layer.propFilterColumn, value: layer.propFilterValue };
          } else if (prevPropFilterRef.current?.layerId === layer.id) {
            prevPropFilterRef.current = null;
          }
        } catch (error) {
          console.error(`Error adding layer ${layer.name} to map:`, error);
        }
      }
    });

    // Update refs after processing
    prevCommuneRef.current = selectedCommune;

    if (!gradientLayerFound) {
      setCurrentGradientLayer(null);
    }

    return () => {
      if (layerGroupRef.current) {
        layerGroupRef.current.clearLayers();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableLayers, selectedCommune, map]);

  return (
    <>
      <GradientLegend 
        colorGradient={currentGradientLayer?.colorGradient}
        minValue={currentGradientLayer?.colorGradient?.minValue}
        maxValue={currentGradientLayer?.colorGradient?.maxValue}
      />
    </>
  );
}

// ─── Columns to hide ─────────────────────────────────────────────────────────

const HIDDEN_COLUMNS = new Set([
  'geom_geojson', 'geom', 'geometry', 'wkb_geometry', 'wkt_geometry',
  'x', 'y', 'lon', 'lat', 'longitude', 'latitude',
  'geom_type', 'geometry_type', 'shape', 'the_geom',
  'coordinates', 'bbox',
]);

const IMAGE_COLUMNS = new Set(['img_path1', 'img_path2']);

const isHiddenColumn = (key: string) =>
  HIDDEN_COLUMNS.has(key.toLowerCase()) || key.startsWith('_');

const isImageColumn = (key: string) => IMAGE_COLUMNS.has(key.toLowerCase());

// ─── Image Lightbox ───────────────────────────────────────────────────────────

function ImageLightbox({
  images,
  startIndex,
  onClose,
}: {
  images: { src: string; label: string }[];
  startIndex: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(startIndex);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setCurrent(i => (i + 1) % images.length);
      if (e.key === 'ArrowLeft') setCurrent(i => (i - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  const img = images[current];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <button
        className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
        onClick={onClose}
      >
        <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>

      <div className="absolute top-5 left-1/2 -translate-x-1/2 text-xs text-gray-400 font-mono bg-black/50 px-3 py-1 rounded-full border border-white/10">
        {img.label} · {current + 1} / {images.length}
      </div>

      <motion.img
        key={current}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        src={img.src}
        alt={img.label}
        className="max-w-[90vw] max-h-[80vh] rounded-2xl object-contain shadow-2xl"
        style={{ border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={e => e.stopPropagation()}
        onError={e => { (e.target as HTMLImageElement).src = ''; }}
      />

      {images.length > 1 && (
        <>
          <button
            className="absolute left-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={e => { e.stopPropagation(); setCurrent(i => (i - 1 + images.length) % images.length); }}
          >
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <button
            className="absolute right-5 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            onClick={e => { e.stopPropagation(); setCurrent(i => (i + 1) % images.length); }}
          >
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
          <div className="absolute bottom-6 flex gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setCurrent(i); }}
                className={`w-2 h-2 rounded-full transition-all ${i === current ? 'bg-white scale-125' : 'bg-white/30 hover:bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

// ─── Point Detail Card — hotel-card inspired ─────────────────────────────────

function StarRating({ value, max = 5 }: { value: number; max?: number }) {
  const filled = Math.round((value / max) * 5);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} className={`w-3.5 h-3.5 ${i < filled ? 'text-amber-400' : 'text-gray-200'}`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
        </svg>
      ))}
    </div>
  );
}

function PointDetailCard({ point, onClose }: { point: SelectedPoint; onClose: () => void }) {
  const [lightbox, setLightbox] = useState<{ images: { src: string; label: string }[]; index: number } | null>(null);
  const [showAllProps, setShowAllProps] = useState(false);
  const [activeImg, setActiveImg] = useState(0);

  const coordsStr = formatCoords(point.coordinates[0], point.coordinates[1]);

  const imageEntries: { src: string; label: string }[] = Object.entries(point.properties)
    .filter(([key, val]) => isImageColumn(key) && val && String(val).trim() !== '' && String(val) !== 'null')
    .map(([key, val]) => ({ src: String(val), label: key }));

  // Prefer nom_fr > nom > name for display name
  const displayName = point.properties['nom_fr'] || point.properties['nom'] || point.name;

  // Separate numeric vs text props, exclude image/hidden/name columns
  const NAME_COLS = new Set(['nom', 'nom_fr', 'name', 'id']);
  // Columns that look like IDs or codes — long numbers or strings with "code"/"id" in key
  const isCodeOrIdCol = (key: string, val: any): boolean => {
    const k = key.toLowerCase();
    if (k.includes('code') || k.includes('_id') || k === 'id') return true;
    const str = String(val ?? '');
    return str.length > 10 && !isNaN(Number(str));
  };

  const allPropEntries = Object.entries(point.properties).filter(
    ([key]) => !isHiddenColumn(key) && !isImageColumn(key) && !NAME_COLS.has(key.toLowerCase())
  );

  const formatVal = (value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2);
    return String(value);
  };

  // Code/ID columns → shown as full-width rows, not tiles
  const codeEntries = allPropEntries.filter(([key, val]) => isCodeOrIdCol(key, val));
  // True numeric stats (small numbers, not IDs) → shown as tiles
  const numericEntries = allPropEntries.filter(([key, val]) => {
    if (isCodeOrIdCol(key, val)) return false;
    return typeof val === 'number' || (typeof val === 'string' && !isNaN(parseFloat(val)) && isFinite(+val) && String(val).trim() !== '');
  });
  const textEntries = allPropEntries.filter(([key, val]) => {
    if (isCodeOrIdCol(key, val)) return false;
    return typeof val === 'string' && (isNaN(parseFloat(val)) || !isFinite(+val));
  });

  // Pick a few key numeric stats to show like "hotel amenities"
  const highlightStats = numericEntries.slice(0, 4);

  // Layer type badge color — amber theme matching sidebar
  const badgeColor = point.geometryType === 'Point' ? { bg: '#fef3c7', text: '#b45309' }
    : point.geometryType === 'Polygon' ? { bg: '#fff7ed', text: '#c2410c' }
    : { bg: '#f9fafb', text: '#78716c' };
  const accentColor = '#d97706'; // amber-600 — matches sidebar

  return (
    <>
      <motion.div
        key="point-detail-panel"
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
        className="fixed top-4 right-4 bottom-4 z-[1000] w-[380px] rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: '#ffffff',
          boxShadow: '0 8px 32px -4px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)',
          border: '1px solid #e5e7eb',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Image Carousel ── */}
        <div className="relative flex-shrink-0 overflow-hidden" style={{ height: imageEntries.length > 0 ? 220 : 100 }}>
          {imageEntries.length > 0 ? (
            <>
              <motion.img
                key={activeImg}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                src={imageEntries[activeImg].src}
                alt={displayName}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />

              {/* Thumbnail dots */}
              {imageEntries.length > 1 && (
                <div className="absolute bottom-14 left-0 right-0 flex justify-center gap-1.5">
                  {imageEntries.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImg(i)}
                      className={`transition-all rounded-full ${i === activeImg ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/50 hover:bg-white/80'}`}
                    />
                  ))}
                </div>
              )}

              {/* Thumbnail strip */}
              {imageEntries.length > 1 && (
                <div className="absolute bottom-3 left-3 flex gap-1.5">
                  {imageEntries.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => { setActiveImg(idx); setLightbox({ images: imageEntries, index: idx }); }}
                      className={`rounded-lg overflow-hidden border-2 transition-all ${idx === activeImg ? 'border-white scale-105' : 'border-white/30 hover:border-white/60'}`}
                      style={{ width: 40, height: 28 }}
                    >
                      <img src={img.src} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    </button>
                  ))}
                </div>
              )}

              {/* Favourite button */}
              <button className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/30 transition-colors">
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
              </button>
            </>
          ) : (
            <div className="w-full h-full flex items-end p-4" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fffbeb 100%)' }} />
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center hover:bg-white/30 transition-colors border border-white/20"
          >
            <svg className={`w-4 h-4 ${imageEntries.length > 0 ? 'text-white' : 'text-gray-600'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.08) transparent' }}>

          {/* ── Title block ── */}
          <div className="px-5 pt-4 pb-3 border-b border-gray-100">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {/* Layer badge */}
                <span
                  className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full mb-2"
                  style={{ background: badgeColor.bg, color: badgeColor.text }}
                >
                  {point.layerName}
                </span>
                <h2 className="text-[17px] font-bold text-gray-900 leading-snug">{displayName}</h2>
                {/* If nom_fr exists and is different from nom, show nom below */}
                {point.properties['nom'] && point.properties['nom_fr'] && point.properties['nom'] !== point.properties['nom_fr'] && (
                  <p className="text-[12px] text-gray-400 mt-0.5">{point.properties['nom']}</p>
                )}
                <p className="text-[11px] text-gray-400 mt-1 font-mono flex items-center gap-1">
                  <svg className="w-3 h-3 flex-shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    <circle cx="12" cy="9" r="2.5"/>
                  </svg>
                  {coordsStr}
                </p>
              </div>
              {/* Linked value badge */}
              {point.linkedValue !== undefined && point.linkedValue !== null && (
                <div className="flex-shrink-0 text-right">
                  <div className="text-[10px] text-gray-400 mb-0.5 uppercase tracking-wide">Value</div>
                  <div className="text-[20px] font-bold" style={{ color: accentColor }}>
                    {typeof point.linkedValue === 'number'
                      ? point.linkedValue.toLocaleString(undefined, { maximumFractionDigits: 1 })
                      : point.linkedValue}
                  </div>
                  {point.linkedLayer && (
                    <div className="text-[10px] text-gray-400">{point.linkedLayer}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Numeric Stats grid (like amenity highlights) ── */}
          {highlightStats.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-100">
              <div className={`grid gap-3 ${highlightStats.length >= 4 ? 'grid-cols-4' : highlightStats.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                {highlightStats.map(([key, value]) => (
                  <div key={key} className="flex flex-col items-center text-center rounded-xl px-2 py-3" style={{ background: '#fef3c7' }}>
                    <div className="text-[15px] font-bold" style={{ color: '#92400e' }}>{formatVal(value)}</div>
                    <div className="text-[9px] uppercase tracking-wide mt-0.5 leading-tight" style={{ color: '#b45309' }}>{key.replace(/_/g, ' ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Code/ID columns — full-width monospace rows ── */}
          {codeEntries.length > 0 && (
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="space-y-2">
                {codeEntries.map(([key, value]) => {
                  const strVal = formatVal(value);
                  return (
                    <div key={key} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: '#fafaf9' }}>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide flex-shrink-0">{key.replace(/_/g, ' ')}</span>
                      <span className="text-[11px] font-mono text-gray-600 truncate max-w-[180px]" title={strVal}>{strVal}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Text properties — inline label/value rows ── */}
          {textEntries.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="space-y-2.5">
                {textEntries.slice(0, showAllProps ? undefined : 5).map(([key, value]) => {
                  const strVal = formatVal(value);
                  const isEmpty = strVal === '—' || strVal === 'null' || strVal === 'undefined' || strVal === '';
                  return (
                    <div key={key} className="flex items-start justify-between gap-4">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wide flex-shrink-0 pt-0.5">{key.replace(/_/g, ' ')}</span>
                      <span className={`text-[12px] font-medium text-right ${isEmpty ? 'text-gray-300 italic' : 'text-gray-700'}`}>
                        {isEmpty ? 'N/A' : strVal}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Remaining numeric props ── */}
          {numericEntries.length > 4 && (
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="space-y-2">
                {numericEntries.slice(4, showAllProps ? undefined : 8).map(([key, value]) => {
                  const numVal = typeof value === 'number' ? value : parseFloat(value as string);
                  const maxVal = Math.max(...numericEntries.slice(4).map(([, v]) => typeof v === 'number' ? v : parseFloat(v as string)).filter(n => !isNaN(n)), 1);
                  const pct = Math.min(100, Math.max(0, (numVal / maxVal) * 100));
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-gray-500 uppercase tracking-wide">{key.replace(/_/g, ' ')}</span>
                        <span className="text-[11px] font-mono text-gray-700">{formatVal(value)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className="h-full rounded-full"
                          style={{ background: `linear-gradient(90deg, #fbbf24, #d97706)` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Show more/less toggle */}
          {allPropEntries.length > 6 && (
            <div className="px-5 py-3 border-b border-gray-100">
              <button
                onClick={() => setShowAllProps(!showAllProps)}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold rounded-xl transition-colors"
                style={{ color: accentColor }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fef3c7')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllProps ? 'rotate-180' : ''}`} />
                {showAllProps ? 'Show less' : `Show all ${allPropEntries.length} fields`}
              </button>
            </div>
          )}

          {/* ── Footer meta ── */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span className="capitalize">{point.geometryType} · {allPropEntries.length} fields</span>
              {point.linkedLayer && (
                <span className="flex items-center gap-1" style={{ color: accentColor }}>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                  {point.linkedLayer}
                </span>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {lightbox && (
          <ImageLightbox
            images={lightbox.images}
            startIndex={lightbox.index}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
// ─── Main Map Component ──────────────────────────────────────────────────────

export default function Map({
  selectedPackage,
  searchResults,
  mapLayer = 'default',
  tableLayers = [],
  selectedCommune,
  focusedLayerId,
}: MapProps) {
  const mapRef = useRef<L.Map>(null);
  const [cityCoordinates, setCityCoordinates] = useState<{ [key: string]: [number, number] }>({});
  const [selectedPoint, setSelectedPoint] = useState<SelectedPoint | null>(null);

  const handleFeatureSelect = useCallback((point: SelectedPoint | null) => {
    setSelectedPoint(point);
  }, []);

  const handleMapClick = useCallback(() => {
    setSelectedPoint(null);
  }, []);

  useEffect(() => {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
    fetchCities();
  }, []);

  const fetchCities = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/cities');
      if (response.ok) {
        const cities = await response.json();
        setCityCoordinates(cities);
      }
    } catch (error) {
      console.error('Error fetching cities:', error);
    }
  };

  const packagesToShow = searchResults && searchResults.length > 0 ? searchResults :
    selectedPackage ? [selectedPackage] : [];

  return (
    <>
      <MapContainer
        center={[41.0082, 28.9784]}
        zoom={6}
        style={{
          height: '100vh',
          width: '100vw',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 0,
          marginLeft: '0',
          paddingLeft: '0'
        }}
        zoomControl={false}
        ref={mapRef}
        minZoom={2}
        maxZoom={22}
        maxBounds={[[-90, -180], [90, 180]]}
      >
        <TileLayerController mapLayer={mapLayer} />
        <MapController selectedPackage={selectedPackage} searchResults={searchResults} />
        <TableLayers 
          tableLayers={tableLayers} 
          selectedCommune={selectedCommune}
          onFeatureSelect={handleFeatureSelect}
          onMapClick={handleMapClick}
        />

        {packagesToShow.map((pkg) => (
          <Polyline
            key={pkg.id}
            positions={[pkg.fromCoords, pkg.toCoords]}
            color={pkg.id === selectedPackage?.id ? "#b45309" : "#d4a574"}
            weight={pkg.id === selectedPackage?.id ? 3 : 1.5}
            opacity={0.7}
          />
        ))}

        {Object.entries(cityCoordinates).map(([city, coords]) => {
          const isInSelectedPackage = selectedPackage &&
            (city === selectedPackage.from || city === selectedPackage.to);
          const isInSearchResults = searchResults && searchResults.some(pkg =>
            city === pkg.from || city === pkg.to);

          let opacity = 0.3;
          if (isInSelectedPackage) opacity = 1;
          else if (isInSearchResults && searchResults && searchResults.length > 0) opacity = 0.7;

          return (
            <Marker
              key={city}
              position={coords}
              icon={icon}
              opacity={opacity}
            >
              <Popup>
                {city}
                {isInSelectedPackage && (
                  <div>
                    <br />
                    {city === selectedPackage.from ? 'Origin' : 'Destination'}
                    <br />
                    Order {selectedPackage.id}
                  </div>
                )}
                {isInSearchResults && !isInSelectedPackage && (
                  <div>
                    <br />
                    Search Result
                  </div>
                )}
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <AnimatePresence>
        {selectedPoint && (
          <PointDetailCard 
            point={selectedPoint} 
            onClose={() => setSelectedPoint(null)} 
          />
        )}
      </AnimatePresence>
    </>
  );
}