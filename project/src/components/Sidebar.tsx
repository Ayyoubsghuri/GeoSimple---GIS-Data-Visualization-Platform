// Sidebar.tsx — Minimalist French Election Map Style
import {
  Layers, ChevronDown, MapPin,
  RefreshCw, BarChart2, FileText, Package, Search, X
} from 'lucide-react';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LayerLinkManager from './LayerLinkManager';
import DataAnalyticsModal from './DataAnalyticsModal';

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
    presetName?: string;
  };
  filterColumn?: string;
  filterValue?: string;
  propFilterColumn?: string;
  propFilterValue?: string;
  showLabels?: boolean;
  labelColumn?: string;
  logScale?: boolean;
}

interface SidebarProps {
  onMapLayerChange: (layerId: string) => void;
  onTableLayersChange: (layers: TableLayer[]) => void;
  onPackageSelect?: (pkg: any) => void;
  onSearchResult?: (packages: any[]) => void;
  onCommuneSelect?: (communes: string[], filterAllLayers: boolean, layerId?: string | null) => void;
  onOpenAnalytics?: () => void;
}

const MAP_LAYERS = [
  { id: 'default', name: 'Standard' },
  { id: 'hybrid', name: 'Satellite' },
  { id: 'dark', name: 'Clair' },
  { id: 'transport', name: 'Transport' },
];

const GRADIENT_PRESETS = [
  { name: 'Amber',       colors: ['#fef3c7', '#d97706'] as [string, string] },
  { name: 'Orange',      colors: ['#fff7ed', '#ea580c'] as [string, string] },
  { name: 'Warm',        colors: ['#fefce8', '#ca8a04'] as [string, string] },
  { name: 'Terracotta',  colors: ['#fafaf9', '#c2410c'] as [string, string] },
  { name: 'Earth',       colors: ['#f5f5f4', '#a16207'] as [string, string] },
  { name: 'Sand',        colors: ['#fafaf9', '#d6d3d1'] as [string, string] },
];

const LABEL_PRIORITY = ['nom_fr', 'nom', 'name', 'commune_fr', 'commune', 'libelle', 'ville', 'city'];

const getDefaultColor = (type: string) =>
  ({ points: '#d4a574', polygons: '#d4a574', routes: '#b45309', packages: '#ca8a04' }[type] ?? '#78716c');

const pickLabelColumn = (textColumns: string[]) =>
  LABEL_PRIORITY.reduce<string | undefined>(
    (found, key) => found ?? textColumns.find(c => c.toLowerCase().includes(key)),
    undefined
  ) ?? textColumns[0];

const buildGeoJSON = (rawData: any[]) => {
  const features = rawData.map((pkg: any) => {
    if (pkg.geom_geojson) {
      try {
        const geojson = JSON.parse(pkg.geom_geojson);
        return { type: 'Feature', geometry: geojson, properties: { id: pkg.id, name: pkg.name || pkg.nom || pkg.commune || pkg.commune_fr || pkg.caidat || 'Unnamed', geometry_type: geojson.type, ...pkg } };
      } catch { return null; }
    }
    if (pkg.coordinates?.length === 2) {
      const [lng, lat] = pkg.coordinates;
      if (typeof lng !== 'number' || typeof lat !== 'number') return null;
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { id: pkg.id, name: pkg.name || pkg.nom || pkg.commune || pkg.commune_fr || 'Unnamed', geometry_type: 'Point', ...pkg } };
    }
    return null;
  }).filter(Boolean);
  return { type: 'FeatureCollection', features };
};

const extractColumns = (data: any[]) => {
  const numeric: string[] = [], text: string[] = [];
  if (data.length > 0) {
    Object.entries(data[0]).forEach(([k, v]) => {
      if (typeof v === 'number' || (typeof v === 'string' && !isNaN(parseFloat(v)) && isFinite(+v))) {
        if (!numeric.includes(k)) numeric.push(k);
      } else if (typeof v === 'string') {
        if (!text.includes(k)) text.push(k);
      }
    });
  }
  return { numeric, text };
};

const getActiveLayers = (layers: TableLayer[]) => layers.filter(l => l.active && l.data?.features?.length);

