# 🗺️ French data Map - GIS Data Visualization Platform

A modern, minimalist web application for visualizing spatial and statistical data from PostgreSQL/PostGIS databases. Built with React, TypeScript, and Leaflet.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![React](https://img.shields.io/badge/React-18.x-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9.x-199900)
![PostGIS](https://img.shields.io/badge/PostGIS-3.x-336791)

## screenshot
![alt text](https://github.com/Ayyoubsghuri/GeoSimple---GIS-Data-Visualization-Platform/blob/main/Geosimple.png)

## 📋 Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)

## 📖 Overview

This application provides an intuitive interface for:
- **Discovering** database tables as map layers
- **Visualizing** spatial data (points, polygons, routes)
- **Linking** spatial layers with statistical data
- **Filtering** data by commune or property
- **Analyzing** data with built-in charts and statistics

## ✨ Features

### Map Visualization
- 🗺️ Multiple base map styles (Standard, Satellite, Dark, Transport)
- 🔍 Dynamic layer toggling
- 🎨 Choropleth with gradient coloring
- 📍 Point markers with labels

### Data Management
- 🔗 **Layer Linking**: Connect spatial and statistical tables
- 🎯 **Commune Filtering**: Filter by commune with auto-complete
- 🔎 **Property Filtering**: Drill down to specific values
- 📊 **Auto-Detection**: Smart layer linking suggestions

### Analytics Dashboard
- 📈 Bar, Pie, and Line charts
- 📊 Statistics (count, avg, min, max, median)
- 📋 Data table view
- 💾 Export data as JSON

## 🛠️ Tech Stack

**Frontend**: React 18, TypeScript 5, Leaflet 1.9, Tailwind CSS, Framer Motion  
**Backend**: Flask 2, PostgreSQL 14, PostGIS 3

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- Python 3.10+
- PostgreSQL 14+ with PostGIS

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install flask flask-cors psycopg2-binary python-dotenv
python main.py
```

### Frontend Setup

```bash
cd frontend
npm install
npm start
```

### Database Configuration

Create `.env` file in backend:

```env
DB_HOST=localhost
DB_NAME=your_database
DB_USER=your_user
DB_PASSWORD=your_password
DB_PORT=5432
```

## 📊 Database Schema

### Required Tables

**Caidats (Base Layer)**
```sql
CREATE TABLE caidats (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255),
    commune_fr VARCHAR(255),
    geom GEOMETRY(Polygon, 4326)
);
```

**Communes**
```sql
CREATE TABLE communes (
    id SERIAL PRIMARY KEY,
    commune_fr VARCHAR(255),
    code_commune VARCHAR(10),
    geom GEOMETRY(Polygon, 4326)
);
```

**Statistical Tables** (e.g., data_territoire)
```sql
CREATE TABLE data_territoire (
    id SERIAL PRIMARY KEY,
    commune_fr VARCHAR(255),
    code_commune VARCHAR(10),
    population INTEGER,
    -- Add your statistical columns
);
```

### Column Naming Conventions

| Purpose | Recommended Names |
|---------|-------------------|
| Geometry | `geom`, `geometry`, `the_geom` |
| Commune Name | `commune_fr`, `commune`, `nom_fr`, `nom` |
| Commune Code | `code_commune`, `commune_code` |
| Point Coordinates | `latitude`/`longitude`, `lat`/`lon` |

## 🔌 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/package-layers` | GET | List all database tables |
| `/api/package-layers/{id}/data` | GET | Fetch layer data |
| `/api/layers/{id}/linked-data` | GET | Join two layers |
| `/api/layers/auto-link` | GET | Auto-detect links |
| `/api/communes` | GET | Get commune names |
| `/api/layers/{id}/statistics` | GET | Column statistics |

## 🎯 Usage

1. **Activate Layers**: Toggle tables on/off in sidebar
2. **Filter by Commune**: Select communes from dropdown (up to 6)
3. **Link Layers**: Connect spatial + statistical data for choropleth
4. **View Analytics**: Click 📊 button for charts and statistics

## 🔧 Troubleshooting

**PostGIS not installed:**
```sql
CREATE EXTENSION postgis;
```

**Layer linking fails:** Verify both tables have common columns (e.g., `commune_fr`)

**API connection error:** Ensure Flask server is running on port 5000

## 🚢 Deployment

```bash
# Frontend build
npm run build

# Backend (production)
gunicorn -w 4 -b 0.0.0.0:5000 main:app
```

## 📄 License

Educational/Internal use. Ensure rights for map tiles and data.

---

**Built with ❤️ for data visualization and territorial analysis**
