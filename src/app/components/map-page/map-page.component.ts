import {AfterViewInit, Component} from '@angular/core';
import * as L from 'leaflet';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {environment} from '../../../environments/environment';

interface GeocodingResult {
  lat: number;
  lon: number;
  display_name: string;
}

@Component({
  selector: 'app-map-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './map-page.component.html',
  styleUrl: './map-page.component.css'
})
export class MapPageComponent implements AfterViewInit {

  private map!: L.Map;
  private routeLayer!: L.LayerGroup;
  transportMode: string = 'driving';

  startLocationInput: string = 'München';
  endLocationInput: string = 'Berlin';

  // Use LatLngTuple instead of LatLngExpression to ensure it's an array
  startLatLng: L.LatLngTuple = [48.137154, 11.576124]; // München default
  endLatLng: L.LatLngTuple = [52.520008, 13.404954]; // Berlin default

  distance: number = 0;
  co2Emissions: number = 0;
  cost: number = 0;

  private initializeLeafletMarkerIcons() {
    const iconRetinaUrl = './leaflet/marker-icon-2x.png';
    const iconUrl = './leaflet/marker-icon.png';
    const shadowUrl = './leaflet/marker-shadow.png';

    // @ts-ignore
    delete L.Icon.Default.prototype._getIconUrl;

    L.Icon.Default.mergeOptions({
      iconRetinaUrl,
      iconUrl,
      shadowUrl
    });
  }

  ngAfterViewInit(): void {
    this.initializeLeafletMarkerIcons(); // Call this before map initialization
    this.map = L.map('map').setView([48.137154, 11.576124], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    this.loadRoute();
  }

  onTransportChange(event: any) {
    this.transportMode = event.target.value;
    this.loadRoute();
  }

  async searchLocations() {
    try {
      // Geocode start location
      const startLocation = await this.geocodeLocation(this.startLocationInput);
      if (startLocation) {
        this.startLatLng = [startLocation.lat, startLocation.lon];
      }

      // Geocode end location
      const endLocation = await this.geocodeLocation(this.endLocationInput);
      if (endLocation) {
        this.endLatLng = [endLocation.lat, endLocation.lon];
      }

      // Load route with new coordinates
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

    if (this.transportMode === 'driving') {
      // For API, format is [longitude, latitude], so we need to swap
      const startLonLat = [this.startLatLng[1], this.startLatLng[0]];
      const endLonLat = [this.endLatLng[1], this.endLatLng[0]];
      const apiUrl = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${environment.openRouteServiceApiKey}&start=${startLonLat[0]},${startLonLat[1]}&end=${endLonLat[0]},${endLonLat[1]}`;

      try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        console.log('Route data:', data);

        // Check if we have a valid route in the response
        if (data.features && data.features.length > 0) {
          // Extract distance from the summary in meters and convert to kilometers
          const distanceInMeters = data.features[0].properties.summary.distance;
          this.distance = Math.round(distanceInMeters / 1000 * 10) / 10; // Convert to km and round to 1 decimal place

          // Calculate CO2 emissions (average car emits ~120g CO2 per km)
          this.co2Emissions = Math.round(this.distance * 0.12 * 10) / 10;

          // Calculate approximate costs (average cost per km ~0.30€)
          this.cost = Math.round(this.distance * 0.3 * 10) / 10;

          // OpenRouteService returns GeoJSON format with coordinates in features[0].geometry.coordinates
          const routeCoords: L.LatLngTuple[] = data.features[0].geometry.coordinates.map(
            (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
          );
          L.polyline(routeCoords, { color: 'blue' }).addTo(this.routeLayer);
        } else {
          console.error('No route found in API response');
          this.calculateDirectDistance();
          L.polyline([this.startLatLng, this.endLatLng], { color: 'red', dashArray: '5, 10' }).addTo(this.routeLayer);
        }
      } catch (error) {
        console.error('Error fetching route:', error);
        this.calculateDirectDistance();
        L.polyline([this.startLatLng, this.endLatLng], { color: 'red', dashArray: '5, 10' }).addTo(this.routeLayer);
      }
    } else {
      // For flight mode, calculate direct distance and draw a dashed line
      this.calculateFlightDistance();
      L.polyline([this.startLatLng, this.endLatLng], { color: 'red', dashArray: '5, 10' }).addTo(this.routeLayer);
    }

    // Add markers for start and end points
    L.marker(this.startLatLng).addTo(this.routeLayer).bindPopup('Start: ' + this.startLocationInput);
    L.marker(this.endLatLng).addTo(this.routeLayer).bindPopup('End: ' + this.endLocationInput);

    // Create a proper bounds object with LatLngBounds
    const bounds = L.latLngBounds([this.startLatLng, this.endLatLng]);
    this.map.fitBounds(bounds);
  }

// Calculate direct distance for car fallback
  private calculateDirectDistance() {
    // Create Leaflet LatLng objects
    const start = L.latLng(this.startLatLng[0], this.startLatLng[1]);
    const end = L.latLng(this.endLatLng[0], this.endLatLng[1]);

    // Get distance in meters and convert to kilometers
    const distanceInMeters = start.distanceTo(end);
    this.distance = Math.round(distanceInMeters / 1000 * 10) / 10;

    // Car emissions and costs
    this.co2Emissions = Math.round(this.distance * 0.12 * 10) / 10; // 120g CO2 per km
    this.cost = Math.round(this.distance * 0.3 * 10) / 10; // ~0.30€ per km
  }

// Calculate flight distance and corresponding emissions/costs
  private calculateFlightDistance() {
    // Create Leaflet LatLng objects
    const start = L.latLng(this.startLatLng[0], this.startLatLng[1]);
    const end = L.latLng(this.endLatLng[0], this.endLatLng[1]);

    // Get direct distance in meters and convert to kilometers
    const distanceInMeters = start.distanceTo(end);
    this.distance = Math.round(distanceInMeters / 1000 * 10) / 10;

    // Flight emissions are higher (roughly ~250g per km per passenger)
    this.co2Emissions = Math.round(this.distance * 0.25 * 10) / 10;

    // Flight cost estimation
    // Base cost for short flights
    let baseCost = 50;

    // Add distance-based cost (roughly decreases per km for longer flights)
    if (this.distance < 500) {
      // Short flights are more expensive per km
      this.cost = Math.round((baseCost + this.distance * 0.15) * 10) / 10;
    } else if (this.distance < 1500) {
      // Medium flights
      this.cost = Math.round((baseCost + 500 * 0.15 + (this.distance - 500) * 0.10) * 10) / 10;
    } else {
      // Long flights
      this.cost = Math.round((baseCost + 500 * 0.15 + 1000 * 0.10 + (this.distance - 1500) * 0.08) * 10) / 10;
    }
  }
}
