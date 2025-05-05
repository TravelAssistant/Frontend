import {AfterViewInit, Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges} from '@angular/core';
import * as L from 'leaflet';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {
    GeocodingResult,
    HttpService,
    MetricsResponse,
    RoutingRequest,
    SnapToRoadRequest
} from "../../service/http/http.service";
import {catchError, forkJoin, map, Observable, of, switchMap} from "rxjs";

@Component({
    selector: 'app-map',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './map.component.html',
    styleUrl: './map.component.css'
})
export class MapComponent implements OnInit, AfterViewInit, OnChanges {
    @Input() startLatLng: L.LatLngTuple = [48.137154, 11.576124]; // München default
    @Input() endLatLng: L.LatLngTuple = [52.520008, 13.404954]; // Berlin default
    @Input() transportMode: string = 'driving';
    @Input() startLocationName: string = '';
    @Input() endLocationName: string = '';

    @Output() routeCalculated = new EventEmitter<{
        distance: number;
        co2Emissions: number;
        cost: number;
        transportMode: string;
    }>();

    private map!: L.Map;
    private routeLayer!: L.LayerGroup;
    private currentDistance: number = 0;

    // Variablen für die sequenzielle Ausführung aller Transportmodi
    private allTransportModes = ['driving', 'train', 'flight', 'driving-flight'];
    private currentModeIndex = 0;
    private isSequenceRunning = false;
    private routeLayers: { [key: string]: L.LayerGroup } = {};
    private routeColors: { [key: string]: string } = {
        'driving': 'blue',
        'train': 'green',
        'flight': 'red',
        'driving-flight': 'purple'
    };

    private airportIcon: L.Icon = L.icon({
        iconUrl: 'assets/airport-icon.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: 'assets/leaflet/marker-shadow.png',
        shadowSize: [41, 41]
    });

    constructor(
        private httpService: HttpService
    ) {
    }

    ngOnInit(): void {
        // Initialisierungslogik
    }

