import {AfterViewInit, Component, OnInit} from '@angular/core';
import * as L from 'leaflet';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {environment} from '../../../environments/environment';
import {RoutingService} from "../../service/routing/routing.service";
import {MatProgressSpinner} from '@angular/material/progress-spinner';

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
  imports: [CommonModule, FormsModule, MatProgressSpinner],
    templateUrl: './map-page.component.html',
    styleUrl: './map-page.component.css'
})
export class MapPageComponent implements OnInit, AfterViewInit {
    private map!: L.Map;
    private routeLayer!: L.LayerGroup;
    transportMode: string = 'driving';
    vehicleType: string = 'petrol';

    startLocationInput: string = '';
    endLocationInput: string = '';
    startLatLng: L.LatLngTuple = [48.137154, 11.576124]; // München default
    endLatLng: L.LatLngTuple = [52.520008, 13.404954]; // Berlin default

    distance: number = 0;
    co2Emissions: number = 0;
    cost: number = 0;
    cheepestFlightDeepLink: string = '';
    progressSpinner: boolean = true;

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

    // Metrics configuration for different vehicle types
    private readonly vehicleMetrics: Record<string, {co2Factor: number, costPerKm: number}> = {
      'petrol': {
        co2Factor: 0.183,  // 183g 7,7l/100km * 2,37kg/l
        costPerKm: 0.2    // 7,7l/100km * 1,75€/l + 6€/100km
      },
      'diesel': {
        co2Factor: 0.186,  // 186g CO2 per km 7l/100km*2,65kg/l
        costPerKm: 0.18   // 6€/100km + 7l/100km * 1,6€
      },
      'electric': {
        co2Factor: 0,  // 0g
        costPerKm: 0.14 // 6€/100km + 0.4€/kWh * 20kWh/100km
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
        const startCity = routeData.startLocation.display_name.split(',')[0];
        // Process end location
        this.processLocationInput('end', routeData.endLocation);
        const endCity = routeData.endLocation.display_name.split(',')[0];

        this.getAirportCode(startCity).then(
          (skyId) => {
            this.getAirportCode(endCity).then(
              (skyId2) => {
                this.getOneWay(skyId, skyId2).then(
                  (flightSession) => {
                    this.getCheapestFlight(flightSession[0], flightSession[1]).then(
                      () => {
                        this.progressSpinner = false;
                      }
                    );
                  }
                );
              }
            );
          }
        );

        // Map transport mode from selection component to internal representation
        this.mapTransportMode(routeData.transportMode || 'driving');

        this.transportMode = routeData.transportMode || 'driving';
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
            case 'driving-flight':
                this.transportMode = 'driving-flight';
                break;
            default:
                this.transportMode = 'driving';
        }
    }

    ngAfterViewInit(): void {
        this.initializeLeafletMarkerIcons();
        this.map = L.map('map').setView([48.137154, 11.576124], 5); // Use a wider zoom level initially

        // Add OSM tiles with custom styling class
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            className: 'styled-tiles', // This class is already styled in your CSS
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);

        this.routeLayer = L.layerGroup().addTo(this.map);

