// DataAnalyticsModal.tsx — Minimalist French Election Style
import { X, BarChart3, PieChart, TrendingUp, Table, Download, Filter, Layers, Globe } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tableLayers: TableLayer[];
}

type ViewMode = 'charts' | 'table' | 'geo';
type ChartType = 'bar' | 'pie' | 'line';

interface DataRow {
  id: any;
  label: string;
  value: number;
  color: string;
}

interface Stats {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  median: number;
}

function computeStats(values: number[]): Stats {
  if (!values.length) return { count: 0, sum: 0, avg: 0, min: 0, max: 0, median: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    count: values.length,
    sum,
    avg: sum / values.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

function fmt(n: number) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toFixed(2);
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-white rounded-lg px-3 py-2.5 border border-gray-100 shadow-sm">
      <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm font-bold" style={{ color: accent || '#374151' }}>{value}</div>
    </div>
  );
}

function BarChartView({ data, color }: { data: DataRow[]; color: string }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="space-y-2">
      {data.map((row, i) => {
        const pct = (row.value / maxVal) * 100;
        return (
          <div key={i}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-600 font-medium truncate max-w-[55%]" title={row.label}>{row.label}</span>
              <span className="text-gray-400 font-mono tabular-nums ml-2">{fmt(row.value)}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, delay: i * 0.025, ease: 'easeOut' }}
                className="h-full rounded-full"
                style={{ backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PieChartView({ data, color }: { data: DataRow[]; color: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const colors = data.map((_, i) => {
    const h = (parseInt(color.slice(1, 3), 16) + i * 37) % 360;
    return `hsl(${h}, 55%, 50%)`;
  });

  let cumulative = 0;
  const segments = data.map((row, i) => {
    const pct = total > 0 ? row.value / total : 0;
    const start = cumulative;
    cumulative += pct;
    return { ...row, pct, start, color: colors[i] };
  });

  const gradientStops = segments
    .map(s => `${s.color} ${(s.start * 360).toFixed(1)}deg ${((s.start + s.pct) * 360).toFixed(1)}deg`)
    .join(', ');

  return (
    <div className="flex items-start gap-8">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'backOut' }}
        className="w-40 h-40 rounded-full flex-shrink-0 shadow-inner"
        style={{ background: `conic-gradient(${gradientStops})` }}
      />
      <div className="flex-1 space-y-1.5 pt-2">
        {segments.slice(0, 12).map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-gray-500 truncate flex-1">{s.label}</span>
            <span className="font-mono text-gray-400 tabular-nums">{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
        {segments.length > 12 && (
          <div className="text-[10px] text-gray-400">+{segments.length - 12} more</div>
        )}
      </div>
    </div>
  );
}

function LineChartView({ data, color }: { data: DataRow[]; color: string }) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const pts = data
    .map((d, i) => {
      const x = (i / Math.max(data.length - 1, 1)) * 100;
      const y = 100 - (d.value / maxVal) * 90;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `0,100 ${pts} 100,100`;

  return (
    <div className="space-y-3">
      <svg viewBox="0 0 100 100" className="w-full h-44" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#lineGrad)" />
        <polyline points={pts} fill="none" stroke={color} strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((_, i) => {
          const x = (i / Math.max(data.length - 1, 1)) * 100;
          const y = 100 - (data[i].value / maxVal) * 90;
          return <circle key={i} cx={x} cy={y} r="0.8" fill={color} />;
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-gray-400 px-1">
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function DataTableView({
  data, stats, textCol, numCol, layerName, color,
}: {
  data: DataRow[];
  stats: Stats | null;
  textCol: string;
  numCol: string;
  layerName: string;
  color: string;
}) {
  if (!data.length) return (
    <div className="text-center py-16 text-gray-400">
      <Table className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm">No data to display</p>
    </div>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="py-3 px-4 text-left font-semibold text-gray-400 w-10">#</th>
            <th className="py-3 px-4 text-left font-semibold text-gray-600">{textCol || 'Name'}</th>
            <th className="py-3 px-4 text-right font-semibold text-gray-600">{numCol || 'Value'}</th>
            <th className="py-3 px-4 text-left font-semibold text-gray-400 w-48">Distribution</th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 50).map((row, i) => {
            const pct = stats?.max ? (row.value / stats.max) * 100 : 0;
            return (
              <motion.tr
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.01 }}
                className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors"
              >
                <td className="py-2.5 px-4 text-gray-300 font-mono">{i + 1}</td>
                <td className="py-2.5 px-4 font-medium text-gray-700">{row.label}</td>
                <td className="py-2.5 px-4 text-right font-mono text-gray-500 tabular-nums">{fmt(row.value)}</td>
                <td className="py-2.5 px-4">
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
      {data.length > 50 && (
        <div className="text-center py-2.5 text-[10px] text-gray-400 border-t border-gray-100">
          Showing 50 of {data.length} records · <strong>{layerName}</strong>
        </div>
      )}
    </div>
  );
}

function GeoCardsView({ layers }: { layers: TableLayer[] }) {
  if (!layers.length) return (
    <div className="text-center py-16 text-gray-400">
      <Globe className="w-10 h-10 mx-auto mb-3 opacity-40" />
      <p className="text-sm">No active layers with data</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {layers.map((layer, i) => {
        const featureCount = layer.data?.features?.length ?? 0;
        return (
          <motion.div
            key={layer.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: (layer.color ?? '#78716c') + '18' }}>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: layer.color ?? '#78716c' }} />
                </div>
                <div>
                  <div className="font-semibold text-gray-800 text-sm">{layer.name}</div>
                  <div className="text-[10px] text-gray-400">{layer.table_name}</div>
                </div>
              </div>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full capitalize">{layer.type}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-gray-800">{featureCount.toLocaleString()}</div>
                <div className="text-[10px] text-gray-400">Features</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-gray-800">{layer.numericColumns?.length ?? 0}</div>
                <div className="text-[10px] text-gray-400">Numeric</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <div className="text-sm font-bold text-gray-800">{layer.textColumns?.length ?? 0}</div>
                <div className="text-[10px] text-gray-400">Text</div>
              </div>
            </div>

            {(layer.numericColumns?.length ?? 0) > 0 && (
              <div>
                <div className="text-[10px] text-gray-400 mb-1.5">Numeric columns</div>
                <div className="flex flex-wrap gap-1">
                  {layer.numericColumns?.slice(0, 6).map(col => (
                    <span key={col} className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-md border border-amber-100">{col}</span>
                  ))}
                  {(layer.numericColumns?.length ?? 0) > 6 && (
                    <span className="text-[10px] text-gray-400">+{(layer.numericColumns?.length ?? 0) - 6}</span>
                  )}
                </div>
              </div>
            )}

            {layer.linkedLayer && (
              <div className="mt-2 pt-2 border-t border-gray-100 text-[10px] text-amber-600 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                Linked with <strong>{layer.linkedLayer}</strong>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

export default function DataAnalyticsModal({ isOpen, onClose, tableLayers }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('charts');
  const [selectedLayerId, setSelectedLayerId] = useState('');
  const [numCol, setNumCol] = useState('');
  const [textCol, setTextCol] = useState('');
  const [chartType, setChartType] = useState<ChartType>('bar');

  const activeLayers = useMemo(() =>
    tableLayers.filter(l => l.active && l.data?.features?.length > 0),
    [tableLayers]
  );

  useEffect(() => {
    if (isOpen && activeLayers.length > 0 && !selectedLayerId) {
      setSelectedLayerId(activeLayers[0].id);
    }
  }, [isOpen, activeLayers, selectedLayerId]);

  useEffect(() => {
    const layer = activeLayers.find(l => l.id === selectedLayerId);
    if (!layer) return;
    if (layer.numericColumns?.length) setNumCol(layer.numericColumns[0]);
    const tc = layer.textColumns?.find(c =>
      ['name', 'nom', 'commune'].some(k => c.toLowerCase().includes(k))
    ) ?? layer.textColumns?.[0] ?? '';
    setTextCol(tc);
  }, [selectedLayerId, activeLayers]);

  const selectedLayer = useMemo(() =>
    activeLayers.find(l => l.id === selectedLayerId),
    [activeLayers, selectedLayerId]
  );

  const { chartData, stats } = useMemo(() => {
    if (!selectedLayer?.data?.features || !numCol || !textCol) {
      return { chartData: [] as DataRow[], stats: null };
    }
    const rows: DataRow[] = selectedLayer.data.features.map((f: any) => ({
      id: f.properties.id ?? Math.random(),
      label: String(f.properties[textCol] ?? 'Unknown'),
      value: parseFloat(f.properties[numCol]) || 0,
      color: selectedLayer.color ?? '#d97706',
    }));
    const sorted = rows.sort((a, b) => b.value - a.value).slice(0, 50);
    return {
      chartData: sorted,
      stats: computeStats(rows.map(r => r.value).filter(v => !isNaN(v))),
    };
  }, [selectedLayer, numCol, textCol]);

  const handleExport = () => {
    if (!selectedLayer || !chartData.length) return;
    const payload = {
      layer: selectedLayer.name,
      timestamp: new Date().toISOString(),
      numCol, textCol, data: chartData, statistics: stats,
    };
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
    a.download = `${selectedLayer.name}_${numCol}_analysis.json`;
    a.click();
  };

  const viewTabs: { id: ViewMode; label: string; icon: React.ReactNode }[] = [
    { id: 'charts', label: 'Charts', icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: 'table',  label: 'Table',  icon: <Table     className="w-3.5 h-3.5" /> },
    { id: 'geo',    label: 'Layers', icon: <Globe     className="w-3.5 h-3.5" /> },
  ];

  const chartTabs: { id: ChartType; icon: React.ReactNode; label: string }[] = [
    { id: 'bar',  icon: <BarChart3  className="w-4 h-4" />, label: 'Bar'  },
    { id: 'pie',  icon: <PieChart   className="w-4 h-4" />, label: 'Pie'  },
    { id: 'line', icon: <TrendingUp className="w-4 h-4" />, label: 'Line' },
  ];

  const layerColor = selectedLayer?.color ?? '#d97706';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="analytics-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/30"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="relative w-[92vw] max-w-6xl h-[88vh] bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-800">Data Analytics</h2>
                  <p className="text-[11px] text-gray-400">
                    {activeLayers.length} active layer{activeLayers.length !== 1 ? 's' : ''} · {tableLayers.length} total
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExport}
                  disabled={!chartData.length}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Export
                </button>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Left sidebar controls */}
              <div className="w-60 border-r border-gray-200 overflow-y-auto flex-shrink-0 p-4 space-y-5 bg-gray-50/30">
                <div>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                    <Layers className="w-3.5 h-3.5" /> Layer
                  </label>
                  <select
                    className="w-full text-xs p-2 rounded-lg border border-gray-200 bg-white focus:border-amber-400 outline-none"
                    value={selectedLayerId}
                    onChange={e => setSelectedLayerId(e.target.value)}
                  >
                    <option value="">— Select layer —</option>
                    {activeLayers.map(l => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({l.data?.features?.length ?? 0})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedLayerId && (
                  <div className="space-y-3">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                      <Filter className="w-3.5 h-3.5" /> Columns
                    </label>
                    <div>
                      <div className="text-[10px] text-gray-400 mb-1">Label (text)</div>
                      <select
                        className="w-full text-xs p-2 rounded-lg border border-gray-200 bg-white focus:border-amber-400 outline-none"
                        value={textCol}
                        onChange={e => setTextCol(e.target.value)}
                      >
                        <option value="">— Select —</option>
                        {selectedLayer?.textColumns?.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="text-[10px] text-gray-400 mb-1">Value (numeric)</div>
                      <select
                        className="w-full text-xs p-2 rounded-lg border border-gray-200 bg-white focus:border-amber-400 outline-none"
                        value={numCol}
                        onChange={e => setNumCol(e.target.value)}
                      >
                        <option value="">— Select —</option>
                        {selectedLayer?.numericColumns?.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {viewMode === 'charts' && (
                  <div>
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Chart Type</div>
                    <div className="flex flex-col gap-1.5">
                      {chartTabs.map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setChartType(tab.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                            chartType === tab.id
                              ? 'bg-amber-500 text-white shadow-sm'
                              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                          }`}
                        >
                          {tab.icon} {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {stats && selectedLayerId && (
                  <div>
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Statistics</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <StatCard label="Count"  value={stats.count.toLocaleString()} />
                      <StatCard label="Sum"    value={fmt(stats.sum)} />
                      <StatCard label="Avg"    value={fmt(stats.avg)} accent="#d97706" />
                      <StatCard label="Median" value={fmt(stats.median)} />
                      <StatCard label="Min"    value={fmt(stats.min)} accent="#10b981" />
                      <StatCard label="Max"    value={fmt(stats.max)} accent="#ef4444" />
                    </div>
                  </div>
                )}
              </div>

              {/* Main content */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* View tabs */}
                <div className="flex gap-1 px-6 pt-4 border-b border-gray-200 flex-shrink-0">
                  {viewTabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setViewMode(tab.id)}
                      className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-colors ${
                        viewMode === tab.id ? 'text-amber-600' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {tab.icon} {tab.label}
                      {viewMode === tab.id && (
                        <motion.div
                          layoutId="tab-indicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 rounded-full"
                        />
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                  <AnimatePresence mode="wait">
                    {viewMode === 'charts' && (
                      <motion.div
                        key="charts"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                      >
                        {chartData.length > 0 && numCol && textCol ? (
                          <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
                            <h3 className="text-sm font-bold text-gray-700 mb-4">
                              {numCol}{' '}
                              <span className="text-gray-400 font-normal">by</span>{' '}
                              {textCol}
                              <span className="ml-2 text-[10px] font-normal text-gray-400">
                                Top {chartData.length}
                              </span>
                            </h3>
                            {chartType === 'bar'  && <BarChartView  data={chartData.slice(0, 25)} color={layerColor} />}
                            {chartType === 'pie'  && <PieChartView  data={chartData.slice(0, 15)} color={layerColor} />}
                            {chartType === 'line' && <LineChartView data={chartData} color={layerColor} />}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                            <BarChart3 className="w-12 h-12 mb-3 opacity-30" />
                            <p className="text-sm">Select a layer and columns to visualize</p>
                          </div>
                        )}
                      </motion.div>
                    )}

                    {viewMode === 'table' && (
                      <motion.div
                        key="table"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                      >
                        <DataTableView
                          data={chartData}
                          stats={stats}
                          textCol={textCol}
                          numCol={numCol}
                          layerName={selectedLayer?.name ?? ''}
                          color={layerColor}
                        />
                      </motion.div>
                    )}

                    {viewMode === 'geo' && (
                      <motion.div
                        key="geo"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                      >
                        <GeoCardsView layers={activeLayers} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}