    ngAfterViewInit(): void {
        this.initializeMap();
        if (this.isValidLatLng(this.startLatLng) && this.isValidLatLng(this.endLatLng)) {
            this.runAllTransportModes();
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (!this.map) return;

        const shouldReloadRoute =
            (changes['startLatLng'] && !this.isSameLatLng(changes['startLatLng'].previousValue, changes['startLatLng'].currentValue)) ||
            (changes['endLatLng'] && !this.isSameLatLng(changes['endLatLng'].previousValue, changes['endLatLng'].currentValue));

        // Wenn nur der Transportmodus geändert wurde, nur diesen Modus laden
        const onlyTransportModeChanged =
            (changes['transportMode'] && changes['transportMode'].previousValue !== changes['transportMode'].currentValue) &&
            !shouldReloadRoute;

        if (onlyTransportModeChanged) {
            if (this.isValidLatLng(this.startLatLng) && this.isValidLatLng(this.endLatLng)) {
                this.loadRoute();
            }
        } else if (shouldReloadRoute && this.isValidLatLng(this.startLatLng) && this.isValidLatLng(this.endLatLng)) {
            // Bei neuen Punkten alle Transportmodi nacheinander ausführen
            this.runAllTransportModes();
        }
    }

    // Neue Methode zur sequenziellen Ausführung aller Transportmodi
    private runAllTransportModes(): void {
        // Initialisiere die Layer für jeden Transportmodus, falls noch nicht geschehen
        this.initializeRouteLayers();

        // Verstecke alle Layer zunächst
        this.hideAllRouteLayers();

        // Starte die Sequenz
        this.currentModeIndex = 0;
        this.isSequenceRunning = true;
        this.processNextTransportMode();
    }

    private initializeRouteLayers(): void {
        // Erstelle Layer-Gruppen für jeden Transportmodus
        this.allTransportModes.forEach(mode => {
            if (!this.routeLayers[mode]) {
                this.routeLayers[mode] = L.layerGroup().addTo(this.map);
                // Initial verstecken
                this.map.removeLayer(this.routeLayers[mode]);
            }
        });
    }

    private hideAllRouteLayers(): void {
        Object.values(this.routeLayers).forEach(layer => {
            this.map.removeLayer(layer);
        });
    }

    private processNextTransportMode(): void {
        if (this.currentModeIndex >= this.allTransportModes.length) {
            // Alle Modi wurden verarbeitet
            this.isSequenceRunning = false;
            return;
        }

        const currentMode = this.allTransportModes[this.currentModeIndex];
        this.transportMode = currentMode;
        this.routeLayer = this.routeLayers[currentMode];

        // Zeige den aktuellen Layer an
        if (!this.map.hasLayer(this.routeLayer)) {
            this.map.addLayer(this.routeLayer);
        }

        this.routeLayer.clearLayers();

        // Lade die Route für den aktuellen Transportmodus
        switch (currentMode) {
            case 'driving':
                this.loadDrivingRoute(true);
                break;
            case 'train':
                this.loadTrainRoute(true);
                break;
            case 'flight':
                this.loadFlightRoute(true);
                break;
            case 'driving-flight':
                this.loadAutoFlightRoute(true);
                break;
        }
    }

    private moveToNextTransportMode(): void {
        this.currentModeIndex++;
        this.processNextTransportMode();
    }

    private isSameLatLng(a: L.LatLngTuple | undefined, b: L.LatLngTuple | undefined): boolean {
        if (!a || !b) return false;
        return a[0] === b[0] && a[1] === b[1];
    }

    private initializeMap(): void {
        this.initializeLeafletMarkerIcons();
        this.map = L.map('map').setView([48.137154, 11.576124], 5); // Use a wider zoom level initially

        // Add OSM tiles with custom styling class
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            className: 'styled-tiles',
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

    loadRoute() {
        if (!this.isValidLatLng(this.startLatLng) || !this.isValidLatLng(this.endLatLng)) {
            console.log('Invalid coordinates, not loading route');
            return;
        }

        // Wenn eine Sequenz läuft, unterbrechen wir diese und zeigen nur den ausgewählten Modus
        if (this.isSequenceRunning) {
            this.isSequenceRunning = false;
        }

        this.hideAllRouteLayers();
        this.routeLayer = this.routeLayers[this.transportMode] || L.layerGroup().addTo(this.map);
        this.routeLayers[this.transportMode] = this.routeLayer;
        this.routeLayer.clearLayers();

        switch (this.transportMode) {
            case 'driving':
                this.loadDrivingRoute(false);
                break;
            case 'train':
                this.loadTrainRoute(false);
                break;
            case 'flight':
                this.loadFlightRoute(false);
                break;
            case 'driving-flight':
                this.loadAutoFlightRoute(false);
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

    private loadDrivingRoute(isPartOfSequence: boolean = false) {
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
                    const distance = Math.round(distanceInMeters / 1000 * 10) / 10;
                    this.currentDistance = distance;

                    // Draw the route
                    const routeCoords: L.LatLngTuple[] = data.features[0].geometry.coordinates.map(
                        (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
                    );
                    L.polyline(routeCoords, {color: this.routeColors['driving']}).addTo(this.routeLayer);

                    // Create bounds and fit map
                    this.fitMapToBounds([this.startLatLng, this.endLatLng]);

                    // Calculate metrics
                    this.calculateMetricsFromAPI('driving', distance, isPartOfSequence);

                    // Wenn Teil einer Sequenz, fahre fort
                    if (isPartOfSequence) {
                        this.moveToNextTransportMode();
                    }
                } else {
                    this.handleRouteError(isPartOfSequence);
                }
            },
            error: () => this.handleRouteError(isPartOfSequence)
        });
    }

    private loadTrainRoute(isPartOfSequence: boolean = false) {
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
                    const distance = Math.round(distanceInMeters / 1000 * 10) / 10;
                    this.currentDistance = distance;

                    const routeCoords: L.LatLngTuple[] = data.features[0].geometry.coordinates.map(
                        (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
                    );
                    L.polyline(routeCoords, {color: this.routeColors['train'], weight: 4}).addTo(this.routeLayer);

                    // Create bounds and fit map
                    this.fitMapToBounds([this.startLatLng, this.endLatLng]);

                    // Calculate metrics
                    this.calculateMetricsFromAPI('train', distance, isPartOfSequence);

                    // Wenn Teil einer Sequenz, fahre fort
                    if (isPartOfSequence) {
                        this.moveToNextTransportMode();
                    }
                } else {
                    this.handleRouteError(isPartOfSequence, this.routeColors['train'], 4);
                }
            },
            error: () => this.handleRouteError(isPartOfSequence, this.routeColors['train'], 4)
        });
    }

    private loadFlightRoute(isPartOfSequence: boolean = false) {
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

            const distance = this.calculateDirectDistance(isPartOfSequence);
            this.currentDistance = distance;

            // Create a curved flight path
            const points = this.createGreatCircleArc(startPoint, endPoint, 100);

            // Draw the flight route
            L.polyline(points, {
                color: this.routeColors['flight'],
                weight: 3,
                opacity: 0.7
            }).addTo(this.routeLayer);

            // Fit map to bounds
            this.fitMapToBounds([this.startLatLng, endPoint]);

            // Calculate metrics
            this.calculateMetricsFromAPI('flight', distance, isPartOfSequence);

            // Wenn Teil einer Sequenz, fahre fort
            if (isPartOfSequence) {
                this.moveToNextTransportMode();
            }
        });
    }

    private calculateDirectDistance(isPartOfSequence: boolean = false): number {
        const distance = this.calculateDirectDistanceValue();
        if (!isPartOfSequence) {
            this.routeCalculated.emit({
                distance,
                co2Emissions: 0,
                cost: 0,
                transportMode: this.transportMode
            });
        }
        return distance;
    }

    private calculateDirectDistanceValue(): number {
        const start = L.latLng(this.startLatLng[0], this.startLatLng[1]);
        const end = L.latLng(this.endLatLng[0], this.endLatLng[1]);
        const distanceInMeters = start.distanceTo(end);
        return Math.round(distanceInMeters / 1000 * 10) / 10;
    }

    private calculateMetricsFromAPI(mode: 'driving' | 'train' | 'flight', distance?: number, isPartOfSequence: boolean = false) {
        const routeDistance = distance || this.calculateDirectDistanceValue();
        const request = {
            mode,
            distance: routeDistance
        };

        this.httpService.calculateMetrics(request).subscribe({
            next: (response: MetricsResponse) => {
                this.routeCalculated.emit({
                    distance: routeDistance,
                    co2Emissions: response.co2Emissions,
                    cost: response.cost,
                    transportMode: mode
                });
            },
            error: () => {
                // Bei Fehler wenigstens die Distanz ausgeben
                this.routeCalculated.emit({
                    distance: routeDistance,
                    co2Emissions: 0,
                    cost: 0,
                    transportMode: mode
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

    private loadAutoFlightRoute(isPartOfSequence: boolean = false) {
        // Originale Punkte speichern
        const originalStart = [...this.startLatLng] as L.LatLngTuple;
        const originalEnd = [...this.endLatLng] as L.LatLngTuple;

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
                    .bindPopup(`Start: ${this.startLocationName}`);
                L.marker(originalEnd).addTo(this.routeLayer)
                    .bindPopup(`Ziel: ${this.endLocationName}`);

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
                    color: this.routeColors['driving-flight'],
                    weight: 3,
                    opacity: 0.7
                }).addTo(this.routeLayer);

                // Auto-Routen mit Fallback zur Snap-To-Road-API holen
                return forkJoin([
                    this.getCarRouteWithFallback(originalStart, startAirportPoint, this.routeColors['driving-flight']),
                    this.getCarRouteWithFallback(endAirportPoint, originalEnd, this.routeColors['driving-flight']),
                    of(flightDistance)
                ]);
            })
        ).subscribe({
            next: ([routeToAirport, routeFromAirport, flightDistance]) => {
                // Gesamtdistanz berechnen
                const distanceToAirport = routeToAirport?.distance || 0;
                const distanceFromAirport = routeFromAirport?.distance || 0;
                const totalDistance = Math.round((flightDistance + distanceToAirport + distanceFromAirport) * 10) / 10;
                this.currentDistance = totalDistance;

                // Kombinierte Metriken berechnen
                this.calculateCombinedMetrics(flightDistance, distanceToAirport, distanceFromAirport, totalDistance, isPartOfSequence);

                // Wenn Teil einer Sequenz, fahre fort
                if (isPartOfSequence) {
                    this.moveToNextTransportMode();
                }
            },
            error: (error) => {
                console.error('Fehler beim Laden der Auto-Flug-Route:', error);
                this.handleRouteError(isPartOfSequence, 'Auto-Flug-Route konnte nicht berechnet werden');

                // Wenn Teil einer Sequenz, fahre fort
                if (isPartOfSequence) {
                    this.moveToNextTransportMode();
                }
            }
        });
    }

    private findNearestAirport(lat: number, lon: number): Observable<GeocodingResult | null> {
        return this.httpService.findNearestAirport(lat, lon).pipe(
            catchError(error => {
                console.error('Error finding nearest airport:', error);
                return of(null);
            })
        );
    }

    private handleRouteError(isPartOfSequence: boolean = false, color: string = 'red', weight: number = 3) {
        const distance = this.calculateDirectDistance();
        this.currentDistance = distance;

        L.polyline([this.startLatLng, this.endLatLng], {
            color: typeof color === 'string' ? color : this.routeColors[this.transportMode] || 'red',
            dashArray: '5, 10',
            weight
        }).addTo(this.routeLayer);

        this.fitMapToBounds([this.startLatLng, this.endLatLng]);

        const mode = this.transportMode as 'driving' | 'train' | 'flight';
        if (mode === 'driving' || mode === 'train' || mode === 'flight') {
            this.calculateMetricsFromAPI(mode, distance, isPartOfSequence);
        } else {
            // Fallback für nicht unterstützte Transportmodi
            this.routeCalculated.emit({
                distance,
                co2Emissions: 0,
                cost: 0,
                transportMode: this.transportMode
            });
        }

        // Wenn Teil einer Sequenz, fahre fort
        if (isPartOfSequence) {
            this.moveToNextTransportMode();
        }
    }

    private getCarRouteWithFallback(start: L.LatLngTuple, end: L.LatLngTuple, routeColor: string = 'blue'): Observable<{
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
                return this.useSnapToRoadFallback(start, end, routeColor);
            }),
            switchMap(data => {
                if (data.features && data.features.length > 0) {
                    // Route und Distanz extrahieren
                    const routeCoords: L.LatLngTuple[] = data.features[0].geometry.coordinates.map(
                        (coord: number[]) => [coord[1], coord[0]] as L.LatLngTuple
                    );
                    const distance = data.features[0].properties.summary.distance / 1000;

                    // Route zeichnen
                    L.polyline(routeCoords, {color: routeColor, weight: 3}).addTo(this.routeLayer);

                    return of({route: routeCoords, distance});
                }

                // Wenn keine Route gefunden wurde, zur Snap-To-Road-API wechseln
                console.warn('Keine Route gefunden, verwende Snap-To-Road als Fallback');
                return this.useSnapToRoadFallback(start, end, routeColor);
            })
        );
    }

    private useSnapToRoadFallback(start: L.LatLngTuple, end: L.LatLngTuple, routeColor: string = 'blue'): Observable<{
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
                                    L.polyline(routeCoords, {color: routeColor, weight: 3}).addTo(this.routeLayer);

                                    return {route: routeCoords, distance};
                                } else {
                                    // Wenn immer noch keine Route gefunden wurde, zeichne gestrichelte Linie
                                    const directLine = [startPoint, endPoint];
                                    L.polyline(directLine, {
                                        color: routeColor,
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
                                    color: routeColor,
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

    private calculateCombinedMetrics(flightDistance: number, carDistanceToAirport: number, carDistanceFromAirport: number, totalDistance: number, isPartOfSequence: boolean = false) {
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
                const co2Emissions = Math.round((carMetrics.co2Emissions + flightMetrics.co2Emissions) * 10) / 10;
                const cost = Math.round((carMetrics.cost + flightMetrics.cost) * 10) / 10;

                // Emittiere die berechneten Werte
                this.routeCalculated.emit({
                    distance: totalDistance,
                    co2Emissions: co2Emissions,
                    cost: cost,
                    transportMode: 'driving-flight'
                });
            },
            error: (error) => {
                console.error('Fehler bei der Berechnung der kombinierten Metriken:', error);
                // Fallback auf die bestehende Methode
                const request = {
                    mode: 'flight' as 'driving' | 'train' | 'flight',
                    distance: totalDistance
                };

                this.httpService.calculateMetrics(request).subscribe({
                    next: (response: MetricsResponse) => {
                        this.routeCalculated.emit({
                            distance: totalDistance,
                            co2Emissions: response.co2Emissions,
                            cost: response.cost,
                            transportMode: 'driving-flight'
                        });
                    },
                    error: () => {
                        this.routeCalculated.emit({
                            distance: totalDistance,
                            co2Emissions: 0,
                            cost: 0,
                            transportMode: 'driving-flight'
                        });
                    }
                });
            }
        });
    }
}
