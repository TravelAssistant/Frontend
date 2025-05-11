import {Component, OnInit, ViewChild} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {RoutingService} from "../../service/routing/routing.service";
import {HttpService} from "../../service/http/http.service";
import {catchError, forkJoin, of, tap} from "rxjs";
import {MapComponent} from "../map/map.component";
import {InputComponent} from '../input/input.component';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {CompareComponent} from '../compare/compare.component';
import {TransportMetrics} from "../compare/compare.component";
import {FlightsComponent} from "../flights/flights.component";

@Component({
  selector: 'app-map-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MapComponent, MatProgressSpinnerModule, InputComponent, CompareComponent, FlightsComponent],
  templateUrl: './map-page.component.html',
  styleUrl: './map-page.component.css'
})
export class MapPageComponent implements OnInit {

  @ViewChild(FlightsComponent) flightsComponent!: FlightsComponent;

  transportMode: string = 'driving';
  selectedTransportModeForFlights: 'flug' | 'auto' | 'zug' = 'flug';
  progressSpinner = false;

  startLocationInput: string = '';
  endLocationInput: string = '';
  travelDate: string = new Date().toISOString().split('T')[0];
  returnDate: string = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  tripType: 'oneway' | 'roundtrip' = 'oneway';
  startLatLng: [number, number] = [48.137154, 11.576124];
  endLatLng: [number, number] = [52.520008, 13.404954];

  distance: number = 0;
  co2Emissions: number = 0;
  cost: number = 0;
  currentTransportMode: string = 'driving';

  transportMetrics: TransportMetrics[] = [];

  // Speichern der Map-Daten für jeden Transportmodus
  mapMetrics: { [key: string]: TransportMetrics } = {};

  // Speichern der besten Flug/Zug-Preise und -Zeiten
  flightMetrics: { price: number, duration: number } = { price: 0, duration: 0 };
  trainMetrics: { price: number, duration: number } = { price: 0, duration: 0 };

  constructor(
    private routingService: RoutingService,
    private httpService: HttpService
  ) {
  }

  ngOnInit(): void {}

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

  // Diese Methode wird aufgerufen, wenn in der Compare-Komponente ein Transportmittel ausgewählt wird
  onTransportModeSelected(mode: string) {
    // Mapping von Transport-Modi zu Flights-Komponenten-Modi
    switch(mode) {
      case 'driving':
        this.selectedTransportModeForFlights = 'auto';
        break;
      case 'train':
        this.selectedTransportModeForFlights = 'zug';
        break;
      case 'driving-flight':
        this.selectedTransportModeForFlights = 'flug';
        break;
      default:
        this.selectedTransportModeForFlights = 'flug';
    }

    // Auch den Transport-Modus für die Map aktualisieren
    this.transportMode = mode;
  }

  private isValidLatLng(latLng: [number, number]): boolean {
    // Check if the coordinates are non-zero and in reasonable range
    return latLng &&
      latLng[0] !== 0 &&
      latLng[1] !== 0 &&
      Math.abs(latLng[0]) <= 90 &&
      Math.abs(latLng[1]) <= 180;
  }

  protected loadRoute() {
    // Nur zur Weiterleitung an die Map-Komponente
    // Die eigentliche Routenberechnung findet in der Map-Komponente statt
  }

  onStartLocationChange(value: string) {
    this.startLocationInput = value;
  }

  onEndLocationChange(value: string) {
    this.endLocationInput = value;
  }

  onTravelDateChange(value: string) {
    this.travelDate = value;
  }

  onReturnDateChange(value: string) {
    this.returnDate = value;
  }

  onTripTypeChange(value: 'oneway' | 'roundtrip') {
    this.tripType = value;
  }

  onRouteCalculated(event: { distance: number; co2Emissions: number; cost: number; transportMode: string; duration?: number }) {
    // Speichere die Daten aus der Map-Komponente
    this.mapMetrics[event.transportMode] = {
      mode: event.transportMode,
      distance: event.distance,
      co2Emissions: event.co2Emissions,
      cost: event.cost,
      duration: event.duration
    };

    console.log('Map-Metriken:', this.mapMetrics);

    // Aktualisiere die aktuellen Werte für die aktuelle Transportart
    if (event.transportMode === this.transportMode) {
      this.distance = event.distance;
      this.co2Emissions = event.co2Emissions;
      this.cost = event.cost;
      this.currentTransportMode = event.transportMode;
    }

    // Aktualisiere die Compare-Komponente
    this.updateCompareMetrics();
  }

  // Neue Methode zum Aktualisieren der Flug-Metriken
  updateFlightMetrics(cheapestPrice: number, fastestDuration: number) {
    this.flightMetrics = {
      price: cheapestPrice,
      duration: fastestDuration
    };
    this.updateCompareMetrics();
  }

