import {AfterViewInit, Component, OnInit} from '@angular/core';
import * as L from 'leaflet';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RoutingService} from "../../service/routing/routing.service";
import {
  GeocodingResult,
  HttpService,
  MetricsResponse,
  RoutingRequest,
  SnapToRoadRequest
} from "../../service/http/http.service";
import {catchError, forkJoin, map, Observable, of, switchMap, tap} from "rxjs";

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

  startLocationInput: string = '';
  endLocationInput: string = '';
  startLatLng: L.LatLngTuple = [48.137154, 11.576124]; // München default
  endLatLng: L.LatLngTuple = [52.520008, 13.404954]; // Berlin default

  distance: number = 0;
  co2Emissions: number = 0;
  cost: number = 0;
  private airportIcon: L.Icon = L.icon({
    iconUrl: 'assets/airport-icon.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowUrl: 'assets/leaflet/marker-shadow.png',
    shadowSize: [41, 41]
  });

  constructor(
    private routingService: RoutingService,
    private httpService: HttpService
  ) {
  }

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

  ngAfterViewInit(): void {
    this.initializeMap();

    const routeData = this.routingService.routeData();
    if (routeData?.startLocation?.lat && routeData?.endLocation?.lat) {
      // Only load route if data was passed from another page
      this.loadRoute();
    }
  }

  private initializeMap(): void {
    this.initializeLeafletMarkerIcons();
    this.map = L.map('map').setView([48.137154, 11.576124], 5); // Use a wider zoom level initially

    // Add OSM tiles with custom styling class
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      className: 'styled-tiles', // This class is already styled in your CSS
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    this.routeLayer = L.layerGroup().addTo(this.map);
  }

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
    const modeMap: Record<string, string> = {
      'driving': 'driving',
      'Auto': 'driving',
      'train': 'train',
      'Zug': 'train',
      'flight': 'flight',
      'Flugzeug': 'flight',
      'driving-flight': 'driving-flight'
    };

    this.transportMode = modeMap[mode] || 'driving';
  }

  onTransportChange(event: any) {
    this.mapTransportMode(event.target.value);
    if (this.isValidLatLng(this.startLatLng) && this.isValidLatLng(this.endLatLng)) {
      this.loadRoute();
    }
  }

  searchLocations() {
    console.log('Suche Orte:', this.startLocationInput, this.endLocationInput);

    forkJoin([
      this.httpService.geocode(this.startLocationInput).pipe(
        tap(result => console.log('Start-Ergebnis:', result)),
        catchError(err => {
          console.error('Fehler bei Start-Geocoding:', err);
          return of(null);
        })
      ),
      this.httpService.geocode(this.endLocationInput).pipe(
        tap(result => console.log('Ziel-Ergebnis:', result)),
        catchError(err => {
          console.error('Fehler bei Ziel-Geocoding:', err);
          return of(null);
        })
      )
    ]).subscribe(([startLocation, endLocation]) => {
      console.log('Subscribe wurde ausgelöst');
      console.log('Start:', startLocation);
      console.log('Ziel:', endLocation);

      if (startLocation) {
        this.startLatLng = [startLocation.lat, startLocation.lon];
      }

      if (endLocation) {
        this.endLatLng = [endLocation.lat, endLocation.lon];
      }

      this.loadRoute();
    });
  }

  loadRoute() {
    if (!this.isValidLatLng(this.startLatLng) || !this.isValidLatLng(this.endLatLng)) {
      console.log('Invalid coordinates, not loading route');
      return;
    }

    this.routeLayer.clearLayers();

    switch (this.transportMode) {
      case 'driving':
        this.loadDrivingRoute();
        break;
      case 'train':
        this.loadTrainRoute();
        break;
      case 'flight':
        this.loadFlightRoute();
        break;
      case 'driving-flight':
        this.loadAutoFlightRoute();
        break;
    }
  }

  private isValidLatLng(latLng: L.LatLngTuple): boolean {
    // Check if the coordinates are non-zero and in reasonable range
    return latLng &&
      latLng[0] !== 0 &&
      latLng[1] !== 0 &&
      Math.abs(latLng[0]) <= 90 &&
      Math.abs(latLng[1]) <= 180;
  }

  private loadDrivingRoute() {
    const request: RoutingRequest = {
      startLat: this.startLatLng[0],
      startLon: this.startLatLng[1],
      endLat: this.endLatLng[0],
      endLon: this.endLatLng[1],
      mode: 'driving'
    };

    this.httpService.getRoute(request).subscribe({
      next: (data) => {
        if (data.features && data.features.length > 0) {
          // Extract distance from the summary in meters
          const distanceInMeters = data.features[0].properties.summary.distance;
          this.distance = Math.round(distanceInMeters / 1000 * 10) / 10;

          // Draw the route
          const routeCoords: L.LatLngTuple[] = data.features[0].geometry.coordinates.map(
            (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
          );
          L.polyline(routeCoords, {color: 'blue'}).addTo(this.routeLayer);

          // Create bounds and fit map
          this.fitMapToBounds([this.startLatLng, this.endLatLng]);

          // Calculate metrics
          this.calculateMetricsFromAPI('driving');
        } else {
          this.handleRouteError();
        }
      },
      error: () => this.handleRouteError()
    });
  }

  private loadTrainRoute() {
    const request: RoutingRequest = {
      startLat: this.startLatLng[0],
      startLon: this.startLatLng[1],
      endLat: this.endLatLng[0],
      endLon: this.endLatLng[1],
      mode: 'train'
    };

    this.httpService.getRoute(request).subscribe({
      next: (data) => {
        if (data.features && data.features.length > 0) {
          const distanceInMeters = data.features[0].properties.summary.distance;
          this.distance = Math.round(distanceInMeters / 1000 * 10) / 10;

          const routeCoords: L.LatLngTuple[] = data.features[0].geometry.coordinates.map(
            (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
          );
          L.polyline(routeCoords, {color: 'green', weight: 4}).addTo(this.routeLayer);

          // Create bounds and fit map
          this.fitMapToBounds([this.startLatLng, this.endLatLng]);

          // Calculate metrics
          this.calculateMetricsFromAPI('train');
        } else {
          this.handleRouteError('green', 4);
        }
      },
      error: () => this.handleRouteError('green', 4)
    });
  }

  private loadFlightRoute() {
    forkJoin([
      this.findNearestAirport(this.startLatLng[0], this.startLatLng[1]),
      this.findNearestAirport(this.endLatLng[0], this.endLatLng[1])
    ]).subscribe(([startAirport, endAirport]) => {
      this.routeLayer.clearLayers();

      let startPoint = this.startLatLng;
      let endPoint = this.endLatLng;

      if (startAirport) {
        startPoint = [startAirport.lat, startAirport.lon];
        L.marker(this.startLatLng).addTo(this.routeLayer)
          .bindPopup(`Departure: ${startAirport.display_name}`);
      }

      if (endAirport) {
        endPoint = [endAirport.lat, endAirport.lon];
        L.marker(endPoint).addTo(this.routeLayer)
          .bindPopup(`Arrival: ${endAirport.display_name}`);
      }

      this.calculateDirectDistance();

      // Create a curved flight path
      const points = this.createGreatCircleArc(startPoint, endPoint, 100);

      // Draw the flight route
      L.polyline(points, {
        color: 'red',
        weight: 3,
        opacity: 0.7
      }).addTo(this.routeLayer);

      // Fit map to bounds
      this.fitMapToBounds([this.startLatLng, endPoint]);

      // Calculate metrics
      this.calculateMetricsFromAPI('flight');
    });
  }

  private loadAutoFlightRoute() {
    // Originale Punkte speichern
    const originalStart = [...this.startLatLng] as L.LatLngTuple;
    const originalEnd = [...this.endLatLng] as L.LatLngTuple;
    const startName = this.startLocationInput;
    const endName = this.endLocationInput;

    forkJoin([
      this.findNearestAirport(originalStart[0], originalStart[1]),
      this.findNearestAirport(originalEnd[0], originalEnd[1])
    ]).pipe(
      switchMap(([startAirport, endAirport]) => {
        if (!startAirport || !endAirport) {
          throw new Error('Keine passenden Flughäfen gefunden');
        }

        // Marker für Originalpunkte hinzufügen
        L.marker(originalStart).addTo(this.routeLayer)
          .bindPopup(`Start: ${startName}`);
        L.marker(originalEnd).addTo(this.routeLayer)
          .bindPopup(`Ziel: ${endName}`);

        const startAirportPoint: L.LatLngTuple = [startAirport.lat, startAirport.lon];
        const endAirportPoint: L.LatLngTuple = [endAirport.lat, endAirport.lon];

        // Flughafen-Marker hinzufügen
        L.marker(startAirportPoint).addTo(this.routeLayer)
          .bindPopup(`Abflughafen: ${startAirport.display_name}`)
          .setIcon(this.airportIcon);

        L.marker(endAirportPoint).addTo(this.routeLayer)
          .bindPopup(`Ankunftsflughafen: ${endAirport.display_name}`)
          .setIcon(this.airportIcon);

        // Flugdistanz berechnen
        const flightDistanceInMeters = L.latLng(startAirportPoint[0], startAirportPoint[1])
          .distanceTo(L.latLng(endAirportPoint[0], endAirportPoint[1]));
        const flightDistance = flightDistanceInMeters / 1000;

        // Flugpfad zeichnen
        const flightPoints = this.createGreatCircleArc(startAirportPoint, endAirportPoint, 100);
        L.polyline(flightPoints, {
          color: 'red',
          weight: 3,
          opacity: 0.7
        }).addTo(this.routeLayer);

        // Auto-Routen mit Fallback zur Snap-To-Road-API holen
        return forkJoin([
          this.getCarRouteWithFallback(originalStart, startAirportPoint),
          this.getCarRouteWithFallback(endAirportPoint, originalEnd),
          of(flightDistance)
        ]);
      })
    ).subscribe({
      next: ([routeToAirport, routeFromAirport, flightDistance]) => {
        // Gesamtdistanz berechnen
        const distanceToAirport = routeToAirport?.distance || 0;
        const distanceFromAirport = routeFromAirport?.distance || 0;

        this.distance = Math.round((flightDistance + distanceToAirport + distanceFromAirport) * 10) / 10;

        // Kombinierte Metriken berechnen
        this.calculateCombinedMetrics(flightDistance, distanceToAirport, distanceFromAirport);
      },
      error: (error) => {
        console.error('Fehler beim Laden der Auto-Flug-Route:', error);
        this.handleRouteError('Konnte keine Route finden.');
      }
    });
  }

  private getCarRouteWithFallback(start: L.LatLngTuple, end: L.LatLngTuple): Observable<{
    route: L.LatLngTuple[],
    distance: number
  }> {
    const request: RoutingRequest = {
      startLat: start[0],
      startLon: start[1],
      endLat: end[0],
      endLon: end[1],
      mode: 'driving'
    };

    return this.httpService.getRoute(request).pipe(
      catchError(error => {
        console.warn('Fehler bei der Routenberechnung, verwende Snap-To-Road als Fallback:', error);
        return this.useSnapToRoadFallback(start, end);
      }),
      switchMap(data => {
        if (data.features && data.features.length > 0) {
          // Route und Distanz extrahieren
          const routeCoords: L.LatLngTuple[] = data.features[0].geometry.coordinates.map(
            (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
          );
          const distance = data.features[0].properties.summary.distance / 1000;

          // Route zeichnen
          L.polyline(routeCoords, {color: 'blue', weight: 3}).addTo(this.routeLayer);

          return of({route: routeCoords, distance});
        }

        // Wenn keine Route gefunden wurde, zur Snap-To-Road-API wechseln
        console.warn('Keine Route gefunden, verwende Snap-To-Road als Fallback');
        return this.useSnapToRoadFallback(start, end);
      })
    );
  }

  private useSnapToRoadFallback(start: L.LatLngTuple, end: L.LatLngTuple): Observable<{
    route: L.LatLngTuple[],
    distance: number
  }> {
    // Snap Startpunkt zur nächsten Straße
    return this.snapPointToRoad(start).pipe(
      switchMap(snappedStart => {
        // Snap Endpunkt zur nächsten Straße
        return this.snapPointToRoad(end).pipe(
          switchMap(snappedEnd => {
            const startPoint = snappedStart || start;
            const endPoint = snappedEnd || end;

            // Versuche eine Route zwischen den gesnappten Punkten zu erhalten
            const routingRequest: RoutingRequest = {
              startLat: startPoint[0],
              startLon: startPoint[1],
              endLat: endPoint[0],
              endLon: endPoint[1],
              mode: 'driving'
            };

            return this.httpService.getRoute(routingRequest).pipe(
              map(data => {
                if (data.features && data.features.length > 0) {
                  // Route und Distanz extrahieren
                  const routeCoords: L.LatLngTuple[] = data.features[0].geometry.coordinates.map(
                    (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
                  );
                  const distance = data.features[0].properties.summary.distance / 1000;

                  // Route zeichnen
                  L.polyline(routeCoords, {color: 'blue', weight: 3}).addTo(this.routeLayer);

                  return {route: routeCoords, distance};
                } else {
                  // Wenn immer noch keine Route gefunden wurde, zeichne gestrichelte Linie
                  const directLine = [startPoint, endPoint];
                  L.polyline(directLine, {
                    color: 'blue',
                    dashArray: '5, 10',
                    weight: 3
                  }).addTo(this.routeLayer);

                  // Direkte Distanz berechnen
                  const directDistance = L.latLng(startPoint[0], startPoint[1])
                    .distanceTo(L.latLng(endPoint[0], endPoint[1])) / 1000;

                  return {route: directLine, distance: directDistance};
                }
              }),
              catchError(error => {
                console.warn('Fehler beim Routing nach Snap-To-Road, verwende direkte Linie:', error);

                // Fallback: Direkte Linie zwischen den gesnappten Punkten
                const directLine = [startPoint, endPoint];
                L.polyline(directLine, {
                  color: 'blue',
                  dashArray: '5, 10',
                  weight: 3
                }).addTo(this.routeLayer);

                // Direkte Distanz berechnen
                const directDistance = L.latLng(startPoint[0], startPoint[1])
                  .distanceTo(L.latLng(endPoint[0], endPoint[1])) / 1000;

                return of({route: directLine, distance: directDistance});
              })
            );
          })
        );
      })
    );
  }

  private snapPointToRoad(point: L.LatLngTuple): Observable<L.LatLngTuple | null> {
    const request: SnapToRoadRequest = {
      lat: point[0],
      lon: point[1],
      radius: 5000 // 5km Suchradius
    };

    return this.httpService.snapToRoad(request).pipe(
      map(result => {
        if (result && result.lat && result.lon) {
          return [result.lat, result.lon] as L.LatLngTuple;
        }
        return null;
      }),
      catchError(error => {
        console.error('Fehler bei Snap-To-Road:', error);
        return of(null);
      })
    );
  }

  private findNearestAirport(lat: number, lon: number): Observable<GeocodingResult | null> {
    return this.httpService.findNearestAirport(lat, lon).pipe(
      catchError(error => {
        console.error('Error finding nearest airport:', error);
        return of(null);
      })
    );
  }

  private handleRouteError(color: string = 'red', weight: number = 3) {
    this.calculateDirectDistance();
    L.polyline([this.startLatLng, this.endLatLng], {
      color,
      dashArray: '5, 10',
      weight
    }).addTo(this.routeLayer);

    this.fitMapToBounds([this.startLatLng, this.endLatLng]);
    this.calculateMetricsFromAPI(this.transportMode as 'driving' | 'train' | 'flight');
  }

  private calculateDirectDistance() {
    const start = L.latLng(this.startLatLng[0], this.startLatLng[1]);
    const end = L.latLng(this.endLatLng[0], this.endLatLng[1]);
    const distanceInMeters = start.distanceTo(end);
    this.distance = Math.round(distanceInMeters / 1000 * 10) / 10;
  }

  private calculateMetricsFromAPI(mode: 'driving' | 'train' | 'flight') {
    const request = {
      mode,
      distance: this.distance
    };

    this.httpService.calculateMetrics(request).subscribe({
      next: (response: MetricsResponse) => {
        this.co2Emissions = response.co2Emissions;
        this.cost = response.cost;
      },
      error: () => {
      }
    });
  }

  private calculateCombinedMetrics(flightDistance: number, carDistanceToAirport: number, carDistanceFromAirport: number) {
    const totalCarDistance = carDistanceToAirport + carDistanceFromAirport;

    // Einzelne Berechnungen für Auto und Flug
    forkJoin([
      this.httpService.calculateMetrics({
        mode: 'driving',
        distance: totalCarDistance
      }),
      this.httpService.calculateMetrics({
        mode: 'flight',
        distance: flightDistance
      })
    ]).subscribe({
      next: ([carMetrics, flightMetrics]) => {
        // Summiere die Ergebnisse
        this.co2Emissions = Math.round((carMetrics.co2Emissions + flightMetrics.co2Emissions) * 10) / 10;
        this.cost = Math.round((carMetrics.cost + flightMetrics.cost) * 10) / 10;
      },
      error: (error) => {
        console.error('Fehler bei der Berechnung der kombinierten Metriken:', error);
        // Fallback auf die bestehende Methode
        const request = {
          mode: 'flight' as 'driving' | 'train' | 'flight',
          distance: this.distance,
          combinedRoute: {
            flightDistance,
            carDistanceToAirport,
            carDistanceFromAirport
          }
        };

        this.httpService.calculateMetrics(request).subscribe({
          next: (response: MetricsResponse) => {
            this.co2Emissions = response.co2Emissions;
            this.cost = response.cost;
          },
          error: () => {
          }
        });
      }
    });
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

      const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
      const lng = Math.atan2(y, x);

      points.push([this.toDegrees(lat), this.toDegrees(lng)]);
    }

    return points;
  }

  private fitMapToBounds(points: L.LatLngTuple[]) {
    const bounds = L.latLngBounds(points);
    this.map.fitBounds(bounds);
  }

  private toRadians(degrees: number): number {
    return degrees * Math.PI / 180;
  }

  private toDegrees(radians: number): number {
    return radians * 180 / Math.PI;
  }
}