function PropValueDropdown({ values, selected, columnName, onSelect }: { values: string[]; selected: string; columnName: string; onSelect: (val: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filtered = values.filter(v => !search || v.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between text-xs py-2 pl-3 pr-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-left">
        <span className={selected ? 'text-amber-700' : 'text-gray-400'}>{selected || `Select ${columnName}…`}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -4, scaleY: 0.95 }} animate={{ opacity: 1, y: 0, scaleY: 1 }} exit={{ opacity: 0, y: -4, scaleY: 0.95 }} transition={{ duration: 0.15 }} style={{ transformOrigin: 'top' }} className="absolute top-full mt-1 left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
            <div className="p-2 border-b border-gray-100">
              <input type="text" placeholder={`Search ${columnName}…`} value={search} onChange={e => setSearch(e.target.value)} className="w-full text-xs bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-700 placeholder-gray-400 outline-none focus:border-amber-400" autoFocus />
            </div>
            {selected && <button onClick={() => { onSelect(''); setOpen(false); setSearch(''); }} className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors text-left border-b border-gray-100">× Clear selection</button>}
            <div className="max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
              {filtered.length === 0 ? <p className="px-3 py-2 text-[10px] text-gray-400 italic">No matches</p> : filtered.map(v => {
                const isSelected = selected === v;
                return (
                  <button key={v} onClick={() => { onSelect(v); setOpen(false); setSearch(''); }} className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors ${isSelected ? 'bg-amber-50 text-amber-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'}`}>
                    <span className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
                      {isSelected && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </span>
                    <span className="truncate">{v}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Toggle({ on, onToggle, size = 'md' }: { on: boolean; onToggle: () => void; size?: 'sm' | 'md' }) {
  const track = size === 'sm' ? 'w-8 h-4' : 'w-10 h-5';
  const thumb = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  const translate = size === 'sm' ? (on ? 'translate-x-4' : 'translate-x-0.5') : (on ? 'translate-x-5' : 'translate-x-0.5');
  return (
    <button onClick={onToggle} className={`${track} rounded-full transition-colors duration-200 flex items-center ${on ? 'bg-amber-500' : 'bg-gray-300'}`}>
      <div className={`${thumb} rounded-full bg-white shadow transition-transform duration-200 ${translate}`} />
    </button>
  );
}

function LayerBadge({ label, color = 'amber' }: { label: string; color?: 'amber' | 'green' | 'gray' | 'blue' }) {
  const cls = { 
    amber: 'bg-amber-50 text-amber-700 border-amber-200', 
    green: 'bg-green-50 text-green-700 border-green-200', 
    gray: 'bg-gray-100 text-gray-600 border-gray-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200'
  }[color];
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function LayerTypeIndicator({ type, color }: { type: string; color?: string }) {
  const shapes: Record<string, JSX.Element> = {
    points: <circle cx="8" cy="8" r="5" />,
    polygons: <polygon points="8,2 14,14 2,14" />,
    routes: <path d="M2 8 Q8 2 14 8" strokeWidth="2" fill="none" />,
    packages: <rect x="3" y="3" width="10" height="10" rx="2" />,
  };
  return <svg viewBox="0 0 16 16" width="14" height="14" fill={color || '#78716c'} stroke={color || '#78716c'} strokeWidth="1.5" strokeLinecap="round">{shapes[type] || shapes.packages}</svg>;
}

function LayerRow({ layer, isLoading, isExpanded, showSettings, onToggle, onExpandGradient, onExpandSettings, onToggleLabels, onLabelColumnChange, onGradientApply, onResetGradient, onLogScaleToggle, onOpenLink }: {
  layer: TableLayer; isLoading: boolean; isExpanded: boolean; showSettings: boolean;
  onToggle: () => void; onExpandGradient: () => void; onExpandSettings: () => void;
  onToggleLabels: () => void; onLabelColumnChange: (col: string) => void;
  onGradientApply: (col: string, colors: [string, string], name?: string) => void;
  onResetGradient: () => void; onLogScaleToggle: () => void; onOpenLink: () => void;
}) {
  const isCommune = layer.id.toLowerCase().includes('commune');
  const isCaidat = layer.id.toLowerCase() === 'caidats';
  const hasNumeric = (layer.numericColumns?.length ?? 0) > 0;
  const hasNoData = !hasNumeric && (layer.type === 'polygons' || layer.type === 'points');
  const borderColor = isCaidat ? 'border-l-amber-500' : isCommune ? 'border-l-amber-400' : hasNoData ? 'border-l-gray-400' : 'border-l-transparent';

  return (
    <motion.div layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="rounded-lg overflow-hidden">
      <div className={`flex items-center gap-2.5 px-3 py-2.5 border-l-[3px] ${borderColor} bg-white hover:bg-gray-50/80 transition-all cursor-pointer group border-b border-gray-100`} onClick={() => !showSettings && onToggle()}>
        <div className="relative flex-shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: (layer.color || '#d4a574') + '18' }}>
            <LayerTypeIndicator type={layer.type} color={layer.color} />
          </div>
          {layer.active && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full border border-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-700 truncate">{layer.name}</span>
            {isCaidat && <LayerBadge label="Base" color="amber" />}
            {isCommune && <LayerBadge label="Commune" color="green" />}
            {hasNoData && <LayerBadge label="No Data" color="gray" />}
            {layer.linkedLayer && <LayerBadge label="Linked" color="blue" />}
            {layer.showLabels && <LayerBadge label="Labels" color="amber" />}
            {isLoading && <span className="text-[10px] text-amber-600 animate-pulse">loading…</span>}
          </div>
          <div className="text-[11px] text-gray-400 flex items-center gap-1.5 mt-0.5">
            <span className="capitalize">{layer.type}</span>
            <span>·</span>
            <span>{layer.count} features</span>
            {layer.colorGradient && <><span>·</span><span className="text-amber-600">{layer.colorGradient.column}</span></>}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          {layer.type === 'points' && (
            <button onClick={onExpandSettings} className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold transition-colors ${showSettings ? 'bg-amber-100 text-amber-600' : 'hover:bg-gray-100 text-gray-400'}`} title="Label settings">
              <span className="text-[10px]">Aa</span>
            </button>
          )}
          {hasNumeric && (
            <button onClick={onExpandGradient} className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${isExpanded ? 'bg-amber-100 text-amber-600' : 'hover:bg-gray-100 text-gray-400'}`} title="Color gradient">
              <BarChart2 className="w-3.5 h-3.5" />
            </button>
          )}
          <Toggle on={layer.active} onToggle={onToggle} size="sm" />
        </div>
      </div>

      <AnimatePresence>
        {(isExpanded || showSettings) && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-3 pb-3 pt-2 space-y-2.5 bg-gray-50/50 border-t border-gray-100">
              {showSettings && layer.textColumns && layer.textColumns.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-gray-500">Label Column</span>
                    <Toggle on={!!layer.showLabels} onToggle={onToggleLabels} size="sm" />
                  </div>
                  {layer.showLabels && (
                    <select value={layer.labelColumn || ''} onChange={e => onLabelColumnChange(e.target.value)} className="w-full text-xs bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-700 outline-none focus:border-amber-400">
                      {layer.textColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  )}
                </div>
              )}
              {isExpanded && layer.numericColumns && layer.numericColumns.length > 0 && (
                <>
                  <div>
                    <span className="text-[11px] font-semibold text-gray-500 block mb-1.5">Color by column</span>
                    <select
                      value={layer.colorGradient?.column || ''}
                      onChange={e => {
                        const col = e.target.value;
                        if (!col) { onResetGradient(); return; }
                        onGradientApply(col, ['#fef3c7', '#d97706']);
                      }}
                      className="w-full text-xs bg-white border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-700 outline-none focus:border-amber-400"
                    >
                      <option value="">— None —</option>
                      {layer.numericColumns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  {layer.colorGradient && (
                    <>
                      <div>
                        <span className="text-[11px] text-gray-500 mb-1.5 block">Color preset</span>
                        <div className="grid grid-cols-3 gap-1">
                          {GRADIENT_PRESETS.map(preset => {
                            const isActive = layer.colorGradient?.presetName === preset.name;
                            return (
                              <button key={preset.name} onClick={() => onGradientApply(layer.colorGradient!.column, preset.colors, preset.name)} className={`text-[10px] px-1.5 py-1 rounded-md border transition-all ${isActive ? 'border-amber-400/60 text-amber-700 bg-amber-50' : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-600'}`} style={isActive ? {} : { background: `linear-gradient(90deg, ${preset.colors[0]}44, ${preset.colors[1]}66)` }}>
                                {preset.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                        <span className="text-[11px] text-gray-500">Log scale</span>
                        <Toggle on={!!layer.logScale} onToggle={onLogScaleToggle} size="sm" />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const FOLDER_META: Record<string, { label: string; icon: JSX.Element; accent: string; dot: string }> = {
  polygons: { label: 'Polygons', icon: <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><polygon points="8,2 14,14 2,14" /></svg>, accent: 'text-amber-600', dot: 'bg-amber-500' },
  points:   { label: 'Points',   icon: <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><circle cx="8" cy="8" r="5" /></svg>, accent: 'text-amber-500', dot: 'bg-amber-400' },
  routes:   { label: 'Routes',   icon: <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 8 Q8 2 14 8" /></svg>, accent: 'text-amber-700', dot: 'bg-amber-600' },
  packages: { label: 'Packages', icon: <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="2" /></svg>, accent: 'text-gray-500', dot: 'bg-gray-400' },
};

function FileTreeLayerList({ tableLayers, loadingIds, expandedLayer, settingsLayer, onToggle, onExpandGradient, onExpandSettings, onToggleLabels, onLabelColumnChange, onGradientApply, onResetGradient, onLogScaleToggle, onOpenLink }: {
  tableLayers: TableLayer[]; loadingIds: string[]; expandedLayer: string | null; settingsLayer: string | null;
  onToggle: (id: string) => void; onExpandGradient: (id: string) => void; onExpandSettings: (id: string) => void;
  onToggleLabels: (id: string) => void; onLabelColumnChange: (id: string, col: string) => void;
  onGradientApply: (id: string, col: string, colors: [string, string], name?: string) => void;
  onResetGradient: (id: string) => void; onLogScaleToggle: (id: string) => void; onOpenLink: (layer: TableLayer) => void;
}) {
  const groups = useMemo(() => {
    const map: Record<string, TableLayer[]> = {};
    tableLayers.forEach(layer => { const t = layer.type || 'packages'; if (!map[t]) map[t] = []; map[t].push(layer); });
    return map;
  }, [tableLayers]);

  const typeOrder = ['polygons', 'points', 'routes', 'packages'];
  const orderedTypes = [...typeOrder.filter(t => groups[t]?.length), ...Object.keys(groups).filter(t => !typeOrder.includes(t))];
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => Object.fromEntries(orderedTypes.map(t => [t, true])));
  const toggleFolder = (type: string) => setOpenFolders(prev => ({ ...prev, [type]: !prev[type] }));

  return (
    <div className="space-y-0.5">
      {orderedTypes.map(type => {
        const layers = groups[type];
        const meta = FOLDER_META[type] ?? { label: type, icon: null, accent: 'text-gray-500', dot: 'bg-gray-400' };
        const isOpen = openFolders[type] ?? true;
        const activeInFolder = layers.filter(l => l.active).length;
        return (
          <div key={type}>
            <button onClick={() => toggleFolder(type)} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors group text-left">
              <motion.span animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.18 }} className="flex-shrink-0 text-gray-400 group-hover:text-gray-500">
                <svg width="6" height="9" viewBox="0 0 6 9" fill="none"><path d="M1 1L5 4.5L1 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </motion.span>
              <span className="flex-shrink-0">
                <svg width="16" height="13" viewBox="0 0 16 14" fill="currentColor" className={isOpen ? meta.accent : 'text-gray-400'}><path d="M1.5 1C0.671573 1 0 1.67157 0 2.5V11.5C0 12.3284 0.671573 13 1.5 13H14.5C15.3284 13 16 12.3284 16 11.5V4.5C16 3.67157 15.3284 3 14.5 3H8L6.5 1H1.5Z" /></svg>
              </span>
              <span className={`text-xs font-semibold flex-1 min-w-0 truncate ${isOpen ? meta.accent : 'text-gray-500'}`}>{meta.label}</span>
              <span className="flex-shrink-0 flex items-center gap-1">
                {activeInFolder > 0 && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />}
                <span className="text-[10px] text-gray-400 tabular-nums">{layers.length}</span>
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                  <div className="relative ml-3 pl-3 border-l border-gray-200 space-y-0.5 pb-1">
                    <AnimatePresence initial={false}>
                      {layers.map((layer) => (
                        <div key={layer.id} className="relative">
                          <span className="absolute -left-3 top-[14px] w-2.5 border-t border-gray-200" style={{ display: 'block' }} />
                          <LayerRow
                            layer={layer} isLoading={loadingIds.includes(layer.id)}
                            isExpanded={expandedLayer === layer.id} showSettings={settingsLayer === layer.id}
                            onToggle={() => onToggle(layer.id)} onExpandGradient={() => onExpandGradient(layer.id)}
                            onExpandSettings={() => onExpandSettings(layer.id)} onToggleLabels={() => onToggleLabels(layer.id)}
                            onLabelColumnChange={col => onLabelColumnChange(layer.id, col)}
                            onGradientApply={(col, colors, name) => onGradientApply(layer.id, col, colors, name)}
                            onResetGradient={() => onResetGradient(layer.id)} onLogScaleToggle={() => onLogScaleToggle(layer.id)}
                            onOpenLink={() => onOpenLink(layer)}
                          />
                        </div>
                      ))}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export default function Sidebar({ onMapLayerChange, onTableLayersChange, onCommuneSelect, onOpenAnalytics }: SidebarProps) {
  const [tableLayers, setTableLayers] = useState<TableLayer[]>([]);
  const [activeMapLayer, setActiveMapLayer] = useState('default');
  const [showLayers, setShowLayers] = useState(true);
  const [layersLoading, setLayersLoading] = useState(true);
  const [loadingIds, setLoadingIds] = useState<string[]>([]);
  const [selectedCommunes, setSelectedCommunes] = useState<string[]>([]);
  const [focusedLayerId, setFocusedLayerId] = useState<string | null>(null);
  const [communeSearch, setCommuneSearch] = useState('');
  const [communeDropdownOpen, setCommuneDropdownOpen] = useState(false);
  const [filterAllLayers, setFilterAllLayers] = useState(false);
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const [settingsLayer, setSettingsLayer] = useState<string | null>(null);
  const [selectedLayerForLink, setSelectedLayerForLink] = useState<TableLayer | null>(null);
  const [availableCommunes, setAvailableCommunes] = useState<string[]>([]);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [propSearchTerm, setPropSearchTerm] = useState('');
  const [propSearchColumn, setPropSearchColumn] = useState('');
  const initialLoadDone = useRef(false);

  useEffect(() => { fetchTableLayers(); }, []);

  useEffect(() => {
    const communes = new Set<string>();
    tableLayers.forEach(layer => {
      layer.data?.features?.forEach((f: any) => {
        const c = f.properties.commune_fr || f.properties.commune || f.properties.nom || f.properties.name;
        if (c && typeof c === 'string') communes.add(c);
      });
    });
    setAvailableCommunes(Array.from(communes).sort());
  }, [tableLayers]);

  const fetchTableLayers = async () => {
    try {
      setLayersLoading(true);
      const res = await fetch('http://localhost:5000/api/package-layers');
      if (!res.ok) return;
      const raw = await res.json();
      const nonEmpty = raw.filter((l: any) => l.count > 0);
      const layers: TableLayer[] = await Promise.all(
        nonEmpty.map(async (layer: any) => {
          let numericColumns: string[] = [], textColumns: string[] = [];
          const colRes = await fetch(`http://localhost:5000/api/layers/${layer.id}/columns`);
          if (colRes.ok) { const colData = await colRes.json(); numericColumns = colData.numeric_columns || []; textColumns = colData.text_columns || []; }
          const isActive = layer.id.toLowerCase().includes('commune');
          return { id: layer.id, name: layer.name || layer.table_name, table_name: layer.table_name, type: layer.type, active: isActive, count: layer.count || 0, color: layer.color || getDefaultColor(layer.type), numericColumns, textColumns, showLabels: false, labelColumn: pickLabelColumn(textColumns) };
        })
      );
      setTableLayers(layers);
      const active = layers.filter(l => l.active);
      onTableLayersChange(active);
      if (active.length > 0) await loadLayerData(active, layers);
      initialLoadDone.current = true;
    } catch (err) { console.error('Error fetching layers:', err); }
    finally { setLayersLoading(false); }
  };

  const loadLayerData = async (toLoad: TableLayer[], allLayers?: TableLayer[]) => {
    const base = allLayers ?? tableLayers;
    setLoadingIds(prev => [...prev, ...toLoad.map(l => l.id)]);
    const updated = [...base];
    let changed = false;
    for (const layer of toLoad) {
      try {
        const res = await fetch(`http://localhost:5000/api/package-layers/${layer.id}/data`);
        if (!res.ok) continue;
        const raw = await res.json();
        const geojson = buildGeoJSON(raw);
        const { numeric, text } = extractColumns(raw);
        const idx = updated.findIndex(l => l.id === layer.id);
        if (idx !== -1) {
          updated[idx] = {
            ...updated[idx],
            data: geojson,
            count: geojson.features.length,
            numericColumns: numeric,
            textColumns: text,
            labelColumn: updated[idx].labelColumn || pickLabelColumn(text),
          };
          changed = true;
        }
      } catch (err) { console.error(`Error loading data for ${layer.id}:`, err); }
    }
    if (changed) {
      setTableLayers([...updated]);
      onTableLayersChange(getActiveLayers(updated));
    }
    setLoadingIds(prev => prev.filter(id => !toLoad.map(l => l.id).includes(id)));
  };

  const updateLayers = useCallback((updater: (prev: TableLayer[]) => TableLayer[]) => {
    setTableLayers(prev => {
      const next = updater(prev);
      onTableLayersChange(getActiveLayers(next));
      return next;
    });
  }, [onTableLayersChange]);

  const handleToggle = useCallback(async (id: string) => {
    const layer = tableLayers.find(l => l.id === id);
    const needsLoad = layer && !layer.active && !layer.data;
    updateLayers(prev => prev.map(l => l.id !== id ? l : { ...l, active: !l.active }));
    if (needsLoad && layer) await loadLayerData([{ ...layer, active: true }]);
  }, [tableLayers, updateLayers]);

  const handleToggleAll = useCallback((on: boolean) => {
    updateLayers(prev => {
      const toLoad = on ? prev.filter(l => !l.data) : [];
      if (toLoad.length) loadLayerData(toLoad.map(l => ({ ...l, active: true })));
      return prev.map(l => ({ ...l, active: on }));
    });
  }, [updateLayers]);

  const handleToggleLabels = useCallback((id: string) => { updateLayers(prev => prev.map(l => l.id === id ? { ...l, showLabels: !l.showLabels } : l)); }, [updateLayers]);
  const handleLabelColumn = useCallback((id: string, col: string) => { updateLayers(prev => prev.map(l => l.id === id ? { ...l, labelColumn: col } : l)); }, [updateLayers]);

  const handleGradientApply = useCallback((id: string, col: string, colors: [string, string], presetName?: string) => {
    updateLayers(prev => prev.map(l => {
      if (l.id !== id) return l;
      const vals = l.data?.features?.map((f: any) => parseFloat(f.properties[col])).filter((v: number) => !isNaN(v)) || [];
      const minValue = Math.min(...vals), maxValue = Math.max(...vals);
      return { ...l, colorGradient: { column: col, minValue, maxValue, colorRange: colors, presetName } };
    }));
  }, [updateLayers]);

  const handleResetGradient = useCallback((id: string) => { updateLayers(prev => prev.map(l => l.id === id ? { ...l, colorGradient: undefined } : l)); }, [updateLayers]);
  const handleLogScale = useCallback((id: string) => { updateLayers(prev => prev.map(l => l.id === id ? { ...l, logScale: !l.logScale } : l)); }, [updateLayers]);

  const handleLinkLayers = useCallback((sourceId: string, targetId: string, col: string) => {
    updateLayers(prev => prev.map(l => l.id === sourceId ? { ...l, linkedLayer: targetId, linkedColumn: col } : l));
    setSelectedLayerForLink(null);
  }, [updateLayers]);

  const handleResetLink = useCallback((id: string) => {
    updateLayers(prev => prev.map(l => l.id === id ? { ...l, linkedLayer: undefined, linkedColumn: undefined } : l));
    setSelectedLayerForLink(null);
  }, [updateLayers]);

  const handleUpdateLayer = useCallback((updatedLayer: TableLayer) => { updateLayers(prev => prev.map(l => l.id === updatedLayer.id ? updatedLayer : l)); }, [updateLayers]);

  // Pick the best "nom" column from a layer's columns
  const pickNomColumn = useCallback((layer: TableLayer | undefined): string => {
    if (!layer) return '';
    const allCols = [...(layer.textColumns ?? []), ...(layer.numericColumns ?? [])];
    const nomPriority = ['nom_fr', 'nom', 'name'];
    return nomPriority.find(k => allCols.some(c => c.toLowerCase() === k))
      ?? allCols.find(c => c.toLowerCase().includes('nom'))
      ?? allCols[0]
      ?? '';
  }, []);

  const handleCommuneToggle = useCallback((commune: string) => {
    setSelectedCommunes(prev => {
      const next = prev.includes(commune) ? prev.filter(c => c !== commune) : prev.length < 6 ? [...prev, commune] : prev;
      // Auto-set focusedLayerId to first eligible layer if communes are selected and no layer focused yet
      if (next.length > 0 && !focusedLayerId) {
        const eligible = tableLayers.filter(l => l.active && l.data?.features?.length && !l.id.toLowerCase().includes('commune') && l.id.toLowerCase() !== 'caidats');
        const defaultLayer = eligible[0] ?? null;
        if (defaultLayer) {
          const defaultCol = pickNomColumn(defaultLayer);
          setFocusedLayerId(defaultLayer.id);
          setPropSearchColumn(defaultCol);
          onCommuneSelect?.(next, filterAllLayers, defaultLayer.id);
          return next;
        }
      }
      onCommuneSelect?.(next, filterAllLayers, focusedLayerId);
      return next;
    });
  }, [onCommuneSelect, filterAllLayers, focusedLayerId, tableLayers, pickNomColumn]);

  const handleFocusedLayer = useCallback((layerId: string | null) => {
    setFocusedLayerId(layerId);
    setPropSearchTerm('');
    // Default propSearchColumn to best nom column of the selected layer
    if (layerId) {
      const layer = tableLayers.find(l => l.id === layerId);
      const defaultCol = pickNomColumn(layer);
      setPropSearchColumn(defaultCol);
    } else {
      setPropSearchColumn('');
    }
    setTableLayers(prev => { const next = prev.map(l => ({ ...l, propFilterColumn: undefined, propFilterValue: undefined })); onTableLayersChange(getActiveLayers(next)); return next; });
    onCommuneSelect?.(selectedCommunes, filterAllLayers, layerId);
  }, [onCommuneSelect, selectedCommunes, filterAllLayers, tableLayers, pickNomColumn]);

  const handlePropSearch = useCallback((term: string, col: string, layerId: string) => {
    setPropSearchTerm(term); setPropSearchColumn(col);
    setTableLayers(prev => { const next = prev.map(l => l.id === layerId ? { ...l, propFilterColumn: col || undefined, propFilterValue: term || undefined } : l); onTableLayersChange(getActiveLayers(next)); return next; });
  }, [onTableLayersChange]);

  const handleCommunesClear = useCallback(() => {
    setSelectedCommunes([]); setFocusedLayerId(null); setPropSearchTerm(''); setPropSearchColumn('');
    setTableLayers(prev => { const next = prev.map(l => ({ ...l, propFilterColumn: undefined, propFilterValue: undefined })); onTableLayersChange(getActiveLayers(next)); return next; });
    onCommuneSelect?.([], filterAllLayers, null);
  }, [onCommuneSelect, filterAllLayers, onTableLayersChange]);

  const handleFilterMode = useCallback((filterAll: boolean) => { setFilterAllLayers(filterAll); onCommuneSelect?.(selectedCommunes, filterAll, focusedLayerId); }, [selectedCommunes, onCommuneSelect, focusedLayerId]);
  const handleMapLayer = useCallback((id: string) => { setActiveMapLayer(id); onMapLayerChange(id); }, [onMapLayerChange]);

  const activeCount = tableLayers.filter(l => l.active).length;

  return (
    <div className="fixed left-5 top-5 flex z-40 gap-3 items-start">
      {showAnalyticsModal && (
        <DataAnalyticsModal isOpen={showAnalyticsModal} onClose={() => setShowAnalyticsModal(false)} tableLayers={tableLayers} />
      )}

      {/* Icon rail */}
      <div className="flex flex-col items-center gap-2">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-white shadow-md border border-gray-100">
          <MapPin className="w-5 h-5 text-amber-600" />
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl p-2 bg-white shadow-md border border-gray-100">
          <NavBtn icon={<FileText className="w-4 h-4" />} active={false} onClick={() => onOpenAnalytics ? onOpenAnalytics() : setShowAnalyticsModal(true)} title="Analytics" />
          <NavBtn icon={<Layers className="w-4 h-4" />} active={showLayers} onClick={() => setShowLayers(v => !v)} title="Layers" />
        </div>
      </div>

      {/* Layers panel */}
      <AnimatePresence>
        {showLayers && (
          <motion.div key="layers-panel" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="w-[380px] flex flex-col" style={{ maxHeight: 'calc(100vh - 40px)' }}>
            <div className="flex flex-col rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b border-gray-100">
                <h2 className="text-sm font-bold text-gray-800 flex items-center gap-2"><Layers className="w-4 h-4 text-amber-600" /> Map Layers</h2>
                <p className="text-[11px] text-gray-400 mt-0.5">Toggle database tables on the map</p>
              </div>

              {/* Commune filter + base map */}
              <div className="px-4 py-3 border-b border-gray-100 space-y-3 bg-gray-50/50">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-gray-600">Commune Filter</span>
                    <div className="flex rounded-md overflow-hidden border border-gray-200 text-[10px]">
                      <button onClick={() => handleFilterMode(false)} className={`px-2 py-1 transition-colors ${!filterAllLayers ? 'bg-amber-500 text-white' : 'bg-white text-gray-500'}`}>Communes</button>
                      <button onClick={() => handleFilterMode(true)} className={`px-2 py-1 transition-colors ${filterAllLayers ? 'bg-amber-500 text-white' : 'bg-white text-gray-500'}`}>All layers</button>
                    </div>
                  </div>
                  <div className="relative">
                    <button onClick={() => setCommuneDropdownOpen(v => !v)} className="w-full flex items-center justify-between text-xs py-2 pl-3 pr-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors text-left">
                      <span className={selectedCommunes.length ? 'text-amber-700' : 'text-gray-400'}>{selectedCommunes.length === 0 ? 'All Communes' : `${selectedCommunes.length} selected`}</span>
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${communeDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    <AnimatePresence>
                      {communeDropdownOpen && (
                        <motion.div initial={{ opacity: 0, y: -4, scaleY: 0.95 }} animate={{ opacity: 1, y: 0, scaleY: 1 }} exit={{ opacity: 0, y: -4, scaleY: 0.95 }} transition={{ duration: 0.15 }} style={{ transformOrigin: 'top' }} className="absolute top-full mt-1 left-0 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                          <div className="p-2 border-b border-gray-100">
                            <input type="text" placeholder="Search communes…" value={communeSearch} onChange={e => setCommuneSearch(e.target.value)} className="w-full text-xs bg-gray-50 border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-700 placeholder-gray-400 outline-none focus:border-amber-400" autoFocus />
                          </div>
                          <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-100">
                            <span className="text-[10px] text-gray-400">Select up to 6</span>
                            <span className="text-[10px] font-medium text-amber-600">{selectedCommunes.length}/6</span>
                          </div>
                          <div className="max-h-48 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                            {availableCommunes.filter(c => !communeSearch || c.toLowerCase().includes(communeSearch.toLowerCase())).map(c => {
                              const isSelected = selectedCommunes.includes(c);
                              const isDisabled = !isSelected && selectedCommunes.length >= 6;
                              return (
                                <button key={c} onClick={() => !isDisabled && handleCommuneToggle(c)} disabled={isDisabled} className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-left transition-colors ${isSelected ? 'bg-amber-50 text-amber-700' : isDisabled ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'}`}>
                                  <span className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-gray-300'}`}>
                                    {isSelected && <svg width="8" height="6" viewBox="0 0 8 6" fill="none"><path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                  </span>
                                  <span className="truncate">{c}</span>
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {selectedCommunes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {selectedCommunes.map(c => (
                        <span key={c} className="flex items-center gap-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                          {c}<button onClick={() => handleCommuneToggle(c)} className="hover:text-red-500 transition-colors leading-none">×</button>
                        </span>
                      ))}
                      <button onClick={handleCommunesClear} className="text-[10px] text-red-500 hover:text-red-600 px-1.5 py-0.5 rounded-full hover:bg-red-50 transition-colors">Clear all</button>
                    </div>
                  )}

                  {selectedCommunes.length > 0 && (() => {
                    const eligibleLayers = tableLayers.filter(l => l.active && l.data?.features?.length && !l.id.toLowerCase().includes('commune') && l.id.toLowerCase() !== 'caidats');
                    if (!eligibleLayers.length) return null;
                    return (
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Show only layer</span>
                          {focusedLayerId && <button onClick={() => handleFocusedLayer(null)} className="text-[10px] text-red-500 hover:text-red-600 transition-colors">Show all</button>}
                        </div>
                        <div className="relative">
                          <select value={focusedLayerId ?? ''} onChange={e => handleFocusedLayer(e.target.value || null)} className="w-full appearance-none text-xs py-2 pl-3 pr-8 rounded-lg border border-gray-200 bg-white text-gray-700 focus:outline-none cursor-pointer">
                            <option value="">— All layers —</option>
                            {eligibleLayers.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        </div>
                        {focusedLayerId && (() => {
                          const focusedLayer = tableLayers.find(l => l.id === focusedLayerId);
                          const allCols = [...(focusedLayer?.textColumns ?? []), ...(focusedLayer?.numericColumns ?? [])];
                          const nomPriority = ['nom_fr', 'nom', 'name'];
                          const defaultNomCol = nomPriority.find(k => allCols.some(c => c.toLowerCase() === k))
                            ?? allCols.find(c => c.toLowerCase().includes('nom'))
                            ?? allCols[0]
                            ?? '';
                          const activeCol = propSearchColumn || defaultNomCol;

                          // Collect code_commune values from the selected commune polygons
                          const selectedCommuneCodes = new Set<string>();
                          tableLayers.forEach(l => {
                            if (l.id.toLowerCase().includes('commune') && l.data?.features) {
                              l.data.features.forEach((f: any) => {
                                const name = (f.properties.commune_fr || f.properties.commune || f.properties.nom || f.properties.name || '').toLowerCase();
                                if (selectedCommunes.map(c => c.toLowerCase()).includes(name)) {
                                  const code = f.properties.code_commune || f.properties.commune_code || f.properties.code_geo;
                                  if (code) selectedCommuneCodes.add(String(code).toLowerCase());
                                }
                              });
                            }
                          });

                          // Find the code_commune key on the focused layer
                          const firstFeature = focusedLayer?.data?.features?.[0];
                          const communeCodeKey = firstFeature
                            ? Object.keys(firstFeature.properties || {}).find(k =>
                                ['code_commune', 'commune_code', 'code_geo'].includes(k.toLowerCase())
                              )
                            : undefined;

                          // Points in this layer that belong to the selected commune(s)
                          const communeFeatures: any[] = (() => {
                            const allFeatures = focusedLayer?.data?.features ?? [];

                            // 1. Try code_commune join (most precise)
                            if (communeCodeKey && selectedCommuneCodes.size > 0) {
                              return allFeatures.filter((f: any) => {
                                const code = f.properties[communeCodeKey];
                                return code && selectedCommuneCodes.has(String(code).toLowerCase());
                              });
                            }

                            // 2. Fallback: name-based matching on commune_fr / commune / nom / name
                            const selectedCommuneNames = selectedCommunes.map(c => c.toLowerCase());
                            return allFeatures.filter((f: any) => {
                              const featureCommune = f.properties.commune_fr || f.properties.commune || f.properties.nom || f.properties.name;
                              if (!featureCommune) return false;
                              return selectedCommuneNames.includes(String(featureCommune).toLowerCase());
                            });
                          })();

                          const usingCodeJoin = !!(communeCodeKey && selectedCommuneCodes.size > 0);

                          // Dropdown values are scoped to the commune's points only
                          const uniqueValues: string[] = activeCol
                            ? Array.from(new Set(
                                communeFeatures
                                  .map((f: any) => f.properties[activeCol])
                                  .filter((v: any) => v !== null && v !== undefined && String(v).trim() !== '')
                                  .map((v: any) => String(v))
                              )).sort()
                            : [];

                          return (
                            <div className="space-y-1.5 pt-1.5 border-t border-gray-100">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Points in commune</span>
                                  <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                                    {communeFeatures.length} points
                                  </span>
                                </div>
                              </div>
                              {usingCodeJoin && (
                                <p className="text-[9px] text-amber-600 flex items-center gap-1">
                                  <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                                  Joined via <strong className="mx-0.5">code_commune</strong> · {selectedCommunes.length > 1 ? `${selectedCommunes.length} communes` : selectedCommunes[0]}
                                </p>
                              )}
                              <div className="text-[9px] text-gray-400">Browse column values within this commune</div>
                              {allCols.length > 1 && (
                                <select value={activeCol} onChange={e => { setPropSearchColumn(e.target.value); handlePropSearch('', e.target.value, focusedLayerId); }} className="w-full appearance-none text-[10px] py-1.5 pl-2.5 pr-7 rounded-md border border-gray-200 bg-white text-gray-500 focus:outline-none cursor-pointer">
                                  {allCols.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              )}
                              {activeCol && <PropValueDropdown values={uniqueValues} selected={propSearchTerm} columnName={activeCol} onSelect={val => handlePropSearch(val, activeCol, focusedLayerId)} />}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <span className="text-xs font-semibold text-gray-600 block mb-1.5">Base Map</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {MAP_LAYERS.map(l => (
                      <button key={l.id} onClick={() => handleMapLayer(l.id)} className={`text-xs py-1.5 px-2 rounded-md transition-all text-left ${activeMapLayer === l.id ? 'bg-amber-100 text-amber-800 font-semibold border border-amber-200' : 'bg-white hover:bg-gray-50 text-gray-500 border border-gray-100'}`}>{l.name}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Layer list */}
              <div className="overflow-y-auto p-3 space-y-0.5" style={{ scrollbarWidth: 'none', maxHeight: '40vh' }}>
                <div className="flex items-center justify-between mb-2 sticky top-0 z-10 py-1 bg-white/90 backdrop-blur-sm">
                  <span className="text-xs font-bold text-gray-500">Database Tables <span className="ml-1 text-gray-400 font-normal">({activeCount}/{tableLayers.length})</span></span>
                  <div className="flex gap-1">
                    <button onClick={() => handleToggleAll(true)} className="text-[10px] bg-amber-500 text-white px-2 py-1 rounded-md hover:bg-amber-600 transition-colors">All On</button>
                    <button onClick={() => handleToggleAll(false)} className="text-[10px] bg-gray-400 text-white px-2 py-1 rounded-md hover:bg-gray-500 transition-colors">All Off</button>
                    <button onClick={fetchTableLayers} className="text-[10px] bg-gray-500 text-white px-2 py-1 rounded-md hover:bg-gray-600 transition-colors" title="Refresh"><RefreshCw className="w-3 h-3" /></button>
                  </div>
                </div>
                {layersLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-8 h-8 border-2 border-amber-200 border-t-amber-500 rounded-full" />
                    <span className="text-xs text-gray-400">Loading layers…</span>
                  </div>
                ) : tableLayers.length === 0 ? (
                  <div className="text-center py-12 text-xs text-gray-400">No tables found</div>
                ) : (
                  <FileTreeLayerList
                    tableLayers={tableLayers} loadingIds={loadingIds} expandedLayer={expandedLayer} settingsLayer={settingsLayer}
                    onToggle={(id) => handleToggle(id)} onExpandGradient={(id) => setExpandedLayer(p => p === id ? null : id)}
                    onExpandSettings={(id) => setSettingsLayer(p => p === id ? null : id)} onToggleLabels={(id) => handleToggleLabels(id)}
                    onLabelColumnChange={(id, col) => handleLabelColumn(id, col)}
                    onGradientApply={(id, col, colors, name) => handleGradientApply(id, col, colors, name)}
                    onResetGradient={(id) => handleResetGradient(id)} onLogScaleToggle={(id) => handleLogScale(id)}
                    onOpenLink={(layer) => setSelectedLayerForLink(layer)}
                  />
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
                <div className="text-[10px] text-gray-400 space-y-0.5">
                  <div className="text-amber-600 font-medium">{activeCount} layer{activeCount !== 1 ? 's' : ''} active</div>
                  <div>· <span className="text-green-600">Green</span> = Commune · <span className="text-amber-600">Amber</span> = Base · <span className="text-gray-500">Gray</span> = needs data</div>
                  {selectedCommunes.length > 0 && <div>· Filtered by <strong>{selectedCommunes.join(', ')}</strong></div>}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layer link manager */}
      {selectedLayerForLink && (
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
          <LayerLinkManager layers={tableLayers} selectedLayer={selectedLayerForLink} onLinkLayers={handleLinkLayers} onResetLink={handleResetLink} onUpdateLayer={handleUpdateLayer} />
        </motion.div>
      )}
    </div>
  );
}

function NavBtn({ icon, active, onClick, title, badge }: { icon: React.ReactNode; active: boolean; onClick: () => void; title?: string; badge?: string }) {
  return (
    <button onClick={onClick} title={title} className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-all ${active ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`}>
      {icon}
      {badge && <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{badge}</span>}
    </button>
  );
}