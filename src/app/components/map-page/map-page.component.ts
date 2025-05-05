import {Component, OnInit} from '@angular/core';
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

@Component({
  selector: 'app-map-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MapComponent, MatProgressSpinnerModule, InputComponent, CompareComponent],
  templateUrl: './map-page.component.html',
  styleUrl: './map-page.component.css'
})
export class MapPageComponent implements OnInit {
  transportMode: string = 'driving';
  progressSpinner = false;

  startLocationInput: string = '';
  endLocationInput: string = '';
  travelDate: string = new Date().toISOString().split('T')[0]; // Heutiges Datum als Standardwert
  startLatLng: [number, number] = [48.137154, 11.576124]; // München default
  endLatLng: [number, number] = [52.520008, 13.404954]; // Berlin default

  distance: number = 0;
  co2Emissions: number = 0;
  cost: number = 0;
  currentTransportMode: string = 'driving';

  transportMetrics: TransportMetrics[] = [];

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

  calculateRoute() {
    this.progressSpinner = true;

    this.transportMetrics = [];

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
        console.log('Start:', startLocation);
        console.log('Ziel:', endLocation);

        if (startLocation) {
          this.startLatLng = [startLocation.lat, startLocation.lon];
        }

        if (endLocation) {
          this.endLatLng = [endLocation.lat, endLocation.lon];
        }

        this.progressSpinner = false;
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

  onRouteCalculated(event: { distance: number; co2Emissions: number; cost: number; transportMode: string; duration?: number }) {
    // Metrik zum Array hinzufügen oder aktualisieren
    const existingMetricIndex = this.transportMetrics.findIndex(metric => metric.mode === event.transportMode);

    const newMetric: TransportMetrics = {
      mode: event.transportMode,
      distance: event.distance,
      co2Emissions: event.co2Emissions,
      cost: event.cost,
      duration: event.duration
    };

    if (existingMetricIndex >= 0) {
      this.transportMetrics[existingMetricIndex] = newMetric;
    } else {
      this.transportMetrics.push(newMetric);
    }

    // Aktualisiere die aktuellen Werte, wenn der aktuelle Transportmodus übereinstimmt
    if (event.transportMode === this.transportMode) {
      this.distance = event.distance;
      this.co2Emissions = event.co2Emissions;
      this.cost = event.cost;
      this.currentTransportMode = event.transportMode;
    }
  }
}
