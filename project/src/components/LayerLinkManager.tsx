import { useState, useEffect } from 'react';
import { Link, Unlink, BarChart3, Table, RefreshCw, Pin, X, ChevronRight, Info, TrendingUp, PieChart, Search, Zap } from 'lucide-react';

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

interface LayerLinkManagerProps {
    layers: TableLayer[];
    selectedLayer: TableLayer | null;
    onLinkLayers: (sourceLayerId: string, targetLayerId: string, linkColumn: string, valueColumn: string) => void;
    onResetLink: (layerId: string) => void;
    onUpdateLayer: (layerId: string, updates: Partial<TableLayer>) => void;
}

interface Statistics {
    count: number;
    avg: number;
    min: number;
    max: number;
    stddev: number;
    median: number;
}

export default function LayerLinkManager({
    layers,
    selectedLayer,
    onLinkLayers,
    onResetLink,
    onUpdateLayer
}: LayerLinkManagerProps) {
    const [availableLayers, setAvailableLayers] = useState<TableLayer[]>([]);
    const [selectedSourceLayer, setSelectedSourceLayer] = useState<string>('');
    const [commonColumns, setCommonColumns] = useState<string[]>([]);
    const [selectedLinkColumn, setSelectedLinkColumn] = useState<string>('');
    const [valueColumns, setValueColumns] = useState<string[]>([]);
    const [selectedValueColumn, setSelectedValueColumn] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [statistics, setStatistics] = useState<Statistics | null>(null);
    const [colorRange, setColorRange] = useState<[string, string]>(['#fef3c7', '#d97706']);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
    const [autoDetectionStatus, setAutoDetectionStatus] = useState<string>('');
    const [isAutoDetecting, setIsAutoDetecting] = useState(false);
    const [selectedSourceColumn, setSelectedSourceColumn] = useState<string>('');
    const [isAutoDetectionCompleted, setIsAutoDetectionCompleted] = useState(false);

    useEffect(() => {
        const filteredLayers = layers.filter(layer =>
            layer.id !== selectedLayer?.id &&
            layer.numericColumns &&
            layer.numericColumns.length > 0
        );
        setAvailableLayers(filteredLayers);

        if (selectedLayer) {
            setSelectedSourceLayer(selectedLayer.linkedLayer || '');
            setSelectedLinkColumn(selectedLayer.linkedColumn || '');
            setSelectedValueColumn(selectedLayer.gradientColumn || '');
            setSelectedSourceColumn('');
            setIsAutoDetectionCompleted(false);
            setAutoDetectionStatus('');
        }
    }, [layers, selectedLayer]);

    const autoDetectSourceLayer = async (targetLayer: TableLayer) => {
        setIsAutoDetecting(true);
        setAutoDetectionStatus('Searching for layers with commune data...');

        try {
            const response = await fetch(
                `http://localhost:5000/api/layers/auto-link?layer_id=${targetLayer.id}`
            );

            if (response.ok) {
                const data = await response.json();

                if (data.best_suggestion) {
                    const suggestion = data.best_suggestion;
                    setSelectedSourceLayer(suggestion.source_layer);
                    setAutoDetectionStatus(`Auto-detected: ${suggestion.source_layer}`);
                    setIsAutoDetectionCompleted(true);

                    await fetchCommonColumnsWithAutoDetection(
                        suggestion.source_layer,
                        suggestion.target_column,
                        suggestion.source_column
                    );

                    if (suggestion.target_column) {
                        setSelectedLinkColumn(suggestion.target_column);
                    }
                    if (suggestion.source_column) {
                        setSelectedSourceColumn(suggestion.source_column);
                    }
                    if (suggestion.numeric_columns && suggestion.numeric_columns.length > 0) {
                        setValueColumns(suggestion.numeric_columns);
                        setSelectedValueColumn(suggestion.numeric_columns[0]);
                    }
                } else {
                    setAutoDetectionStatus('No suitable source layer found automatically');
                    setIsAutoDetectionCompleted(false);
                }
            } else {
                const errorText = await response.text();
                setAutoDetectionStatus(`Auto-detection failed: ${errorText}`);
                setIsAutoDetectionCompleted(false);
            }
        } catch (error) {
            console.error('Auto-detection error:', error);
            setAutoDetectionStatus('Auto-detection failed');
            setIsAutoDetectionCompleted(false);
        } finally {
            setIsAutoDetecting(false);
        }
    };

    const fetchCommonColumnsWithAutoDetection = async (
        sourceLayerId: string,
        suggestedTargetCol?: string,
        suggestedSourceCol?: string
    ) => {
        if (!selectedLayer) return;
        setLoading(true);
        try {
            let url = `http://localhost:5000/api/layers/${selectedLayer.id}/linked-data?source_layer=${sourceLayerId}`;
            if (suggestedTargetCol) url += `&link_column=${suggestedTargetCol}`;
            const response = await fetch(url);

            if (response.ok) {
                const data = await response.json();
                if (data.link_column && !selectedLinkColumn) setSelectedLinkColumn(data.link_column);
                if (data.source_column && !selectedSourceColumn) setSelectedSourceColumn(data.source_column);
                setCommonColumns(data.common_columns || []);

                const sourceLayer = layers.find(l => l.id === sourceLayerId);
                if (sourceLayer?.numericColumns) {
                    setValueColumns(sourceLayer.numericColumns);
                } else {
                    const columnsResponse = await fetch(`http://localhost:5000/api/layers/${sourceLayerId}/columns`);
                    if (columnsResponse.ok) {
                        const columnsData = await columnsResponse.json();
                        setValueColumns(columnsData.numeric_columns || []);
                        if (columnsData.numeric_columns?.length > 0) {
                            setSelectedValueColumn(columnsData.numeric_columns[0]);
                        }
                    }
                }
            } else {
                const errorText = await response.text();
                setAutoDetectionStatus(`Error fetching columns: ${errorText}`);
            }
        } catch (error) {
            console.error('Error fetching common columns:', error);
            setAutoDetectionStatus(`Error: ${(error as Error).message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    const fetchCommonColumns = async (sourceLayerId: string) => {
        if (!selectedLayer) return;
        setLoading(true);
        try {
            const response = await fetch(
                `http://localhost:5000/api/layers/${selectedLayer.id}/linked-data?source_layer=${sourceLayerId}`
            );
            if (response.ok) {
                const data = await response.json();
                if (data.link_column) setSelectedLinkColumn(data.link_column);
                if (data.source_column) setSelectedSourceColumn(data.source_column);
                setCommonColumns(data.common_columns || []);

                const sourceLayer = layers.find(l => l.id === sourceLayerId);
                if (sourceLayer?.numericColumns) {
                    setValueColumns(sourceLayer.numericColumns);
                } else {
                    const columnsResponse = await fetch(`http://localhost:5000/api/layers/${sourceLayerId}/columns`);
                    if (columnsResponse.ok) {
                        const columnsData = await columnsResponse.json();
                        setValueColumns(columnsData.numeric_columns || []);
                    }
                }
            } else {
                const errorText = await response.text();
                console.error('Server error:', errorText);
                alert(`Server error: ${errorText}`);
            }
        } catch (error) {
            console.error('Error fetching common columns:', error);
            alert('Error fetching columns. Check console for details.');
        } finally {
            setLoading(false);
        }
    };

    const handleSourceLayerChange = (layerId: string) => {
        setSelectedSourceLayer(layerId);
        setSelectedLinkColumn('');
        setSelectedSourceColumn('');
        setSelectedValueColumn('');
        setCommonColumns([]);
        setValueColumns([]);
        setIsAutoDetectionCompleted(false);
        setAutoDetectionStatus('');
        fetchCommonColumns(layerId);
    };

    const linkCommuneWithDataTerritoire = async () => {
        if (!selectedLayer || !selectedLinkColumn || !selectedValueColumn) {
            alert('Please select link and value columns');
            return;
        }
        setLoading(true);
        try {
            const response = await fetch(
                `http://localhost:5000/api/layers/${selectedLayer.id}/linked-data?` +
                `source_layer=data_territoire&` +
                `link_column=${selectedLinkColumn}&` +
                `value_column=${selectedValueColumn}`
            );

            if (response.ok) {
                const data = await response.json();
                if (!data.linked_data || data.linked_data.length === 0) {
                    alert('No matching data found. Check your column selections.');
                    return;
                }

                const statsResponse = await fetch(
                    `http://localhost:5000/api/layers/data_territoire/statistics?column=${selectedValueColumn}`
                );
                let stats = null;
                if (statsResponse.ok) {
                    const statsData = await statsResponse.json();
                    stats = statsData[0] || null;
                }

                const features = data.linked_data.map((item: any) => {
                    try {
                        if (!item.geom_geojson) return null;
                        const geometry = typeof item.geom_geojson === 'string'
                            ? JSON.parse(item.geom_geojson)
                            : item.geom_geojson;
                        return {
                            type: 'Feature',
                            geometry: geometry,
                            properties: {
                                id: item.id || item.gid || Math.random().toString(36).substr(2, 9),
                                name: item.name || item.nom || item.commune_fr || item.commune || 'Unnamed',
                                linked_value: item.linked_value || 0,
                                source_value: item.source_value || item.linked_value || 0,
                                link_column: data.link_column,
                                value_column: data.value_column,
                                commune: item.commune,
                                [selectedValueColumn]: item.linked_value,
                                ...item
                            }
                        };
                    } catch (e) {
                        console.error('Error parsing geometry:', e);
                        return null;
                    }
                }).filter((feature: any) => feature !== null);

                const linkedValues = features.map((f: any) => f.properties.linked_value).filter(v => !isNaN(v));
                const minValue = linkedValues.length > 0 ? Math.min(...linkedValues) : 0;
                const maxValue = linkedValues.length > 0 ? Math.max(...linkedValues) : 0;

                const geojsonData = { type: 'FeatureCollection', features };

                onUpdateLayer(selectedLayer.id, {
                    data: geojsonData,
                    linkedLayer: 'data_territoire',
                    linkedColumn: selectedLinkColumn,
                    gradientColumn: selectedValueColumn,
                    colorGradient: {
                        column: 'linked_value',
                        minValue,
                        maxValue,
                        colorRange
                    }
                });

                onLinkLayers('data_territoire', selectedLayer.id, selectedLinkColumn, selectedValueColumn);
                setPreviewData(data.linked_data);
                setStatistics(stats);
                setShowPreview(true);
            } else {
                const errorText = await response.text();
                throw new Error(`Server returned ${response.status}: ${errorText}`);
            }
        } catch (error) {
            console.error('Error linking layers:', error);
            alert(`Error linking layers: ${(error as Error).message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleLinkLayers = async () => {
        if (!selectedLayer || !selectedSourceLayer) {
            alert('Please select a source layer');
            return;
        }
        if (selectedLayer.id === 'communes' && selectedSourceLayer === 'data_territoire') {
            await linkCommuneWithDataTerritoire();
            return;
        }

        let finalLinkColumn = selectedLinkColumn;
        let finalSourceColumn = selectedSourceColumn;

        if (!finalLinkColumn && commonColumns.length > 0) {
            const communeCol = commonColumns.find(col =>
                col.toLowerCase().includes('commune') ||
                col.toLowerCase().includes('nom') ||
                col.toLowerCase().includes('name')
            );
            finalLinkColumn = communeCol || commonColumns[0];
            setSelectedLinkColumn(finalLinkColumn);
        }
        if (!finalSourceColumn) {
            finalSourceColumn = finalLinkColumn;
            setSelectedSourceColumn(finalSourceColumn);
        }
        let finalValueColumn = selectedValueColumn;
        if (!finalValueColumn) {
            alert('Please select a value column for gradient from the dropdown');
            return;
        }
        if (!finalLinkColumn) {
            alert('Please select a link column');
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(
                `http://localhost:5000/api/layers/${selectedLayer.id}/linked-data?` +
                `source_layer=${selectedSourceLayer}&` +
                `link_column=${finalLinkColumn}&` +
                `value_column=${finalValueColumn}`
            );

            if (response.ok) {
                const data = await response.json();
                if (!data.linked_data || data.linked_data.length === 0) {
                    alert('No matching data found. Check your column selections.');
                    return;
                }

                const statsResponse = await fetch(
                    `http://localhost:5000/api/layers/${selectedSourceLayer}/statistics?column=${finalValueColumn}`
                );
                let stats = null;
                if (statsResponse.ok) {
                    const statsData = await statsResponse.json();
                    stats = statsData[0] || null;
                }

                const features = data.linked_data.map((item: any) => {
                    try {
                        if (!item.geom_geojson) return null;
                        const geometry = typeof item.geom_geojson === 'string'
                            ? JSON.parse(item.geom_geojson)
                            : item.geom_geojson;
                        return {
                            type: 'Feature',
                            geometry: geometry,
                            properties: {
                                id: item.id || item.gid || Math.random().toString(36).substr(2, 9),
                                name: item.name || item.nom || item.commune_fr || item.commune || 'Unnamed',
                                linked_value: item.linked_value || 0,
                                source_value: item.source_value || item.linked_value || 0,
                                link_column: data.link_column,
                                value_column: data.value_column,
                                commune: item.commune,
                                ...item
                            }
                        };
                    } catch (e) {
                        console.error('Error parsing geometry:', e);
                        return null;
                    }
                }).filter((feature: any) => feature !== null);

                const linkedValues = features.map((f: any) => f.properties.linked_value).filter(v => !isNaN(v));
                const minValue = linkedValues.length > 0 ? Math.min(...linkedValues) : 0;
                const maxValue = linkedValues.length > 0 ? Math.max(...linkedValues) : 0;

                const geojsonData = { type: 'FeatureCollection', features };

                onUpdateLayer(selectedLayer.id, {
                    data: geojsonData,
                    linkedLayer: selectedSourceLayer,
                    linkedColumn: finalLinkColumn,
                    gradientColumn: finalValueColumn,
                    colorGradient: {
                        column: 'linked_value',
                        minValue,
                        maxValue,
                        colorRange
                    }
                });

                onLinkLayers(selectedSourceLayer, selectedLayer.id, finalLinkColumn, finalValueColumn);
                setPreviewData(data.linked_data);
                setStatistics(stats);
                setShowPreview(true);
            } else {
                const errorText = await response.text();
                throw new Error(`Server returned ${response.status}: ${errorText}`);
            }
        } catch (error) {
            console.error('Error linking layers:', error);
            alert(`Error linking layers: ${(error as Error).message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        if (!selectedLayer) return;
        onResetLink(selectedLayer.id);
        setSelectedSourceLayer('');
        setSelectedLinkColumn('');
        setSelectedSourceColumn('');
        setSelectedValueColumn('');
        setCommonColumns([]);
        setValueColumns([]);
        setPreviewData([]);
        setStatistics(null);
        setShowPreview(false);
        setAutoDetectionStatus('');
        setIsAutoDetectionCompleted(false);
    };

    const fetchPreviewData = async () => {
        if (!selectedLayer || !selectedSourceLayer || !selectedLinkColumn || !selectedValueColumn) return;
        setLoading(true);
        try {
            const response = await fetch(
                `http://localhost:5000/api/layers/${selectedLayer.id}/linked-data?` +
                `source_layer=${selectedSourceLayer}&` +
                `link_column=${selectedLinkColumn}&` +
                `value_column=${selectedValueColumn}`
            );
            if (response.ok) {
                const data = await response.json();
                setPreviewData(data.linked_data || []);
                const statsResponse = await fetch(
                    `http://localhost:5000/api/layers/${selectedSourceLayer}/statistics?column=${selectedValueColumn}`
                );
                if (statsResponse.ok) {
                    const stats = await statsResponse.json();
                    setStatistics(stats[0] || null);
                }
            }
        } catch (error) {
            console.error('Error fetching preview data:', error);
        } finally {
            setLoading(false);
        }
    };

    const togglePreview = () => {
        if (!showPreview && selectedLinkColumn && selectedValueColumn) {
            fetchPreviewData();
        }
        setShowPreview(!showPreview);
    };

    const getColorRangeOptions = [
        { label: 'Amber', value: ['#fef3c7', '#d97706'] as [string, string] },
        { label: 'Warm', value: ['#fff7ed', '#ea580c'] as [string, string] },
        { label: 'Earth', value: ['#fafaf9', '#a16207'] as [string, string] },
        { label: 'Sand', value: ['#fefce8', '#ca8a04'] as [string, string] },
        { label: 'Terracotta', value: ['#fff2e8', '#c2410c'] as [string, string] },
    ];

    if (!selectedLayer) {
        return (
            <div className="w-80">
                <div className="rounded-xl p-4 bg-white shadow-lg border border-gray-200">
                    <div className="text-center text-gray-400">
                        <Link className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">Select a layer to link with others</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-80">
            <div className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
                <div className="p-4 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold flex items-center text-gray-700">
                            <Link className="w-4 h-4 mr-2 text-amber-600" />
                            Layer Linking
                        </h3>
                        <div className="flex space-x-2">
                            <button
                                onClick={togglePreview}
                                className="p-1 rounded hover:bg-gray-100"
                                title="Preview data"
                                disabled={!selectedLinkColumn || !selectedValueColumn}
                            >
                                <Table className="w-4 h-4 text-gray-400" />
                            </button>
                            <button
                                onClick={handleReset}
                                className="p-1 rounded hover:bg-gray-100 text-red-400"
                                title="Reset link"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                        Link <span className="font-medium text-gray-600">{selectedLayer.name}</span> with data from another layer
                    </div>

                    {selectedLayer.linkedLayer && (
                        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <div className="text-xs font-medium text-amber-700 mb-1 flex items-center">
                                <Info className="w-3 h-3 mr-1" />
                                Currently Linked
                            </div>
                            <div className="text-xs text-amber-600 space-y-1">
                                <div className="flex items-center">
                                    <Pin className="w-3 h-3 mr-1 text-amber-500" />
                                    <span className="font-medium">{selectedLayer.name}</span>
                                    <span className="mx-2">→</span>
                                    <span>{selectedLayer.linkedLayer}</span>
                                </div>
                                {selectedLayer.linkedColumn && (
                                    <div className="flex items-center">
                                        <ChevronRight className="w-3 h-3 mr-1" />
                                        <span>Using: </span>
                                        <span className="font-medium ml-1">{selectedLayer.linkedColumn}</span>
                                        {selectedLayer.gradientColumn && (
                                            <>
                                                <span className="mx-2">•</span>
                                                <span>Value: </span>
                                                <span className="font-medium ml-1">{selectedLayer.gradientColumn}</span>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 space-y-3">
                    {selectedLayer.id === 'data_territoire' && (
                        <div className={`p-3 rounded-lg border ${isAutoDetecting ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <Search className="w-4 h-4 mr-2 text-blue-500" />
                                    <span className="text-xs font-medium text-blue-600">Auto-detection</span>
                                </div>
                                {isAutoDetecting && (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                                )}
                            </div>
                            {autoDetectionStatus && (
                                <div className="text-xs text-blue-500 mt-2">{autoDetectionStatus}</div>
                            )}
                            {!selectedSourceLayer && !isAutoDetecting && (
                                <button
                                    onClick={() => autoDetectSourceLayer(selectedLayer)}
                                    className="mt-2 text-xs bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 flex items-center"
                                    disabled={loading}
                                >
                                    <Zap className="w-3 h-3 mr-1" />
                                    Auto-detect source layer
                                </button>
                            )}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium mb-1 text-gray-600">
                            Source Layer (with data)
                            {selectedSourceLayer && (
                                <span className="ml-2 text-green-600 text-xs font-normal">✓ Selected</span>
                            )}
                        </label>
                        <select
                            className="w-full text-sm p-2 rounded-lg border border-gray-200 bg-white focus:border-amber-400 outline-none"
                            value={selectedSourceLayer}
                            onChange={(e) => handleSourceLayerChange(e.target.value)}
                            disabled={loading}
                        >
                            <option value="">Select layer with data...</option>
                            {availableLayers.map(layer => (
                                <option key={layer.id} value={layer.id}>
                                    {layer.name} ({layer.numericColumns?.length || 0} numeric columns)
                                </option>
                            ))}
                        </select>
                    </div>

                    {commonColumns.length > 0 && (
                        <div>
                            <label className="block text-xs font-medium mb-1 flex items-center text-gray-600">
                                <Pin className="w-3 h-3 mr-1 text-amber-500" />
                                Link Column (common name)
                                {selectedLinkColumn && (
                                    <span className="ml-2 text-green-600 text-xs font-normal">✓ {selectedLinkColumn}</span>
                                )}
                            </label>
                            <select
                                className="w-full text-sm p-2 rounded-lg border border-gray-200 bg-white focus:border-amber-400 outline-none"
                                value={selectedLinkColumn}
                                onChange={(e) => setSelectedLinkColumn(e.target.value)}
                            >
                                <option value="">Select common column...</option>
                                {commonColumns.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                            <div className="text-xs text-gray-400 mt-1">
                                Used to match features between layers (e.g., commune_fr, nom)
                            </div>
                        </div>
                    )}

                    {valueColumns.length > 0 && (
                        <div>
                            <label className="block text-xs font-medium mb-1 text-gray-600">
                                Value Column (for gradient)
                                {selectedValueColumn && (
                                    <span className="ml-2 text-green-600 text-xs font-normal">✓ {selectedValueColumn}</span>
                                )}
                            </label>
                            <select
                                className="w-full text-sm p-2 rounded-lg border border-gray-200 bg-white focus:border-amber-400 outline-none"
                                value={selectedValueColumn}
                                onChange={(e) => setSelectedValueColumn(e.target.value)}
                                disabled={valueColumns.length === 0}
                            >
                                <option value="">Select numeric column...</option>
                                {valueColumns.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                            {valueColumns.length === 0 && (
                                <div className="text-xs text-red-400 mt-1">
                                    No numeric columns found in the source layer
                                </div>
                            )}
                        </div>
                    )}

                    {selectedValueColumn && (
                        <div>
                            <label className="block text-xs font-medium mb-1 text-gray-600">Color Gradient</label>
                            <div className="flex items-center space-x-2">
                                <div className="flex-1">
                                    <select
                                        className="w-full text-sm p-2 rounded-lg border border-gray-200 bg-white focus:border-amber-400 outline-none"
                                        value={colorRange.join(',')}
                                        onChange={(e) => setColorRange(e.target.value.split(',') as [string, string])}
                                    >
                                        {getColorRangeOptions.map(option => (
                                            <option key={option.label} value={option.value.join(',')}>
                                                {option.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    onClick={() => setShowColorPicker(!showColorPicker)}
                                    className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
                                    title="Preview gradient"
                                >
                                    <div className="w-6 h-6 rounded" style={{
                                        background: `linear-gradient(45deg, ${colorRange[0]}, ${colorRange[1]})`
                                    }}></div>
                                </button>
                            </div>
                        </div>
                    )}

                    {selectedLayer.id === 'communes' && selectedSourceLayer === 'data_territoire' && (
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <div className="text-xs font-medium text-amber-700 mb-2">
                                Linking communes with data_territoire
                            </div>
                            <ul className="text-xs text-amber-600 space-y-1">
                                <li className="flex items-start">
                                    <span className="mr-2">1.</span>
                                    <span>Select <code>commune_fr</code> as the link column</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="mr-2">2.</span>
                                    <span>Choose a numeric column from data_territoire for the gradient</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="mr-2">3.</span>
                                    <span>Click "Apply Link" to visualize statistical data on communes</span>
                                </li>
                            </ul>
                        </div>
                    )}

                    <div className="flex space-x-2 pt-2">
                        <button
                            onClick={handleLinkLayers}
                            disabled={!selectedSourceLayer || !selectedLinkColumn || !selectedValueColumn}
                            className="flex-1 bg-amber-500 text-white text-sm py-2 rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                        >
                            {loading ? (
                                <div className="flex items-center">
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                    {isAutoDetectionCompleted ? 'Applying Auto-Detected Link...' : 'Linking...'}
                                </div>
                            ) : (
                                <>
                                    <Link className="w-4 h-4 mr-2" />
                                    {isAutoDetectionCompleted ? 'Apply Auto-Detected Link' : 'Apply Link'}
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleReset}
                            className="px-4 bg-gray-100 text-gray-500 text-sm py-2 rounded-lg hover:bg-gray-200 flex items-center justify-center transition-colors"
                            disabled={loading}
                        >
                            <RefreshCw className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Data Preview Modal */}
            {showPreview && (
                <div className="absolute top-0 left-full ml-4 w-96 z-50">
                    <div className="rounded-xl overflow-hidden bg-white shadow-lg border border-gray-200">
                        <div className="p-4 border-b border-gray-100">
                            <div className="flex items-center justify-between">
                                <h4 className="text-sm font-semibold flex items-center text-gray-700">
                                    <BarChart3 className="w-4 h-4 mr-2 text-amber-600" />
                                    Data Preview
                                </h4>
                                <div className="flex items-center space-x-2">
                                    <div className="flex rounded-lg overflow-hidden border border-gray-200">
                                        <button
                                            onClick={() => setViewMode('table')}
                                            className={`px-3 py-1 text-xs ${viewMode === 'table' ? 'bg-amber-500 text-white' : 'bg-gray-50 text-gray-500'}`}
                                        >
                                            Table
                                        </button>
                                        <button
                                            onClick={() => setViewMode('chart')}
                                            className={`px-3 py-1 text-xs ${viewMode === 'chart' ? 'bg-amber-500 text-white' : 'bg-gray-50 text-gray-500'}`}
                                        >
                                            Chart
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => setShowPreview(false)}
                                        className="p-1 rounded hover:bg-gray-100"
                                    >
                                        <X className="w-4 h-4 text-gray-400" />
                                    </button>
                                </div>
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                                {previewData.length} records linked from {selectedSourceLayer}
                            </div>
                        </div>

                        <div className="p-4 max-h-96 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
                            {loading ? (
                                <div className="text-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
                                    <div className="mt-2 text-sm text-gray-400">Loading preview data...</div>
                                </div>
                            ) : previewData.length > 0 ? (
                                <>
                                    {statistics && (
                                        <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                            <div className="text-xs font-medium mb-2 flex items-center text-gray-700">
                                                <TrendingUp className="w-3 h-3 mr-1" />
                                                Statistics for {selectedValueColumn}
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div className="text-gray-400">Count:</div>
                                                <div className="font-medium text-gray-700">{statistics.count}</div>
                                                <div className="text-gray-400">Average:</div>
                                                <div className="font-medium text-gray-700">{parseFloat(statistics.avg as any).toFixed(2)}</div>
                                                <div className="text-gray-400">Minimum:</div>
                                                <div className="font-medium text-gray-700">{parseFloat(statistics.min as any).toFixed(2)}</div>
                                                <div className="text-gray-400">Maximum:</div>
                                                <div className="font-medium text-gray-700">{parseFloat(statistics.max as any).toFixed(2)}</div>
                                                <div className="text-gray-400">Median:</div>
                                                <div className="font-medium text-gray-700">{parseFloat(statistics.median as any).toFixed(2)}</div>
                                                <div className="text-gray-400">Std Dev:</div>
                                                <div className="font-medium text-gray-700">{parseFloat(statistics.stddev as any).toFixed(2)}</div>
                                            </div>
                                        </div>
                                    )}

                                    {viewMode === 'chart' && previewData.length > 0 && (
                                        <div className="mb-4">
                                            <div className="text-xs font-medium mb-2 text-gray-700">Value Distribution</div>
                                            <div className="space-y-2">
                                                {previewData.slice(0, 10).map((item, index) => {
                                                    const value = parseFloat(item.linked_value);
                                                    const maxVal = Math.max(...previewData.map((d: any) => parseFloat(d.linked_value)));
                                                    const percentage = (value / maxVal) * 100;
                                                    return (
                                                        <div key={index} className="flex items-center">
                                                            <div className="text-xs w-24 truncate mr-2 text-gray-600">{item.commune}</div>
                                                            <div className="flex-1">
                                                                <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div
                                                                        className="h-full rounded-full"
                                                                        style={{
                                                                            width: `${percentage}%`,
                                                                            background: `linear-gradient(90deg, ${colorRange[0]}, ${colorRange[1]})`
                                                                        }}
                                                                    ></div>
                                                                </div>
                                                            </div>
                                                            <div className="text-xs font-medium ml-2 w-16 text-right text-gray-700">
                                                                {value.toFixed(2)}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {viewMode === 'table' && (
                                        <div className="text-xs">
                                            <div className="font-medium mb-2 text-gray-700">Sample Linked Data</div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th className="p-2 text-left text-gray-500">Commune</th>
                                                            <th className="p-2 text-left text-gray-500">{selectedValueColumn}</th>
                                                            <th className="p-2 text-left text-gray-500">Color</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {previewData.slice(0, 15).map((item, index) => {
                                                            const value = parseFloat(item.linked_value);
                                                            const minVal = Math.min(...previewData.map((d: any) => parseFloat(d.linked_value)));
                                                            const maxVal = Math.max(...previewData.map((d: any) => parseFloat(d.linked_value)));
                                                            const normalized = (value - minVal) / (maxVal - minVal);
                                                            const r1 = parseInt(colorRange[0].slice(1, 3), 16);
                                                            const g1 = parseInt(colorRange[0].slice(3, 5), 16);
                                                            const b1 = parseInt(colorRange[0].slice(5, 7), 16);
                                                            const r2 = parseInt(colorRange[1].slice(1, 3), 16);
                                                            const g2 = parseInt(colorRange[1].slice(3, 5), 16);
                                                            const b2 = parseInt(colorRange[1].slice(5, 7), 16);
                                                            const r = Math.round(r1 + (r2 - r1) * normalized);
                                                            const g = Math.round(g1 + (g2 - g1) * normalized);
                                                            const b = Math.round(b1 + (b2 - b1) * normalized);
                                                            const color = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
                                                            return (
                                                                <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                                                                    <td className="p-2 text-gray-600">{item.commune}</td>
                                                                    <td className="p-2 font-medium text-gray-700">{value.toFixed(2)}</td>
                                                                    <td className="p-2">
                                                                        <div className="w-6 h-6 rounded border border-gray-200" style={{ backgroundColor: color }} title={`Value: ${value.toFixed(2)}`}></div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {previewData.length > 15 && (
                                                <div className="text-xs text-gray-400 mt-2 text-center">
                                                    Showing 15 of {previewData.length} records
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-8 text-gray-400">
                                    <Info className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                                    <div>No linked data found.</div>
                                    <div className="text-sm mt-1">Check your column selections.</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}