import {Component, OnInit} from '@angular/core';
import {MatFormField, MatLabel} from '@angular/material/form-field';
import {MatOption, MatSelect} from '@angular/material/select';
import {MatButton} from '@angular/material/button';
import {MatInput} from '@angular/material/input';
import {FormsModule} from '@angular/forms';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {Observable, of} from 'rxjs';
import {map, startWith, switchMap, debounceTime, distinctUntilChanged} from 'rxjs/operators';
import {FormControl, ReactiveFormsModule} from '@angular/forms';
import * as L from 'leaflet';
import {AsyncPipe} from '@angular/common';
import {RoutingService} from '../../service/routing/routing.service';
import {Router} from '@angular/router';

interface GeocodingResult {
  lat: number;
  lon: number;
  display_name: string;
  type?: string;
  importance?: number;
  address?: {
    city?: string;
    town?: string;
    country?: string;
    road?: string;
    street?: string;
    state?: string;
    county?: string;
    postcode?: string;
  };
}

@Component({
  selector: 'app-selection',
  imports: [
    MatFormField,
    MatSelect,
    MatOption,
    MatButton,
    MatInput,
    MatLabel,
    FormsModule,
    ReactiveFormsModule,
    MatAutocompleteModule,
    AsyncPipe
  ],
  templateUrl: './selection.component.html',
  styleUrl: './selection.component.css'
})
export class SelectionComponent implements OnInit {
  startControl = new FormControl('');
  endControl = new FormControl('');
  input1: string = '';
  input2: string = '';
  dropdownOptions: string[] = ['Auto', 'Flugzeug', 'Zug'];
  selectedOption: string = "";

  filteredStartOptions: Observable<GeocodingResult[]> = of([]);
  filteredEndOptions: Observable<GeocodingResult[]> = of([]);

  private map!: L.Map;

  constructor(private routingService: RoutingService, private router: Router) {}

  ngOnInit() {
    // Initialize the map after the view is rendered
    setTimeout(() => {
      this.initMap();
      this.detectUserLocation();
    }, 100);
  }

  onTransportChange() {
    // Reset the current suggestions based on the new transport mode
    this.startControl.setValue('');
    this.endControl.setValue('');

    // Setup autocomplete with the new transport mode
    this.setupAutocomplete();
  }

  setupAutocomplete() {
    if (!this.selectedOption) return;

    // Set up filtering for start location
    this.filteredStartOptions = this.startControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(value => {
        if (value === null || value === '' || value.length < 3) {
          return of([]);
        }
        return this.searchLocationsByType(value, this.selectedOption);
      })
    );

    // Set up filtering for end location
    this.filteredEndOptions = this.endControl.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(value => {
        if (value === null || value === '' || value.length < 3) {
          return of([]);
        }
        return this.searchLocationsByType(value, this.selectedOption);
      })
    );
  }

  async searchLocationsByType(query: string, transportMode: string): Promise<GeocodingResult[]> {
    if (query.length < 2) return [];

    try {
      let apiUrl = `https://nominatim.openstreetmap.org/search?format=json`;

      // Add the base query
      apiUrl += `&q=${encodeURIComponent(query)}`;

      // Add additional query parameters based on search type
      // but don't restrict the results too much
      if (transportMode === 'Flugzeug') {
        // Prioritize airport results but don't exclude others
        apiUrl += '&limit=10'; // Get more results to filter
      } else if (transportMode === 'Zug') {
        // Prioritize railway stations but don't exclude others
        apiUrl += '&limit=10'; // Get more results to filter
      } else {
        // For Auto, focus on general places but get enough results
        apiUrl += '&limit=10';
      }

      const response = await fetch(apiUrl);
      const results: GeocodingResult[] = await response.json();

      // Score and sort results based on relevance to the transport mode
      // but include all types of locations
      const scoredResults = results.map(item => {
        const name = item.display_name.toLowerCase();
        let score = 0;
        let type = 'unknown';

        // Determine location type
        if (name.includes('airport') || name.includes('flughafen') || name.includes('aerodrome')) {
          type = 'airport';
          score += transportMode === 'Flugzeug' ? 100 : 10; // Higher score for airports in flight mode
        } else if (name.includes('bahnhof') || name.includes('station') || name.includes('hbf')) {
          type = 'train';
          score += transportMode === 'Zug' ? 100 : 10; // Higher score for stations in train mode
        } else if (item.address && (item.address.road || item.address.street)) {
          type = 'address';
          score += transportMode === 'Auto' ? 100 : 10; // Higher score for addresses in car mode
        }

        // Add importance score
        score += (item.importance || 0) * 50;

        // Add match score based on query
        if (name.includes(query.toLowerCase())) {
          score += 30;
        }

        return { ...item, _score: score, _type: type };
      });

      // Sort by score
      const sortedResults = scoredResults.sort((a, b) => b._score - a._score);

      // Format based on type
      return sortedResults.slice(0, 5).map(item => {
        if (item._type === 'airport') {
          return this.formatAirportResult(item);
        } else if (item._type === 'train') {
          return this.formatTrainStationResult(item);
        } else {
          return this.formatAddressResult(item);
        }
      });

    } catch (error) {
      console.error('Error fetching location suggestions:', error);
      return [];
    }
  }