        const routeData = this.routingService.routeData();
        if (routeData?.startLocation?.lat && routeData?.endLocation?.lat) {
            // Only load route if data was passed from another page
            this.loadRoute();
        }
    }

    onTransportChange(event: any) {
        this.mapTransportMode(event.target.value);
        if (this.isValidLatLng(this.startLatLng) && this.isValidLatLng(this.endLatLng)) {
            this.loadRoute();
        }
    }

    // Add this method to handle vehicle type changes
    onVehicleTypeChange(event: any) {
      this.vehicleType = event.target.value;
      if (this.transportMode === 'driving' && this.isValidLatLng(this.startLatLng) && this.isValidLatLng(this.endLatLng)) {
        this.loadRoute();
      }
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
        if (!this.isValidLatLng(this.startLatLng) || !this.isValidLatLng(this.endLatLng)) {
            console.log('Invalid coordinates, not loading route');
            return;
        }

        this.routeLayer.clearLayers();

        switch(this.transportMode) {
            case 'driving':
                await this.loadDrivingRoute();
                break;
            case 'train':
                await this.loadTrainRoute();
                break;
            case 'flight':
                await this.loadFlightRoute();
                break;
            case 'driving-flight':
                await this.loadAutoFlightRoute();
                break;
        }

        // Create bounds and fit map to view all markers and route
        const bounds = L.latLngBounds([this.startLatLng, this.endLatLng]);
        this.map.fitBounds(bounds);
    }

    private isValidLatLng(latLng: L.LatLngTuple): boolean {
        // Check if the coordinates are non-zero and in reasonable range
        return latLng &&
            latLng[0] !== 0 &&
            latLng[1] !== 0 &&
            Math.abs(latLng[0]) <= 90 &&
            Math.abs(latLng[1]) <= 180;
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

        let startLatLng = this.startLatLng;
        let endLatLng = this.endLatLng;

        if (startAirport) {
          startLatLng = [startAirport.lat, startAirport.lon];
          L.marker(this.startLatLng).addTo(this.routeLayer)
            .bindPopup(`Departure: ${startAirport.display_name}`);
        }

        if (endAirport) {
          endLatLng = [endAirport.lat, endAirport.lon];
          L.marker(endLatLng).addTo(this.routeLayer)
            .bindPopup(`Arrival: ${endAirport.display_name}`);
        }

        this.calculateDirectDistance();

        // Create a curved flight path using great circle arc
        const points = this.createGreatCircleArc(startLatLng, endLatLng, 100);

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

    // Calculate CO2 emissions with vehicle type adjustment
    if (mode === 'driving') {
      // Use vehicle type specific CO2 factor
      const vehicleMetrics = this.vehicleMetrics[this.vehicleType];
      this.co2Emissions = Math.round(this.distance * vehicleMetrics.co2Factor * 10) / 10;

      // Calculate cost with vehicle type specific cost per km
      this.cost = Math.round((metrics.baseCost + (this.distance * vehicleMetrics.costPerKm)) * 10) / 10;
    } else {
      // Original calculation for train and flight
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

    async loadAutoFlightRoute() {
        try {
            this.routeLayer.clearLayers();

            // Original start and end points
            const originalStart: L.LatLngTuple = [this.startLatLng[0], this.startLatLng[1]];
            const originalEnd: L.LatLngTuple = [this.endLatLng[0], this.endLatLng[1]];
            const originalStartName = this.startLocationInput;
            const originalEndName = this.endLocationInput;

            // Find nearest airports
            const startAirport = await this.findNearestAirport(originalStart[0], originalStart[1]);
            const endAirport = await this.findNearestAirport(originalEnd[0], originalEnd[1]);

            if (!startAirport || !endAirport) {
                throw new Error('Could not find suitable airports');
            }

            // Add markers for original start/end points
            L.marker(originalStart).addTo(this.routeLayer)
                .bindPopup(`Start: ${originalStartName}`);
            L.marker(originalEnd).addTo(this.routeLayer)
                .bindPopup(`Destination: ${originalEndName}`);

            // Raw airport coordinates
            const rawStartAirportPoint: L.LatLngTuple = [startAirport.lat, startAirport.lon];
            const rawEndAirportPoint: L.LatLngTuple = [endAirport.lat, endAirport.lon];

            // Get road-snapped coordinates for better routing
            const startAirportPoint = await this.snapToRoad(rawStartAirportPoint);
            const endAirportPoint = await this.snapToRoad(rawEndAirportPoint);

            // Add airport markers (using original airport points for visualization)
            L.marker(rawStartAirportPoint).addTo(this.routeLayer)
                .bindPopup(`Departure Airport: ${startAirport.display_name}`)
                .setIcon(new L.Icon({
                    iconUrl: 'assets/airport-icon.png',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                }));

            L.marker(rawEndAirportPoint).addTo(this.routeLayer)
                .bindPopup(`Arrival Airport: ${endAirport.display_name}`)
                .setIcon(new L.Icon({
                    iconUrl: 'assets/airport-icon.png',
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                }));

            // Draw route to departure airport (using road-snapped point)
            await this.drawCarRoute(originalStart, startAirportPoint, 'blue');

            // Draw flight route (using original airport points)
            const flightPoints = this.createGreatCircleArc(rawStartAirportPoint, rawEndAirportPoint, 100);
            L.polyline(flightPoints, {
                color: 'red',
                weight: 3,
                opacity: 0.7
            }).addTo(this.routeLayer);

            // Draw route from arrival airport to destination (using road-snapped point)
            await this.drawCarRoute(endAirportPoint, originalEnd, 'blue');

            // Calculate total distances
            let totalDistanceToAirport = 0;
            let totalDistanceFromAirport = 0;

            // Use raw airport points for flight distance calculation
            const startLatLng = L.latLng(rawStartAirportPoint[0], rawStartAirportPoint[1]);
            const endLatLng = L.latLng(rawEndAirportPoint[0], rawEndAirportPoint[1]);
            const flightDistanceInMeters = startLatLng.distanceTo(endLatLng);
            const flightDistance = flightDistanceInMeters / 1000;

            // Get road distances with the snapped points
            try {
                totalDistanceToAirport = await this.getCarRouteDistance(originalStart, startAirportPoint);
                totalDistanceFromAirport = await this.getCarRouteDistance(endAirportPoint, originalEnd);
            } catch (error) {
                console.error('Error calculating car segments:', error);
                // Fallback: estimate direct distances
                const startToAirport = L.latLng(originalStart[0], originalStart[1]).distanceTo(L.latLng(startAirportPoint[0], startAirportPoint[1]));
                const airportToEnd = L.latLng(endAirportPoint[0], endAirportPoint[1]).distanceTo(L.latLng(originalEnd[0], originalEnd[1]));
                totalDistanceToAirport = startToAirport / 1000;
                totalDistanceFromAirport = airportToEnd / 1000;
            }

            // Add total distance
            this.distance = Math.round((flightDistance + totalDistanceToAirport + totalDistanceFromAirport) * 10) / 10;

            // Fit map bounds to include all points
            const bounds = L.latLngBounds([
                originalStart,
                startAirportPoint,
                endAirportPoint,
                originalEnd
            ]);
            this.map.fitBounds(bounds, { padding: [50, 50] });

            // Calculate metrics for the combined journey
            this.calculateAutoFlightMetrics(flightDistance, totalDistanceToAirport, totalDistanceFromAirport);

        } catch (error) {
            console.error('Error loading auto-flight route:', error);

            // Fallback to direct flight line if API fails
            this.calculateDirectDistance();
            L.polyline([this.startLatLng, this.endLatLng], {
                color: 'red',
                dashArray: '5, 10',
                weight: 3
            }).addTo(this.routeLayer);

            this.calculateMetrics('flight');
        }
    }

  private async snapToRoad(latLng: L.LatLngTuple): Promise<L.LatLngTuple> {
    try {
      const apiUrl = `https://api.openrouteservice.org/v2/snap/driving-car`;
      const body = {
        locations: [[latLng[1], latLng[0]]],
        radius: 5000
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': environment.openRouteServiceApiKey
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Failed to snap to road: ${response.status}`);
      }

      const data = await response.json();
      if (data && data.locations && data.locations.length > 0) {
        // Extract the snapped coordinates [lon, lat] and return as [lat, lon]
        const snappedCoord = data.locations[0].location;
        return [snappedCoord[1], snappedCoord[0]];
      }
      return latLng; // Return original if no snapped point found
    } catch (error) {
      console.warn('Error snapping to road, using original point:', error);
      return latLng;
    }
  }

    private calculateAutoFlightMetrics(
        flightDistance: number,
        carDistanceToAirport: number,
        carDistanceFromAirport: number
    ) {
        // Flight metrics
        const flightMetrics = this.routeMetrics['flight'];
        const flightCO2 = flightDistance * flightMetrics.co2Factor;

        // Car metrics
        const carMetrics = this.routeMetrics['driving'];
        const carCO2 = (carDistanceToAirport + carDistanceFromAirport) * carMetrics.co2Factor;

        // Total CO2
        this.co2Emissions = Math.round((flightCO2 + carCO2) * 10) / 10;

        // Calculate flight cost
        let flightCost;
        if (flightDistance < 500) {
            flightCost = flightMetrics.baseCost + flightDistance * 0.15;
        } else if (flightDistance < 1500) {
            flightCost = flightMetrics.baseCost + 500 * 0.15 + (flightDistance - 500) * 0.10;
        } else {
            flightCost = flightMetrics.baseCost + 500 * 0.15 + 1000 * 0.10 + (flightDistance - 1500) * 0.08;
        }

        // Calculate car costs
        const totalCarDistance = carDistanceToAirport + carDistanceFromAirport;
        // Use the value directly as a number, not accessing it as a function
        const costPerKm = typeof carMetrics.costPerKm === 'function'
            ? carMetrics.costPerKm(totalCarDistance)
            : carMetrics.costPerKm;
        const carCost = totalCarDistance * costPerKm;

        // Total cost
        this.cost = Math.round((flightCost + carCost) * 10) / 10;
    }

    private async drawCarRoute(start: L.LatLngTuple, end: L.LatLngTuple, color: string): Promise<void> {
        try {
            // For API, format is [longitude, latitude]
            const startLonLat = [start[1], start[0]];
            const endLonLat = [end[1], end[0]];
            const apiUrl = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${environment.openRouteServiceApiKey}&start=${startLonLat[0]},${startLonLat[1]}&end=${endLonLat[0]},${endLonLat[1]}`;

            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.features && data.features.length > 0) {
                const routeCoords: L.LatLngTuple[] = data.features[0].geometry.coordinates.map(
                    (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
                );
                L.polyline(routeCoords, {color, weight: 3}).addTo(this.routeLayer);
            } else {
                // Fallback to direct line
                L.polyline([start, end], {
                    color,
                    dashArray: '5, 10'
                }).addTo(this.routeLayer);
            }
        } catch (error) {
            console.error('Error fetching car route:', error);
            // Fallback to direct line
            L.polyline([start, end], {
                color,
                dashArray: '5, 10'
            }).addTo(this.routeLayer);
        }
    }

    private async getCarRouteDistance(start: L.LatLngTuple, end: L.LatLngTuple): Promise<number> {
        // For API, format is [longitude, latitude]
        const startLonLat = [start[1], start[0]];
        const endLonLat = [end[1], end[0]];
        const apiUrl = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${environment.openRouteServiceApiKey}&start=${startLonLat[0]},${startLonLat[1]}&end=${endLonLat[0]},${endLonLat[1]}`;

        try {
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (data.features && data.features.length > 0) {
                // Extract distance in meters and convert to kilometers
                const distanceInMeters = data.features[0].properties.summary.distance;
                return distanceInMeters / 1000;
            }
        } catch (error) {
            console.error('Error calculating car route distance:', error);
        }

        // Fallback: direct distance
        const startLatLng = L.latLng(start[0], start[1]);
        const endLatLng = L.latLng(end[0], end[1]);
        return startLatLng.distanceTo(endLatLng) / 1000;
    }

    private async getAirportCode(city: string): Promise<string> {
      const apiUrl1 = `https://sky-scanner3.p.rapidapi.com/web/flights/auto-complete?query=${encodeURIComponent(city)}`;
      const options = {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': environment.flightApi.key,
          'X-RapidAPI-Host': environment.flightApi.url
        }
      };
      try {
        const response = await fetch(apiUrl1, options);
        const result = await response.json();
        return result.data[0].placeId;
      } catch (error) {
        console.error('Error fetching airport code:', error);
        return '';
      }
    }

    private async getOneWay(startSkyId: string, endSkyId: string): Promise<string[]>{
      // get today date
      const today = new Date().toISOString().split('T')[0];
      const flightSession: string[] = [];
      const url = `https://sky-scanner3.p.rapidapi.com/flights/search-one-way?fromEntityId=${startSkyId}&toEntityId=
      ${endSkyId}&departDate=${today}&cabinClass=economy`;
      const options = {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': environment.flightApi.key,
          'X-RapidAPI-Host': environment.flightApi.url
        }
      };

      try {
        const response = await fetch(url, options);
        const result = await response.json();
        console.log(result.data.token);
        flightSession.push(result.data.token)
        const itineraries = result.data.itineraries;
        let cheapestPrice = Infinity;
        let cheapestFlight: any = null;
        for (const itinerary of itineraries) {
          const price = itinerary.price.raw;
          if (price < cheapestPrice) {
            cheapestPrice = price;
            cheapestFlight = itinerary;
          }
        }
        flightSession.push(cheapestFlight.id);
        this.cost = cheapestFlight.price.formatted;
        return flightSession;
      } catch (error) {
        console.error(error);
        return [];
      }
    }

    private async getCheapestFlight(token: string, itineraryId: string){
      const url = `https://sky-scanner3.p.rapidapi.com/flights/detail?token=${token}&itineraryId=${itineraryId}`;
      const options = {
        method: 'GET',
        headers: {
          'X-RapidAPI-Key': environment.flightApi.key,
          'X-RapidAPI-Host': environment.flightApi.url
        }
      };

      try {
        const response = await fetch(url, options);
        const result = await response.json();
        this.cheepestFlightDeepLink = result.data.itinerary.pricingOptions[0].pricingItems[0].uri;
      } catch (error) {
        console.error(error);
      }
    }


  openDeepLink() {
    window.open(this.cheepestFlightDeepLink, '_blank');
  }
}
