import {AfterViewInit, Component, OnInit} from '@angular/core';
import * as L from 'leaflet';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {environment} from '../../../environments/environment';
import {RoutingService} from "../../service/routing/routing.service";

interface GeocodingResult {
    lat: number;
    lon: number;
    display_name: string;
}

interface RouteMetrics {
    distance: number;
    co2Factor: number;
    baseCost: number;
    costPerKm: number | ((distance: number) => number);
}

@Component({
    selector: 'app-map-page',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './map-page.component.html',
    styleUrl: './map-page.component.css'
})
export class MapPageComponent implements OnInit, AfterViewInit {
    private map!: L.Map;
    private routeLayer!: L.LayerGroup;
    transportMode: string = 'driving';

    startLocationInput: string = 'München';
    endLocationInput: string = 'Berlin';
    startLatLng: L.LatLngTuple = [48.137154, 11.576124]; // München default
    endLatLng: L.LatLngTuple = [52.520008, 13.404954]; // Berlin default

    distance: number = 0;
    co2Emissions: number = 0;
    cost: number = 0;

    // Route metrics configuration by transport type
    private readonly routeMetrics: Record<string, RouteMetrics> = {
        'driving': {
            distance: 0,
            co2Factor: 0.12,  // 120g CO2 per km
            baseCost: 0,
            costPerKm: 0.3
        },
        'train': {
            distance: 0,
            co2Factor: 0.035,  // 35g CO2 per km
            baseCost: 7.5,
            costPerKm: (distance) => distance > 100 ? 0.15 : 0.20
        },
        'flight': {
            distance: 0,
            co2Factor: 0.25,  // 250g CO2 per km
            baseCost: 50,
            costPerKm: (distance) => {
                if (distance < 500) return 0.15;
                if (distance < 1500) return 0.10;
                return 0.08;
            }
        }
    };

    private initializeLeafletMarkerIcons() {
        const iconRetinaUrl = 'assets/leaflet/marker-icon-2x.png';
        const iconUrl = 'assets/leaflet/marker-icon.png';
        const shadowUrl = 'assets/leaflet/marker-shadow.png';

        // @ts-ignore
        delete L.Icon.Default.prototype._getIconUrl;

        L.Icon.Default.mergeOptions({
            iconRetinaUrl,
            iconUrl,
            shadowUrl
        });
    }

    constructor(private routingService: RoutingService) {}

    ngOnInit(): void {
        // Get route data from service using signal
        const routeData = this.routingService.routeData();

        if (routeData) {
            // Process start location
            this.processLocationInput('start', routeData.startLocation);
            // Process end location
            this.processLocationInput('end', routeData.endLocation);

            // Map transport mode from selection component to internal representation
            this.mapTransportMode(routeData.transportMode || 'driving');
        }
    }

    private processLocationInput(type: 'start' | 'end', location: any): void {
        if (!location) return;

        const isStart = type === 'start';
        const inputProp = isStart ? 'startLocationInput' : 'endLocationInput';
        const latLngProp = isStart ? 'startLatLng' : 'endLatLng';

        if (typeof location === 'string') {
            this[inputProp] = location;
        } else {
            this[inputProp] = location.display_name || '';
            if (location.lat && location.lon) {
                this[latLngProp] = [location.lat, location.lon];
            }
        }
    }

    private mapTransportMode(mode: string): void {
        switch(mode) {
            case 'driving':
            case 'Auto':
                this.transportMode = 'driving';
                break;
            case 'train':
            case 'Zug':
                this.transportMode = 'train';
                break;
            case 'flight':
            case 'Flugzeug':
                this.transportMode = 'flight';
                break;
            default:
                this.transportMode = 'driving';
        }
    }

