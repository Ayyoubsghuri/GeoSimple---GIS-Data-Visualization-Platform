// App.tsx — Minimalist French Election Map Style
import { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Map from './components/Map';
import DataAnalyticsModal from './components/DataAnalyticsModal';
import './index.css';

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
  numericColumns?: string[];
  textColumns?: string[];
  linkedLayer?: string;
  linkedColumn?: string;
  gradientColumn?: string;
  colorGradient?: {
    column: string;
    minValue: number;
    maxValue: number;
    colorRange: [string, string];
  };
  filterColumn?: string;
  filterValue?: string;
  propFilterColumn?: string;
  propFilterValue?: string;
}

function App() {
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [searchResults, setSearchResults] = useState<Package[]>([]);
  const [currentMapLayer, setCurrentMapLayer] = useState('default');
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [selectedCommune, setSelectedCommune] = useState('');
  const [focusedLayerId, setFocusedLayerId] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  const [tableLayers, setTableLayers] = useState<TableLayer[]>([
    {
      id: 'caidats',
      name: 'Caidats',
      table_name: 'caidats',
      type: 'polygons',
      active: true,
      count: 0,
      color: '#d4a574',
      numericColumns: [],
      textColumns: [],
    },
  ]);

  useEffect(() => {
    if (!initialLoadDone.current) {
      loadCaidatsData();
      initialLoadDone.current = true;
    }
  }, []);

  const loadCaidatsData = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/package-layers/caidats/data');
      if (!res.ok) return;
      const raw = await res.json();
      const features = raw
        .map((pkg: any) => {
          if (pkg.geom_geojson) {
            try {
              const geojson = JSON.parse(pkg.geom_geojson);
              return { type: 'Feature', geometry: geojson, properties: { id: pkg.id, name: pkg.name || pkg.nom || pkg.commune || pkg.commune_fr || pkg.caidat || 'Unnamed', geometry_type: geojson.type, ...pkg } };
            } catch { return null; }
          }
          if (pkg.coordinates?.length === 2) {
            const [lng, lat] = pkg.coordinates;
            return { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { id: pkg.id, name: pkg.name || pkg.nom || pkg.commune || pkg.commune_fr || 'Unnamed', geometry_type: 'Point', ...pkg } };
          }
          return null;
        })
        .filter(Boolean);

      const numeric: string[] = [], text: string[] = [];
      if (raw.length > 0) {
        Object.entries(raw[0]).forEach(([k, v]) => {
          if (typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)) && isFinite(+v))) {
            if (!numeric.includes(k)) numeric.push(k);
          } else if (typeof v === 'string') {
            if (!text.includes(k)) text.push(k);
          }
        });
      }

      setTableLayers(prev =>
        prev.map(l =>
          l.id === 'caidats'
            ? { ...l, data: { type: 'FeatureCollection', features }, count: features.length, numericColumns: numeric, textColumns: text }
            : l
        )
      );
    } catch (err) {
      console.error('Error loading caidats data:', err);
    }
  };

  const handleTableLayersChange = (layers: TableLayer[]) => {
    // Merge incoming layers with current state to preserve commune/prop filters set by handleCommuneSelect
    setTableLayers(prev => {
      const prevMap = Object.fromEntries(prev.map(l => [l.id, l]));
      return layers.map(l => ({
        ...l,
        // Preserve filter fields that App.tsx owns (set by handleCommuneSelect)
        filterColumn: prevMap[l.id]?.filterColumn ?? l.filterColumn,
        filterValue: prevMap[l.id]?.filterValue ?? l.filterValue,
      }));
    });
  };

  const handleCommuneSelect = (communes: string[], filterAllLayers = false, layerId?: string | null) => {
    setSelectedCommune(communes[0] || '');
    setFocusedLayerId(layerId ?? null);
    setTableLayers(prev =>
      prev.map(l => {
        const isCommune = l.id.toLowerCase().includes('commune');
        // Preserve propFilter fields that come from the sidebar
        const propFields = { propFilterColumn: l.propFilterColumn, propFilterValue: l.propFilterValue };
        if (isCommune) {
          return { ...l, ...propFields, filterColumn: communes.length ? 'commune_fr' : undefined, filterValue: communes.length ? communes.join('|') : undefined };
        }
        if (layerId) {
          if (l.id === layerId && communes.length) return { ...l, ...propFields, filterColumn: 'commune_fr', filterValue: communes.join('|') };
          return { ...l, ...propFields, filterColumn: '__none__', filterValue: '__none__' };
        }
        if (filterAllLayers && communes.length) return { ...l, ...propFields, filterColumn: 'commune_fr', filterValue: communes.join('|') };
        return { ...l, ...propFields, filterColumn: undefined, filterValue: undefined };
      })
    );
  };

  return (
    <div className="App">
      <Sidebar
        onPackageSelect={setSelectedPackage}
        onSearchResult={setSearchResults}
        onMapLayerChange={setCurrentMapLayer}
        onTableLayersChange={handleTableLayersChange}
        onCommuneSelect={handleCommuneSelect}
        onOpenAnalytics={() => setShowAnalyticsModal(true)}
      />
      <Map
        selectedPackage={selectedPackage}
        searchResults={searchResults}
        mapLayer={currentMapLayer}
        tableLayers={tableLayers}
        selectedCommune={selectedCommune}
        focusedLayerId={focusedLayerId}
      />
      <DataAnalyticsModal
        isOpen={showAnalyticsModal}
        onClose={() => setShowAnalyticsModal(false)}
        tableLayers={tableLayers}
      />
    </div>
  );
}

export default App;