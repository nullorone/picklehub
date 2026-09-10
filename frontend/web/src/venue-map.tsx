import type { components } from '@picklehub/api-client';
import type { RuntimeConfig } from '@picklehub/validation';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

type Venue = components['schemas']['VenueSummary'];
interface Bounds {
    readonly east: number;
    readonly north: number;
    readonly south: number;
    readonly west: number;
}
type MapConfig = NonNullable<RuntimeConfig['map']>;

function featureCollection(venues: readonly Venue[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
    return {
        type: 'FeatureCollection',
        features: venues.map((venue) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [venue.location.longitude, venue.location.latitude] },
            properties: { id: venue.id, name: venue.name },
        })),
    };
}

export function VenueMap({
    config,
    onBoundsChanged,
    onError,
    onSelect,
    venues,
}: {
    readonly config: MapConfig;
    readonly onBoundsChanged: (bounds: Bounds) => void;
    readonly onError: () => void;
    readonly onSelect: (venue: Venue) => void;
    readonly venues: readonly Venue[];
}) {
    const container = useRef<HTMLDivElement>(null);
    const map = useRef<MapLibreMap | undefined>(undefined);
    const venuesRef = useRef(venues);
    const selectRef = useRef(onSelect);
    const boundsRef = useRef(onBoundsChanged);
    const errorRef = useRef(onError);

    useEffect(() => {
        venuesRef.current = venues;
        selectRef.current = onSelect;
        boundsRef.current = onBoundsChanged;
        errorRef.current = onError;
    }, [onBoundsChanged, onError, onSelect, venues]);

    useEffect(() => {
        if (!container.current) return;
        const instance = new maplibregl.Map({
            center: [37.6173, 55.7558],
            container: container.current,
            cooperativeGestures: true,
            style: config.styleUrl,
            zoom: 10,
        });
        map.current = instance;
        instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        instance.on('error', () => {
            errorRef.current();
        });
        instance.on('load', () => {
            instance.addSource('venues', {
                type: 'geojson',
                cluster: true,
                clusterMaxZoom: 14,
                clusterRadius: 48,
                data: featureCollection(venuesRef.current),
            });
            instance.addLayer({
                id: 'venue-clusters',
                type: 'circle',
                source: 'venues',
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': '#2463eb',
                    'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 50, 30],
                    'circle-stroke-color': '#ffffff',
                    'circle-stroke-width': 2,
                },
            });
            instance.addLayer({
                id: 'venue-cluster-count',
                type: 'symbol',
                source: 'venues',
                filter: ['has', 'point_count'],
                layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13 },
                paint: { 'text-color': '#ffffff' },
            });
            instance.addLayer({
                id: 'venue-points',
                type: 'circle',
                source: 'venues',
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': '#f59e0b',
                    'circle-radius': 8,
                    'circle-stroke-color': '#ffffff',
                    'circle-stroke-width': 2,
                },
            });

            instance.on('click', 'venue-clusters', async (event) => {
                const [feature] = instance.queryRenderedFeatures(event.point, { layers: ['venue-clusters'] });
                if (!feature) return;
                const clusterId = feature.properties.cluster_id as number;
                const source = instance.getSource<GeoJSONSource>('venues');
                if (!source || feature.geometry.type !== 'Point') return;
                const zoom = await source.getClusterExpansionZoom(clusterId);
                instance.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
            });
            instance.on('click', 'venue-points', (event) => {
                const [feature] = event.features ?? [];
                if (!feature) return;
                const id = feature.properties.id as string;
                const venue = venuesRef.current.find((item) => item.id === id);
                if (venue) selectRef.current(venue);
            });
            for (const layer of ['venue-clusters', 'venue-points']) {
                instance.on('mouseenter', layer, () => {
                    instance.getCanvas().style.cursor = 'pointer';
                });
                instance.on('mouseleave', layer, () => {
                    instance.getCanvas().style.cursor = '';
                });
            }
        });
        return () => {
            instance.remove();
            map.current = undefined;
        };
    }, [config.styleUrl]);

    useEffect(() => {
        const source = map.current?.getSource<GeoJSONSource>('venues');
        if (source) source.setData(featureCollection(venues));
    }, [venues]);

    function searchArea() {
        const bounds = map.current?.getBounds();
        if (!bounds) return;
        boundsRef.current({
            east: Number(bounds.getEast().toFixed(6)),
            north: Number(bounds.getNorth().toFixed(6)),
            south: Number(bounds.getSouth().toFixed(6)),
            west: Number(bounds.getWest().toFixed(6)),
        });
    }

    return (
        <section className="map-panel" aria-labelledby="map-title">
            <div className="map-toolbar">
                <div>
                    <h2 id="map-title">Карта площадок</h2>
                    <p>Переместите карту и запустите поиск в видимой области.</p>
                </div>
                <button className="secondary-action" type="button" onClick={searchArea}>
                    Искать в этой области
                </button>
            </div>
            <div className="venue-map" ref={container} aria-hidden="true" />
            <p className="map-accessibility-note">
                Интерактивная карта дополняет список. Все найденные точки доступны ниже с клавиатуры и программе
                экранного доступа.
            </p>
            <p className="attribution">
                Карта: <a href={config.attributionUrl}>{config.attributionText}</a>
            </p>
        </section>
    );
}
