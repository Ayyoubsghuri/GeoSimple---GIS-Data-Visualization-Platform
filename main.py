from flask import Flask, jsonify, request, send_from_directory # 
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor
import os
from datetime import datetime
import json

app = Flask(__name__, static_folder='dist', static_url_path='')
CORS(app)  # Enable CORS for all routes

# Database configuration - update with your actual credentials
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'database': os.getenv('DB_NAME', 'YourDatabaseName'),
    'user': os.getenv('DB_USER', 'yourusername'),
    'password': os.getenv('DB_PASSWORD', 'yourpassword'),
    'port': os.getenv('DB_PORT', 5433)
}


@app.route('/')
def serve_index():
    """Serve the index.html from the dist folder"""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def serve_static_files(path):
    """Serve static assets or handle client-side routing"""
    # Check if the requested path exists as a file in the dist folder
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    # Otherwise, return index.html to allow React/Vue/Angular to handle the route
    return send_from_directory(app.static_folder, 'index.html')


def get_db_connection():
    """Create and return a database connection"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        print(f"Database connection error: {e}")
        return None

def get_database_tables():
    """Get list of all tables that can be used as layers"""
    try:
        conn = get_db_connection()
        if not conn:
            return []
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get all tables from public schema
        query = """
        SELECT 
            table_name,
            table_type
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
        """
        
        cursor.execute(query)
        tables = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return tables
    except Exception as e:
        print(f"Error fetching database tables: {e}")
        return []

def get_table_row_count(table_name):
    """Get the number of rows in a table"""
    try:
        conn = get_db_connection()
        if not conn:
            return 0
        
        cursor = conn.cursor()
        query = f"SELECT COUNT(*) FROM {table_name}"
        cursor.execute(query)
        count = cursor.fetchone()[0]
        
        cursor.close()
        conn.close()
        
        return count
    except Exception as e:
        print(f"Error counting rows in {table_name}: {e}")
        return 0

def detect_table_type(table_name):
    """Detect if table contains points, polygons, routes, or packages"""
    try:
        conn = get_db_connection()
        if not conn:
            return 'unknown'
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get column information including UDT names
        query = """
        SELECT column_name, data_type, udt_name 
        FROM information_schema.columns 
        WHERE table_name = %s AND table_schema = 'public'
        """
        
        cursor.execute(query, (table_name,))
        columns = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        column_names = [col['column_name'].lower() for col in columns]

        # Special case for caidats table - it has polygon borders
        if table_name.lower() == 'caidats':
            return 'polygons'
        
        # Check for geometry columns (PostGIS)
        has_geometry = any(name in ['geom', 'geometry', 'the_geom', 'shape', 'wkb_geometry'] 
                          for name in column_names)
        
        if has_geometry:
            return 'polygons'  # Default to polygons for geometry columns
        
        # Fallback detection for non-geometry tables
        if any(name in ['x', 'y'] for name in column_names):
            if 'x' in column_names and 'y' in column_names:
                return 'points'
        
        if any(name in ['latitude', 'lat', 'longitude', 'lng', 'lon', 'latitude_dd', 'longitude_dd'] for name in column_names):
            if any(name in ['from', 'to', 'source', 'destination'] for name in column_names):
                return 'routes'
            else:
                return 'points'
        elif any(name in ['status', 'package', 'delivery'] for name in column_names):
            return 'packages'
        else:
            return 'points'
        
    except Exception as e:
        print(f"Error detecting table type for {table_name}: {e}")
        return 'points'

def get_default_color(layer_type):
    """Get default color for layer type"""
    color_map = {
        'points': '#3b82f6',    # blue
        'polygons': '#10b981',  # green
        'routes': '#8b5cf6',    # purple
        'packages': '#ef4444',  # red
        'unknown': '#6b7280'    # gray
    }
    return color_map.get(layer_type, '#6b7280')

def get_default_icon(layer_type):
    """Get default icon for layer type"""
    icon_map = {
        'points': '📍',
        'polygons': '🔷',
        'routes': '🛣️',
        'packages': '📦',
        'unknown': '❓'
    }
    return icon_map.get(layer_type, '❓')

@app.route('/api/package-layers', methods=['GET'])
def get_package_layers():
    """Get all available package layers from database tables"""
    try:
        # Auto-discover all tables and create layers
        tables = get_database_tables()
        layers = []
        
        for table in tables:
            table_name = table['table_name']
            # Skip system tables
            if table_name.startswith('_') or table_name in ['spatial_ref_sys']:
                continue
            
            # Get count and skip tables with zero rows
            count = get_table_row_count(table_name)
            if count == 0:
                continue
                
            table_type = detect_table_type(table_name)
            
            # All layers start as inactive (including caidats)
            is_active = False
            
            layers.append({
                'id': table_name,
                'name': table_name,  # Show actual table_name
                'description': f'Data from {table_name} table',
                'table_name': table_name,
                'type': table_type,
                'active': is_active,  # All layers start inactive
                'count': count,
                'color': get_default_color(table_type),
                'icon': get_default_icon(table_type)
            })
        
        # Sort layers: commune first, then caidat, then others
        layers.sort(key=lambda x: (
            0 if 'commune' in x['id'].lower() else 
            1 if x['id'].lower() == 'caidats' else 2,
            x['id'].lower()
        ))
        
        return jsonify(layers)
        
    except Exception as e:
        print(f"Error fetching package layers: {e}")
        return jsonify({'error': 'Internal server error'}), 500
    
@app.route('/api/package-layers/<layer_id>/data', methods=['GET'])
def get_layer_data(layer_id):
    """Get data for a specific layer. Handles both spatial and non-spatial (statistical) tables."""
    try:
        print(f"🔍 Fetching data for layer: {layer_id}")
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        table_name = layer_id
        
        # 1. Get column metadata with data types
        cursor.execute("""
            SELECT column_name, data_type, udt_name 
            FROM information_schema.columns 
            WHERE table_name = %s AND table_schema = 'public'
            ORDER BY ordinal_position
        """, (table_name,))
        
        columns_info = cursor.fetchall()
        if not columns_info:
            return jsonify({'error': f'Table {table_name} not found'}), 404
            
        column_names = [col['column_name'] for col in columns_info]
        column_types = {col['column_name']: col['data_type'] for col in columns_info}
        print(f"📊 Table {table_name} columns: {column_names}")
        
        # 2. Identify Column Roles
        id_col = next((c for c in column_names if c.lower() in ['id', 'gid', 'ogc_fid', 'fid']), None)
        geom_col = next((c for c in column_names if c.lower() in ['geom', 'geometry', 'the_geom', 'shape']), None)
        lat_col = next((c for c in column_names if 'lat' in c.lower()), None)
        lon_col = next((c for c in column_names if 'lon' in c.lower() or 'lng' in c.lower()), None)
        
        # 3. Build Dynamic Query - Handle different data types properly
        select_fields = []
        
        # Add Geometry if exists
        if geom_col:
            select_fields.append(f'ST_AsGeoJSON("{geom_col}") as geom_geojson')
            select_fields.append(f'ST_GeometryType("{geom_col}") as geom_type')
        elif lat_col and lon_col:
            select_fields.append(f'"{lat_col}" as latitude')
            select_fields.append(f'"{lon_col}" as longitude')
            
        # Add ID or fallback
        if id_col:
            select_fields.append(f'"{id_col}"')
        
        # Add ALL other columns - convert NaN to NULL based on data type
        for col in column_names:
            if col not in [geom_col, id_col]:
                col_type = column_types.get(col, '').lower()
                
                # Handle different data types
                if 'character' in col_type or 'text' in col_type or 'varchar' in col_type:
                    # For text columns, just return the value as-is
                    select_fields.append(f'"{col}"')
                elif col_type in ['integer', 'bigint', 'smallint', 'decimal', 'numeric', 'real', 'double precision', 'float']:
                    # For numeric columns, handle NaN and Infinity
                    select_fields.append(f"""
                        CASE 
                            WHEN "{col}" IS NULL THEN NULL
                            WHEN "{col}"::text = 'NaN' THEN NULL
                            WHEN "{col}"::text = 'Infinity' THEN NULL
                            WHEN "{col}"::text = '-Infinity' THEN NULL
                            ELSE "{col}"
                        END as "{col}"
                    """)
                else:
                    # For other types (date, boolean, etc.), just return as-is
                    select_fields.append(f'"{col}"')
        
        query = f'SELECT {", ".join(select_fields)} FROM "{table_name}"'
        
        # Limit large tables for performance
        if table_name.lower() in ['caidat', 'caidats']:
            query += ' LIMIT 500'
            
        print(f"📋 Executing query: {query}")
        cursor.execute(query)
        rows = cursor.fetchall()
        
        # 4. Format Result
        packages = []
        for index, row in enumerate(rows):
            # Create a base object with all row data
            pkg = dict(row)
            
            # Ensure an ID exists (Frontend requires it)
            if not id_col or not row.get(id_col):
                pkg['id'] = row.get('commune_fr', f"idx_{index}")
            else:
                pkg['id'] = str(row[id_col])

            # Process Geometry for Leaflet
            if 'geom_geojson' in row and row['geom_geojson']:
                try:
                    geojson_obj = json.loads(row['geom_geojson'])
                    pkg['geom_geojson'] = row['geom_geojson'] # Keep as string for GeoJSON component
                    pkg['geometry_type'] = row.get('geom_type', geojson_obj.get('type'))
                    
                    # Extract a center point for markers/popups
                    coords = geojson_obj.get('coordinates', [])
                    if pkg['geometry_type'] in ['Polygon', 'MultiPolygon'] and coords:
                        # Simple extraction of first point for positioning
                        p = coords[0][0][0] if pkg['geometry_type'] == 'MultiPolygon' else coords[0][0]
                        pkg['coordinates'] = [float(p[0]), float(p[1])]
                    elif pkg['geometry_type'] == 'Point' and coords:
                        pkg['coordinates'] = [float(coords[0]), float(coords[1])]
                except:
                    pass
            elif 'latitude' in row and row['latitude']:
                pkg['coordinates'] = [float(row['longitude']), float(row['latitude'])]
                pkg['geometry_type'] = 'Point'

            packages.append(pkg)
            
        cursor.close()
        conn.close()
        
        print(f"✅ Returning {len(packages)} records for {layer_id}")
        return jsonify(packages)
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/layers/<layer_id>/linked-data', methods=['GET'])
def get_linked_layer_data(layer_id):
    """Get data from layer linked with another layer's columns"""
    try:
        source_layer = request.args.get('source_layer')
        
        if not source_layer:
            return jsonify({'error': 'source_layer parameter is required'}), 400
        
        link_column = request.args.get('link_column')
        value_column = request.args.get('value_column')
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # DEBUG: Show what we're working with
        print(f"🔗 Linking: {layer_id} with {source_layer}")
        print(f"🔗 Link column: {link_column}")
        print(f"🔗 Value column: {value_column}")
        
        # Get structure of both tables to find common columns
        cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = %s 
        AND table_schema = 'public'
        ORDER BY ordinal_position
        """, (layer_id,))
        
        target_columns = cursor.fetchall()
        
        cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = %s 
        AND table_schema = 'public'
        ORDER BY ordinal_position
        """, (source_layer,))
        
        source_columns = cursor.fetchall()
        
        # Find common columns
        target_cols = {col['column_name'].lower() for col in target_columns}
        source_cols = {col['column_name'].lower() for col in source_columns}
        common_cols = target_cols.intersection(source_cols)
        
        # If no link_column specified, return common columns for user to choose
        if not link_column:
            return jsonify({
                'common_columns': list(common_cols),
                'target_columns': [col['column_name'] for col in target_columns],
                'source_columns': [col['column_name'] for col in source_columns],
                'note': 'Please select a link column from common columns'
            })
        
        # Find numeric columns in source for value selection
        numeric_columns = []
        for col in source_columns:
            if col['data_type'] in ('integer', 'bigint', 'smallint', 'decimal', 'numeric', 'real', 'double precision', 'float'):
                numeric_columns.append(col['column_name'])
        
        # If no value_column specified, return numeric columns for user to choose
        if not value_column:
            return jsonify({
                'numeric_columns': numeric_columns,
                'common_columns': list(common_cols),
                'note': 'Please select a value column from numeric columns'
            })
        
        # Now perform the actual join
        # First, check if both tables have geometry columns
        target_geom_col = None
        source_geom_col = None
        
        for col in target_columns:
            col_name = col['column_name'].lower()
            if any(geo_word in col_name for geo_word in ['geom', 'geometry', 'shape', 'wkb']):
                target_geom_col = col['column_name']
                break
        
        for col in source_columns:
            col_name = col['column_name'].lower()
            if any(geo_word in col_name for geo_word in ['geom', 'geometry', 'shape', 'wkb']):
                source_geom_col = col['column_name']
                break
        
        # Build the join query
        if target_geom_col:
            # Target has geometry - join and transfer values to target geometry
            query = f"""
            SELECT 
                target."{target_geom_col}" as target_geom,
                target."{link_column}" as link_column_value,
                source."{value_column}" as linked_value,
                target.commune_fr as commune,
                target.commune_fr as name,
                '{source_layer}' as source_layer
            FROM "{layer_id}" as target
            LEFT JOIN "{source_layer}" as source
            ON target."{link_column}" = source."{link_column}"
            WHERE target."{link_column}" IS NOT NULL
            AND source."{value_column}" IS NOT NULL
            LIMIT 200
            """
        else:
            # No geometry in target - just return the joined data
            query = f"""
            SELECT 
                target."{link_column}" as link_column_value,
                source."{value_column}" as linked_value,
                target.commune_fr as commune,
                target.commune_fr as name,
                '{source_layer}' as source_layer
            FROM "{layer_id}" as target
            JOIN "{source_layer}" as source
            ON target."{link_column}" = source."{link_column}"
            WHERE target."{link_column}" IS NOT NULL
            AND source."{value_column}" IS NOT NULL
            LIMIT 200
            """
        
        print(f"📊 Executing join query: {query}")
        cursor.execute(query)
        linked_data = cursor.fetchall()
        
        # Add geometry if available
        formatted_data = []
        for row in linked_data:
            formatted_row = dict(row)
            
            # Convert geometry to GeoJSON if present
            if 'target_geom' in row and row['target_geom']:
                try:
                    # Get geometry as GeoJSON
                    cursor.execute(f"SELECT ST_AsGeoJSON('{row['target_geom']}') as geom")
                    geom_result = cursor.fetchone()
                    if geom_result and geom_result['geom']:
                        formatted_row['geom_geojson'] = geom_result['geom']
                except:
                    pass
            
            formatted_data.append(formatted_row)
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'linked_data': formatted_data,
            'common_columns': list(common_cols),
            'numeric_columns': numeric_columns,
            'link_column': link_column,
            'value_column': value_column,
            'total_linked': len(formatted_data)
        })
        
    except Exception as e:
        print(f"❌ Error getting linked data: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e), 'traceback': traceback.format_exc()}), 500
    
@app.route('/api/debug/link-params', methods=['GET'])
def debug_link_params():
    """Debug endpoint to test link parameters"""
    try:
        layer_id = request.args.get('layer_id')
        source_layer = request.args.get('source_layer')
        
        if not layer_id or not source_layer:
            return jsonify({
                'error': 'Missing parameters',
                'required': ['layer_id', 'source_layer'],
                'optional': ['link_column', 'value_column']
            }), 400
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get target layer columns
        cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = %s AND table_schema = 'public'
        ORDER BY ordinal_position
        """, (layer_id,))
        target_cols = cursor.fetchall()
        
        # Get source layer columns
        cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = %s AND table_schema = 'public'
        ORDER BY ordinal_position
        """, (source_layer,))
        source_cols = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        # Find potential link columns (commune-related)
        target_commune_cols = [c['column_name'] for c in target_cols if 'commune' in c['column_name'].lower()]
        source_commune_cols = [c['column_name'] for c in source_cols if 'commune' in c['column_name'].lower()]
        
        # Find numeric columns in source
        source_numeric_cols = [
            c['column_name'] for c in source_cols 
            if c['data_type'] in ['integer', 'bigint', 'smallint', 'decimal', 'numeric', 'real', 'double precision', 'float']
        ]
        
        return jsonify({
            'target_layer': layer_id,
            'source_layer': source_layer,
            'target_columns': [c['column_name'] for c in target_cols],
            'source_columns': [c['column_name'] for c in source_cols],
            'suggestions': {
                'link_columns': {
                    'target_commune_cols': target_commune_cols,
                    'source_commune_cols': source_commune_cols,
                    'recommended': target_commune_cols[0] if target_commune_cols else None
                },
                'value_columns': {
                    'numeric_cols': source_numeric_cols,
                    'recommended': source_numeric_cols[0] if source_numeric_cols else None
                }
            },
            'test_url': f"/api/layers/{layer_id}/linked-data?source_layer={source_layer}&link_column={target_commune_cols[0] if target_commune_cols else 'column_name'}&value_column={source_numeric_cols[0] if source_numeric_cols else 'numeric_column'}"
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/layers/auto-link', methods=['GET'])
def auto_link_layers():
    """Auto-detect and suggest layer links"""
    try:
        layer_id = request.args.get('layer_id')
        if not layer_id:
            return jsonify({'error': 'layer_id parameter is required'}), 400
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get target layer columns
        cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = %s 
        AND table_schema = 'public'
        ORDER BY ordinal_position
        """, (layer_id,))
        
        target_columns = cursor.fetchall()
        
        # Find potential link columns in target (commune-related)
        target_commune_cols = [
            col['column_name'] for col in target_columns 
            if 'commune' in col['column_name'].lower() or 'nom' in col['column_name'].lower()
        ]
        
        # Get all other layers
        cursor.execute("""
        SELECT table_name
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name != %s
        ORDER BY table_name
        """, (layer_id,))
        
        other_tables = cursor.fetchall()
        
        suggestions = []
        
        for table in other_tables:
            source_layer = table['table_name']
            
            # Get source layer columns
            cursor.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = %s 
            AND table_schema = 'public'
            ORDER BY ordinal_position
            """, (source_layer,))
            
            source_columns = cursor.fetchall()
            
            # Find potential link columns in source
            source_commune_cols = [
                col['column_name'] for col in source_columns 
                if 'commune' in col['column_name'].lower() or 'nom' in col['column_name'].lower()
            ]
            
            # Find numeric columns in source
            numeric_columns = [
                col['column_name'] for col in source_columns
                if col['data_type'] in ('integer', 'bigint', 'smallint', 'decimal', 'numeric', 'real', 'double precision', 'float')
            ]
            
            if source_commune_cols and numeric_columns:
                # Find common commune columns
                common_commune = [col for col in target_commune_cols if col.lower() in [c.lower() for c in source_commune_cols]]
                
                if common_commune:
                    link_column = common_commune[0]
                elif target_commune_cols and source_commune_cols:
                    link_column = target_commune_cols[0]
                else:
                    continue
                
                suggestions.append({
                    'source_layer': source_layer,
                    'target_column': link_column,
                    'source_column': link_column if link_column in [c['column_name'] for c in source_columns] else source_commune_cols[0],
                    'numeric_columns': numeric_columns[:5],  # Limit to 5
                    'confidence': 'high' if common_commune else 'medium',
                    'note': f'Link using {link_column} column'
                })
        
        cursor.close()
        conn.close()
        
        # Return best suggestion
        best_suggestion = None
        if suggestions:
            # Prioritize high confidence suggestions
            high_conf = [s for s in suggestions if s['confidence'] == 'high']
            best_suggestion = high_conf[0] if high_conf else suggestions[0]
        
        return jsonify({
            'target_layer': layer_id,
            'suggestions': suggestions,
            'best_suggestion': best_suggestion,
            'target_commune_columns': target_commune_cols
        })
        
    except Exception as e:
        print(f"Error in auto-link: {e}")
        return jsonify({'error': str(e)}), 500
    
@app.route('/api/layers/<layer_id>/statistics', methods=['GET'])
def get_layer_statistics(layer_id):
    """Get statistics for a layer's columns"""
    try:
        column_name = request.args.get('column')
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        if column_name:
            # Get statistics for specific column
            query = f"""
            SELECT 
                COUNT(*) as count,
                AVG(CAST("{column_name}" AS FLOAT)) as avg,
                MIN(CAST("{column_name}" AS FLOAT)) as min,
                MAX(CAST("{column_name}" AS FLOAT)) as max,
                STDDEV(CAST("{column_name}" AS FLOAT)) as stddev,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CAST("{column_name}" AS FLOAT)) as median
            FROM "{layer_id}"
            WHERE "{column_name}" IS NOT NULL 
            AND "{column_name}" != ''
            AND CAST("{column_name}" AS FLOAT) IS NOT NULL
            """
        else:
            # Get all numeric columns
            query = f"""
            SELECT 
                column_name,
                data_type
            FROM information_schema.columns 
            WHERE table_name = '{layer_id}' 
            AND table_schema = 'public'
            AND data_type IN ('integer', 'bigint', 'smallint', 'decimal', 'numeric', 'real', 'double precision', 'float')
            """
        
        cursor.execute(query)
        result = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error getting statistics: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/layers/data_territoire/self-data', methods=['GET'])
def get_data_territoire_self():
    """Get data from data_territoire itself (no linking needed)"""
    try:
        value_column = request.args.get('value_column', 'population_municipale_ensemble')
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Simple query - data_territoire is already complete
        query = f"""
        SELECT 
            commune_fr,
            {value_column} as linked_value,
            'data_territoire' as source_layer
        FROM data_territoire
        WHERE commune_fr IS NOT NULL
        AND {value_column} IS NOT NULL
        LIMIT 200
        """
        
        print(f"📊 Getting data_territoire self-data: {query}")
        cursor.execute(query)
        data = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'linked_data': data,
            'value_column': value_column,
            'total_records': len(data),
            'note': 'data_territoire is complete - contains all statistical data internally'
        })
        
    except Exception as e:
        print(f"Error getting data_territoire self-data: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/layers/<layer_id>/sample', methods=['GET'])
def get_layer_sample(layer_id):
    """Get sample data from a layer for preview"""
    try:
        limit = request.args.get('limit', 20, type=int)
        
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = f'SELECT * FROM "{layer_id}" LIMIT {limit}'
        cursor.execute(query)
        data = cursor.fetchall()
        
        # Get column info
        cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = %s AND table_schema = 'public'
        ORDER BY ordinal_position
        """, (layer_id,))
        columns = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'columns': columns,
            'data': data,
            'total_samples': len(data)
        })
        
    except Exception as e:
        print(f"Error getting sample data: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/layers/<layer_id>/columns', methods=['GET'])
def get_layer_columns(layer_id):
    """Get all columns from a layer with their types"""
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
        SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default
        FROM information_schema.columns 
        WHERE table_name = %s AND table_schema = 'public'
        ORDER BY ordinal_position
        """
        
        cursor.execute(query, (layer_id,))
        columns = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        # Categorize columns
        numeric_columns = []
        text_columns = []
        geometry_columns = []
        
        for col in columns:
            col_name = col['column_name'].lower()
            col_type = col['data_type'].lower()
            
            # Check for geometry columns
            if any(geo_word in col_name for geo_word in ['geom', 'geometry', 'shape', 'wkb']):
                geometry_columns.append(col['column_name'])
            # Check for numeric columns
            elif col_type in ['integer', 'bigint', 'smallint', 'decimal', 'numeric', 'real', 'double precision', 'float']:
                numeric_columns.append(col['column_name'])
            else:
                text_columns.append(col['column_name'])
        
        return jsonify({
            'all_columns': columns,
            'numeric_columns': numeric_columns,
            'text_columns': text_columns,
            'geometry_columns': geometry_columns
        })
        
    except Exception as e:
        print(f"Error getting layer columns: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/communes', methods=['GET'])
def get_available_communes():
    """Get all unique communes from commune layers"""
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Look specifically for commune tables first
        tables_query = """
        SELECT table_name
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name ILIKE '%commune%'
        ORDER BY table_name
        """
        
        cursor.execute(tables_query)
        commune_tables = cursor.fetchall()
        
        communes = set()
        
        # If no specific commune tables, check all tables
        if not commune_tables:
            tables_query = """
            SELECT table_name
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            AND table_name NOT LIKE '_%'
            ORDER BY table_name
            """
            cursor.execute(tables_query)
            commune_tables = cursor.fetchall()
        
        for table in commune_tables:
            table_name = table['table_name']
            
            # Check if table has a commune_fr column (most likely for communes)
            cursor.execute("""
            SELECT column_name
            FROM information_schema.columns 
            WHERE table_name = %s 
            AND table_schema = 'public'
            AND column_name = 'commune_fr'
            """, (table_name,))
            
            has_commune_fr = cursor.fetchone() is not None
            
            if has_commune_fr:
                # Get unique communes from this table
                query = f"""
                SELECT DISTINCT commune_fr as commune
                FROM "{table_name}"
                WHERE commune_fr IS NOT NULL
                AND commune_fr != ''
                ORDER BY commune_fr
                """
                
                try:
                    cursor.execute(query)
                    table_communes = cursor.fetchall()
                    for row in table_communes:
                        if row['commune']:
                            communes.add(row['commune'].strip())
                except Exception as e:
                    print(f"Warning: Could not fetch communes from {table_name}: {e}")
                    continue
        
        cursor.close()
        conn.close()
        
        return jsonify(sorted(list(communes)))
        
    except Exception as e:
        print(f"Error fetching communes: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/postgis-check', methods=['GET'])
def check_postgis():
    """Check if PostGIS is installed and working"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Check PostGIS version
        cursor.execute("SELECT PostGIS_Version() as version")
        version = cursor.fetchone()
        
        # Check geometry columns in public schema
        cursor.execute("""
        SELECT f_table_name, f_geometry_column, type 
        FROM geometry_columns 
        WHERE f_table_schema = 'public'
        """)
        geometry_tables = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'postgis_available': True,
            'version': version['version'] if version else 'Unknown',
            'geometry_tables': geometry_tables
        })
        
    except Exception as e:
        print(f"PostGIS check error: {e}")
        return jsonify({
            'postgis_available': False,
            'error': str(e)
        }), 500

@app.route('/api/package-layers/<layer_id>/toggle', methods=['POST'])
def toggle_package_layer(layer_id):
    """Toggle a package layer on/off"""
    try:
        # For auto-discovered tables, we return the toggled state
        return jsonify({
            'message': 'Layer toggled', 
            'layer_id': layer_id,
            'active': True
        })
        
    except Exception as e:
        print(f"Error toggling package layer: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/package-layers/toggle-all', methods=['POST'])
def toggle_all_package_layers():
    """Toggle all package layers on/off"""
    try:
        data = request.get_json()
        activate = data.get('activate', True)
        
        # Get all tables and return them with the requested state
        tables = get_database_tables()
        layers = []
        
        for table in tables:
            table_name = table['table_name']
            if table_name.startswith('_') or table_name in ['spatial_ref_sys']:
                continue
                
            table_type = detect_table_type(table_name)
            count = get_table_row_count(table_name)
            
            # Keep caidat active even when toggling all
            is_active = activate or table_name.lower() == 'caidats'
            
            layers.append({
                'id': table_name,
                'name': table_name,  # Show actual table_name
                'description': f'Data from {table_name} table',
                'table_name': table_name,
                'type': table_type,
                'active': is_active,
                'count': count,
                'color': get_default_color(table_type),
                'icon': get_default_icon(table_type)
            })
        
        return jsonify(layers)
        
    except Exception as e:
        print(f"Error toggling all package layers: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/tables', methods=['GET'])
def get_available_tables():
    """Get all available tables in the database"""
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
        SELECT 
            table_name,
            table_type
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
        """
        
        cursor.execute(query)
        tables = cursor.fetchall()
        
        # Get row count for each table
        for table in tables:
            table_name = table['table_name']
            count_query = f"SELECT COUNT(*) as count FROM {table_name}"
            try:
                cursor.execute(count_query)
                count_result = cursor.fetchone()
                table['row_count'] = count_result['count']
            except:
                table['row_count'] = 0
        
        cursor.close()
        conn.close()
        
        return jsonify(tables)
        
    except Exception as e:
        print(f"Error fetching tables: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/tables/<table_name>/structure', methods=['GET'])
def get_table_structure(table_name):
    """Get column structure of a specific table"""
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
        SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default
        FROM information_schema.columns 
        WHERE table_name = %s AND table_schema = 'public'
        ORDER BY ordinal_position
        """
        
        cursor.execute(query, (table_name,))
        columns = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return jsonify(columns)
        
    except Exception as e:
        print(f"Error fetching table structure: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/geographic-tables', methods=['GET'])
def get_geographic_tables():
    """Find tables that contain geographic data (latitude/longitude columns)"""
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        query = """
        SELECT 
            t.table_name,
            array_agg(c.column_name) as columns,
            array_agg(c.data_type) as data_types
        FROM information_schema.tables t
        JOIN information_schema.columns c ON t.table_name = c.table_name 
        WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND (c.column_name ILIKE '%lat%' OR c.column_name ILIKE '%lon%' OR c.column_name ILIKE '%lng%' OR c.column_name = 'geom' OR c.column_name ILIKE '%x%' OR c.column_name ILIKE '%y%')
        GROUP BY t.table_name
        ORDER BY t.table_name
        """
        
        cursor.execute(query)
        geo_tables = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return jsonify(geo_tables)
        
    except Exception as e:
        print(f"Error fetching geographic tables: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@app.route('/api/debug/layer/<layer_id>', methods=['GET'])
def debug_layer(layer_id):
    """Debug endpoint to see raw data from a layer"""
    try:
        conn = get_db_connection()
        if not conn:
            return jsonify({'error': 'Database connection failed'}), 500
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get first few rows to inspect
        query = f'SELECT * FROM "{layer_id}" LIMIT 5'
        cursor.execute(query)
        data = cursor.fetchall()
        
        # Get column info
        cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = %s AND table_schema = 'public'
        ORDER BY ordinal_position
        """, (layer_id,))
        columns = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        return jsonify({
            'table': layer_id,
            'columns': columns,
            'sample_data': data
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'Server is running'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)