// Helper function to format airport results
  private formatAirportResult(item: any): GeocodingResult {
    // Try to extract IATA code
    const iataMatch = item.display_name.match(/\(([A-Z]{3})\)/);
    const iataCode = iataMatch ? iataMatch[1] : '';

    // Extract city name
    let city = '';
    if (item.address && item.address.city) {
      city = item.address.city;
    } else if (item.address && item.address.town) {
      city = item.address.town;
    }

    // Format display name with airport icon
    let formattedName = item.display_name;
    if (iataCode) {
      formattedName = `✈️ ${city ? city + ' - ' : ''}${item.display_name.split(',')[0]} (${iataCode})`;
    } else {
      formattedName = `✈️ ${item.display_name.split(',')[0]}`;
    }

    return {
      ...item,
      display_name: formattedName
    };
  }

// Helper function to format train station results
  private formatTrainStationResult(item: any): GeocodingResult {
    // Extract city name
    let city = '';
    if (item.address && item.address.city) {
      city = item.address.city;
    } else if (item.address && item.address.town) {
      city = item.address.town;
    }

    // Extract station name
    const stationName = item.display_name.split(',')[0].trim();

    // Format with train icon
    let formattedName = `🚆 ${stationName}`;
    if (city && !stationName.includes(city)) {
      formattedName = `🚆 ${stationName}, ${city}`;
    }

    return {
      ...item,
      display_name: formattedName
    };
  }

// Helper function to format address results
  private formatAddressResult(item: any): GeocodingResult {
    // Format with location pin icon
    return {
      ...item,
      display_name: `📍 ${item.display_name}`
    };
  }

  displayLocationFn(location: GeocodingResult | string): string {
    if (!location) return '';
    if (typeof location === 'string') return location;

    // For airports, try to format as "City - Airport Name (CODE)"
    if (location.display_name.toLowerCase().includes('airport') ||
      location.display_name.toLowerCase().includes('flughafen')) {

      // Try to extract IATA code
      const iataMatch = location.display_name.match(/\(([A-Z]{3})\)/);
      const iataCode = iataMatch ? iataMatch[1] : '';

      // Try to extract city name
      let city = '';
      if (location.address && location.address.city) {
        city = location.address.city;
      } else if (location.address && location.address.town) {
        city = location.address.town;
      }

      // If we have city and code, format nicely
      if (city && iataCode) {
        return `${city} - ${location.display_name.split(',')[0]} (${iataCode})`;
      }
    }

    // For train stations
    if (location.display_name.toLowerCase().includes('bahnhof') ||
      location.display_name.toLowerCase().includes('station') ||
      location.display_name.toLowerCase().includes('hbf')) {

      // Try to extract city name
      let city = '';
      if (location.address && location.address.city) {
        city = location.address.city;
      } else if (location.address && location.address.town) {
        city = location.address.town;
      }

      // Get the station name (first part before comma)
      const stationName = location.display_name.split(',')[0].trim();

      // If we have city and it's not already in the station name
      if (city && !stationName.includes(city)) {
        return `${stationName}, ${city}`;
      }
    }

    // Default display for other location types
    return location.display_name;
  }

  private initMap(): void {
    // Create map with default center (Europe)
    this.map = L.map('background-map', {
      center: [51.1657, 10.4515], // Germany center coordinates
      zoom: 5,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false
    });

    // Add the tile layer (map imagery)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      opacity: 0.4 // Make the map partially transparent
    }).addTo(this.map);
  }

  private detectUserLocation(): void {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          this.map.setView([lat, lon], 6);
        },
        (error) => {
          console.error('Error getting user location:', error);
          // Keep default view if location detection fails
        }
      );
    }
  }

  isTransportSelected(): boolean {
    return this.selectedOption !== null && this.selectedOption !== "";
  }

  submitRouteData(): void {
    const startLocation = this.startControl.value;
    const endLocation = this.endControl.value;

    if (startLocation && endLocation && this.selectedOption) {
      // Map transport modes to the format used by MapPageComponent
      let transportMode = 'driving';
      if (this.selectedOption === 'Flugzeug') {
        transportMode = 'flight';
      } else if (this.selectedOption === 'Zug') {
        transportMode = 'train';
      }

      // Set route data in service using signal
      this.routingService.setRouteData({
        startLocation: startLocation,
        endLocation: endLocation,
        transportMode: transportMode
      });

      // Navigate to map page
      this.router.navigate(['/map']);
    } else {
      alert('Bitte wählen Sie Start, Ziel und Fortbewegungsmittel aus.');
    }
  }
}