  // Neue Methode zum Aktualisieren der Zug-Metriken
  updateTrainMetrics(cheapestPrice: number, fastestDuration: number) {
    this.trainMetrics = {
      price: cheapestPrice,
      duration: fastestDuration
    };
    this.updateCompareMetrics();
  }

  // Methode zum Zusammenführen der Daten und Aktualisieren der Compare-Komponente
  updateCompareMetrics() {
    this.transportMetrics = [];

    // Auto-Daten direkt übernehmen
    if (this.mapMetrics['driving']) {
      this.transportMetrics.push(this.mapMetrics['driving']);
    }

    // Für Züge: Preis und Zeit aus FlightsComponent, Rest aus MapComponent
    if (this.mapMetrics['train']) {
      this.transportMetrics.push({
        mode: 'train',
        distance: this.mapMetrics['train'].distance,
        co2Emissions: this.mapMetrics['train'].co2Emissions,
        cost: this.trainMetrics.price,
        duration: this.trainMetrics.duration
      });
    } else if (this.mapMetrics['train']) {
      this.transportMetrics.push(this.mapMetrics['train']);
    }

    // Für Flüge: Preis und Zeit aus FlightsComponent, Rest aus MapComponent
    if (this.mapMetrics['driving-flight'] && this.flightMetrics.price > 0) {
      this.transportMetrics.push({
        mode: 'driving-flight', // Für die Compare-Komponente
        distance: this.mapMetrics['driving-flight'].distance,
        co2Emissions: this.mapMetrics['driving-flight'].co2Emissions,
        cost: this.flightMetrics.price,
        duration: this.flightMetrics.duration
      });
    } else if (this.mapMetrics['driving-flight']) {
      this.transportMetrics.push({
        ...this.mapMetrics['flight'],
        mode: 'driving-flight' // Für die Compare-Komponente
      });
    }
  }

  // Methode zum Extrahieren der besten Preise/Zeiten aus der FlightsComponent
  extractFlightsData() {
    if (!this.flightsComponent) return;

    // Extrahiere besten Flugpreis und -zeit
    if (this.flightsComponent.flights.length > 0) {
      const cheapestFlight = [...this.flightsComponent.flights].sort((a, b) => a.price - b.price)[0];
      const fastestFlight = [...this.flightsComponent.flights].sort((a, b) => a.duration - b.duration)[0];

      this.updateFlightMetrics(cheapestFlight.price, fastestFlight.duration);
    }

    // Extrahiere besten Zugpreis und -zeit
    if (this.flightsComponent.trainJourneys.length > 0) {
      const trainJourneys = this.flightsComponent.trainJourneys;

      // Berechne den billigsten Preis
      const prices = trainJourneys.map(journey => {
        return (journey.outbound?.price || 0) +
          (this.tripType === 'roundtrip' && journey.inbound ? journey.inbound.price || 0 : 0);
      });
      const cheapestPrice = Math.min(...prices.filter(p => p > 0));

      // Berechne die schnellste Zeit
      const durations = trainJourneys
        .map(journey => journey.outbound?.duration || 0)
        .filter(d => d > 0);
      const fastestDuration = durations.length > 0 ? Math.min(...durations) : 0;

      this.updateTrainMetrics(cheapestPrice, fastestDuration);
    }
  }

  // Füge eine Methode hinzu, die nach der Berechnung aller Routen aufgerufen wird
  onRoutesCalculated() {
    setTimeout(() => {
      this.extractFlightsData();
    }, 1000); // Gib der Flights-Komponente Zeit zum Laden der Daten
  }

  // Überschreibe die calculateRoute-Methode
  calculateRoute() {
    this.progressSpinner = true;
    this.transportMetrics = [];
    this.mapMetrics = {};
    this.flightMetrics = { price: 0, duration: 0 };
    this.trainMetrics = { price: 0, duration: 0 };

    // Original-Code beibehalten...
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
    ]).subscribe({
      next: ([startLocation, endLocation]) => {
        console.log('Subscribe wurde ausgelöst');
        if (startLocation) {
          this.startLatLng = [startLocation.lat, startLocation.lon];
        }
        if (endLocation) {
          this.endLatLng = [endLocation.lat, endLocation.lon];
        }
        this.progressSpinner = false;

        // Nach kurzer Verzögerung onRoutesCalculated aufrufen
        setTimeout(() => this.onRoutesCalculated(), 5000);
      },
      error: (err) => {
        console.error('Fehler beim Geocoding:', err);
        this.progressSpinner = false;
      },
      complete: () => {
        this.progressSpinner = false;
      }
    });
  }

  updateFlightAndTrainMetrics(data: any) {
    this.updateFlightMetrics(data.flightPrice, data.flightDuration);
    this.updateTrainMetrics(data.trainPrice, data.trainDuration);
  }
}