    ngAfterViewInit(): void {
        this.initializeLeafletMarkerIcons();
        this.map = L.map('map').setView([48.137154, 11.576124], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
        this.routeLayer = L.layerGroup().addTo(this.map);

        const routeData = this.routingService.routeData();
        if (routeData?.startLocation?.lat && routeData?.endLocation?.lat) {
            this.loadRoute();
        } else {
            this.searchLocations();
        }
    }

    onTransportChange(event: any) {
        this.mapTransportMode(event.target.value);
        this.loadRoute();
    }

    async searchLocations() {
        try {
            const [startLocation, endLocation] = await Promise.all([
                this.geocodeLocation(this.startLocationInput),
                this.geocodeLocation(this.endLocationInput)
            ]);

            if (startLocation) {
                this.startLatLng = [startLocation.lat, startLocation.lon];
            }

            if (endLocation) {
                this.endLatLng = [endLocation.lat, endLocation.lon];
            }

            this.loadRoute();
        } catch (error) {
            console.error('Error geocoding locations:', error);
        }
    }

    async geocodeLocation(query: string): Promise<GeocodingResult | null> {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
            );
            const results = await response.json();

            if (results && results.length > 0) {
                return {
                    lat: parseFloat(results[0].lat),
                    lon: parseFloat(results[0].lon),
                    display_name: results[0].display_name
                };
            }
            return null;
        } catch (error) {
            console.error('Geocoding error:', error);
            return null;
        }
    }

    async loadRoute() {
        this.routeLayer.clearLayers();

        // Add markers for start and end points
        L.marker(this.startLatLng).addTo(this.routeLayer).bindPopup('Start: ' + this.startLocationInput);
        L.marker(this.endLatLng).addTo(this.routeLayer).bindPopup('End: ' + this.endLocationInput);

        switch(this.transportMode) {
            case 'driving':
                await this.loadDrivingRoute();
                break;
            case 'train':
                await this.loadTrainRoute();
                break;
            case 'flight':
                this.loadFlightRoute();
                break;
        }

        // Create bounds and fit map to view all markers and route
        const bounds = L.latLngBounds([this.startLatLng, this.endLatLng]);
        this.map.fitBounds(bounds);
    }

    private async loadDrivingRoute() {
        // For API, format is [longitude, latitude]
        const startLonLat = [this.startLatLng[1], this.startLatLng[0]];
        const endLonLat = [this.endLatLng[1], this.endLatLng[0]];
        const apiUrl = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${environment.openRouteServiceApiKey}&start=${startLonLat[0]},${startLonLat[1]}&end=${endLonLat[0]},${endLonLat[1]}`;

        try {
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.features && data.features.length > 0) {
                // Extract distance from the summary in meters and convert to kilometers
                const distanceInMeters = data.features[0].properties.summary.distance;
                this.distance = Math.round(distanceInMeters / 1000 * 10) / 10;

                // Draw the route
                const routeCoords: L.LatLngTuple[] = data.features[0].geometry.coordinates.map(
                    (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
                );
                L.polyline(routeCoords, {color: 'blue'}).addTo(this.routeLayer);
            } else {
                this.calculateDirectDistance();
                L.polyline([this.startLatLng, this.endLatLng], {
                    color: 'red',
                    dashArray: '5, 10'
                }).addTo(this.routeLayer);
            }
        } catch (error) {
            console.error('Error fetching route:', error);
            this.calculateDirectDistance();
            L.polyline([this.startLatLng, this.endLatLng], {
                color: 'red',
                dashArray: '5, 10'
            }).addTo(this.routeLayer);
        }

        // Calculate metrics for driving
        this.calculateMetrics('driving');
    }

    private async loadTrainRoute() {
        try {
            // For API, format is [longitude, latitude]
            const startLonLat = [this.startLatLng[1], this.startLatLng[0]];
            const endLonLat = [this.endLatLng[1], this.endLatLng[0]];
            const apiUrl = `https://api.openrouteservice.org/v2/directions/driving-hgv?api_key=${environment.openRouteServiceApiKey}&start=${startLonLat[0]},${startLonLat[1]}&end=${endLonLat[0]},${endLonLat[1]}`;

            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.features && data.features.length > 0) {
                const distanceInMeters = data.features[0].properties.summary.distance;
                this.distance = Math.round(distanceInMeters / 1000 * 10) / 10;

                const routeCoords: L.LatLngTuple[] = data.features[0].geometry.coordinates.map(
                    (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
                );
                L.polyline(routeCoords, {color: 'green', weight: 4}).addTo(this.routeLayer);
            } else {
                this.calculateDirectDistance();
                L.polyline([this.startLatLng, this.endLatLng], {
                    color: 'green',
                    weight: 4,
                    dashArray: '10, 10'
                }).addTo(this.routeLayer);
            }
        } catch (error) {
            console.error('Error fetching train route:', error);
            this.calculateDirectDistance();
            L.polyline([this.startLatLng, this.endLatLng], {
                color: 'green',
                weight: 4,
                dashArray: '10, 10'
            }).addTo(this.routeLayer);
        }

        // Calculate metrics for train
        this.calculateMetrics('train');
    }

    async findNearestAirport(lat: number, lon: number): Promise<GeocodingResult | null> {
        try {
            const apiKey = environment.openAipApiKey;
            // Format is pos=lat,lon&dist=distanceInMeters&type=airportType
            // Using type=3 for International Airports
            const url = `https://api.core.openaip.net/api/airports`;

            // Query parameters
            const params = new URLSearchParams({
                'pos': `${lat},${lon}`,
                'dist': '200000', // 200km in meters
                'type': '3', // International airports
                'limit': '10' // Get more results to filter
            });

            const response = await fetch(`${url}?${params}`, {
                headers: {
                    'x-openaip-api-key': apiKey
                }
            });

            if (!response.ok) {
                throw new Error(`OpenAIP API returned status: ${response.status}`);
            }

            const data = await response.json();

            if (data.items && data.items.length > 0) {
                // Filter for airports with ICAO/IATA codes
                const filteredAirports = data.items.filter((airport: any) =>
                    (airport.icaoCode || airport.iataCode)
                );

                // Sort by priority: international airports with IATA codes first
                filteredAirports.sort((a: any, b: any) => {
                    // Prefer airports with IATA codes (commercial airports)
                    if (a.iataCode && !b.iataCode) return -1;
                    if (!a.iataCode && b.iataCode) return 1;

                    // Default to closest (already sorted by distance from API)
                    return 0;
                });

                if (filteredAirports.length > 0) {
                    const airport = filteredAirports[0];
                    const name = airport.name || 'Airport';
                    const iataCode = airport.iataCode ? ` (${airport.iataCode})` :
                        airport.icaoCode ? ` (${airport.icaoCode})` : '';

                    // Extract coordinates from geometry.coordinates [lon, lat]
                    const coordinates = airport.geometry?.coordinates || [0, 0];

                    return {
                        lat: coordinates[1], // Latitude is second element
                        lon: coordinates[0], // Longitude is first element
                        display_name: name + iataCode
                    };
                }
            }
            return null;
        } catch (error) {
            console.error('Error finding nearest airport:', error);
            return null;
        }
    }

    async loadFlightRoute() {
      try {
        const startAirport = await this.findNearestAirport(this.startLatLng[0], this.startLatLng[1]);
        const endAirport = await this.findNearestAirport(this.endLatLng[0], this.endLatLng[1]);

        // Update markers with airport positions
        this.routeLayer.clearLayers();

        if (startAirport) {
          this.startLatLng = [startAirport.lat, startAirport.lon];
          this.startLocationInput = startAirport.display_name;
          L.marker(this.startLatLng).addTo(this.routeLayer)
            .bindPopup(`Departure: ${startAirport.display_name}`);
        }

        if (endAirport) {
          this.endLatLng = [endAirport.lat, endAirport.lon];
          this.endLocationInput = endAirport.display_name;
          L.marker(this.endLatLng).addTo(this.routeLayer)
            .bindPopup(`Arrival: ${endAirport.display_name}`);
        }

        this.calculateDirectDistance();

        // Create a curved flight path using great circle arc
        const points = this.createGreatCircleArc(this.startLatLng, this.endLatLng, 100);

        // Draw the flight route
        L.polyline(points, {
          color: 'red',
          weight: 3,
          opacity: 0.7
        }).addTo(this.routeLayer);

        this.calculateMetrics('flight');
      } catch (error) {
        console.error('Error loading flight route:', error);

        // Fallback to direct line if API fails
        this.calculateDirectDistance();
        L.polyline([this.startLatLng, this.endLatLng], {
          color: 'red',
          dashArray: '5, 10',
          weight: 3
        }).addTo(this.routeLayer);

        this.calculateMetrics('flight');
      }
    }

    private calculateDirectDistance() {
        const start = L.latLng(this.startLatLng[0], this.startLatLng[1]);
        const end = L.latLng(this.endLatLng[0], this.endLatLng[1]);
        const distanceInMeters = start.distanceTo(end);
        this.distance = Math.round(distanceInMeters / 1000 * 10) / 10;
    }

    private calculateMetrics(mode: 'driving' | 'train' | 'flight') {
        const metrics = this.routeMetrics[mode];

        // Calculate CO2 emissions
        this.co2Emissions = Math.round(this.distance * metrics.co2Factor * 10) / 10;

        // Calculate cost
        let costPerKm = typeof metrics.costPerKm === 'function'
            ? metrics.costPerKm(this.distance)
            : metrics.costPerKm;

        // Special handling for flight with distance-based tiers
        if (mode === 'flight') {
            if (this.distance < 500) {
                this.cost = Math.round((metrics.baseCost + this.distance * 0.15) * 10) / 10;
            } else if (this.distance < 1500) {
                this.cost = Math.round((metrics.baseCost + 500 * 0.15 +
                    (this.distance - 500) * 0.10) * 10) / 10;
            } else {
                this.cost = Math.round((metrics.baseCost + 500 * 0.15 + 1000 * 0.10 +
                    (this.distance - 1500) * 0.08) * 10) / 10;
            }
        } else {
            this.cost = Math.round((metrics.baseCost + (this.distance * costPerKm)) * 10) / 10;
        }
    }

    private createGreatCircleArc(start: L.LatLngTuple, end: L.LatLngTuple, numPoints: number): L.LatLngTuple[] {
        const points: L.LatLngTuple[] = [];

        // Convert to radians
        const startLat = this.toRadians(start[0]);
        const startLng = this.toRadians(start[1]);
        const endLat = this.toRadians(end[0]);
        const endLng = this.toRadians(end[1]);

        // Calculate the great circle distance
        const d = 2 * Math.asin(Math.sqrt(
            Math.pow(Math.sin((endLat - startLat) / 2), 2) +
            Math.cos(startLat) * Math.cos(endLat) *
            Math.pow(Math.sin((endLng - startLng) / 2), 2)
        ));

        // Generate points along the great circle
        for (let i = 0; i <= numPoints; i++) {
            const f = i / numPoints; // Fraction of the way

            // Calculate the waypoint at this fraction
            const A = Math.sin((1 - f) * d) / Math.sin(d);
            const B = Math.sin(f * d) / Math.sin(d);

            const x = A * Math.cos(startLat) * Math.cos(startLng) +
                B * Math.cos(endLat) * Math.cos(endLng);
            const y = A * Math.cos(startLat) * Math.sin(startLng) +
                B * Math.cos(endLat) * Math.sin(endLng);
            const z = A * Math.sin(startLat) + B * Math.sin(endLat);

            const lat = Math.atan2(z, Math.sqrt(x*x + y*y));
            const lng = Math.atan2(y, x);

            points.push([this.toDegrees(lat), this.toDegrees(lng)]);
        }

        return points;
    }

    private toRadians(degrees: number): number {
        return degrees * Math.PI / 180;
    }

    private toDegrees(radians: number): number {
        return radians * 180 / Math.PI;
    }
}
