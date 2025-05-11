import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {HttpClientModule} from '@angular/common/http';
import {FlightApiService} from '../../service/flight-api/flight-api.service';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatNativeDateModule} from '@angular/material/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {CommonModule} from '@angular/common';
import {forkJoin} from 'rxjs';
import {switchMap} from 'rxjs/operators';
import {MatButtonToggle, MatButtonToggleGroup} from '@angular/material/button-toggle';

interface Flight {
  id: string;
  price: number;
  airline: string;
  departure: string;
  arrival: string;
  duration: number;
  direct: boolean;
  token: string;
  origin: string;
  destination: string;
  returnDeparture?: string; // optional, da nicht jeder Flug ein Rückflug ist
  returnArrival?: string;   // optional, da nicht jeder Flug ein Rückflug ist
}


@Component({
  selector: 'app-flights',
  imports: [
    CommonModule,
    HttpClientModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatNativeDateModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonToggle,
    MatButtonToggleGroup
  ],
  templateUrl: './flights.component.html',
  styleUrl: './flights.component.css',
  standalone: true,
  providers: []
})
export class FlightsComponent implements OnInit {

  @Input() origin = 'Düsseldorf';
  @Input() destination = 'München';
  @Input() departDate = '2025-05-07';
  @Input() returnDate = '';
  @Input() isRoundtrip = false;
  @Input() selectedMode: 'flug' | 'auto' | 'zug' = 'flug';
  flights: Flight[] = [];
  selectedFlight: any = null;
  loading = false;
  error = '';
  showAllFlights = false;

  trainJourneys: any[] = [];

  activeFilter: 'none' | 'cheapest' | 'fastest' = 'none';
  originalFlights: Flight[] = [];
  originalTrainJourneys: any[] = [];

  @Output() flightDataLoaded = new EventEmitter<{
    flightPrice: number;
    flightDuration: number;
    trainPrice: number;
    trainDuration: number;
  }>();

  constructor(private apiService: FlightApiService) {
  }

  ngOnInit() {
    // Automatisch bei Initialisierung laden
    this.searchFlights();
    this.searchTrain();
  }

  private notifyDataLoaded() {
    let flightPrice = 0;
    let flightDuration = 0;
    let trainPrice = 0;
    let trainDuration = 0;

    if (this.flights.length > 0) {
      const cheapestFlight = [...this.flights].sort((a, b) => a.price - b.price)[0];
      const fastestFlight = [...this.flights].sort((a, b) => a.duration - b.duration)[0];
      flightPrice = cheapestFlight.price;
      flightDuration = fastestFlight.duration;
    }

    if (this.trainJourneys.length > 0) {
      // Ähnliche Logik wie im MapPageComponent
      const prices = this.trainJourneys.map(journey => {
        return (journey.outbound?.price || 0) +
          (this.isRoundtrip && journey.inbound ? journey.inbound.price || 0 : 0);
      });
      trainPrice = Math.min(...prices.filter(p => p > 0));

      const durations = this.trainJourneys
        .map(journey => journey.outbound?.duration || 0)
        .filter(d => d > 0);
      trainDuration = durations.length > 0 ? Math.min(...durations) : 0;
    }

    this.flightDataLoaded.emit({
      flightPrice,
      flightDuration,
      trainPrice,
      trainDuration
    });
  }

  searchFlights() {
    this.loading = true;
    this.flights = [];
    this.selectedFlight = null;
    this.error = '';

    forkJoin({
      originCode: this.apiService.getAirportCode(this.origin),
      destCode: this.apiService.getAirportCode(this.destination)
    }).pipe(
      switchMap(codes => {
        if (!codes.originCode || !codes.destCode) {
          throw new Error('Flughafencodes konnten nicht ermittelt werden');
        }
        if (this.isRoundtrip && this.returnDate) {
          return this.apiService.searchRoundtripFlights(codes.originCode, codes.destCode, this.departDate, this.returnDate);
        } else {
          return this.apiService.searchFlights(codes.originCode, codes.destCode, this.departDate);
        }
      })
    ).subscribe({
      next: (response: any) => {
        // Die Verarbeitung der Flugdaten muss ggf. für Roundtrip angepasst werden
        if (response.data && response.data.itineraries) {
          this.flights = response.data.itineraries.map((itinerary: any) => {
            const leg = itinerary.legs[0];
            const carrier = leg.carriers.marketing[0];
            return {
              id: itinerary.id,
              price: itinerary.price.raw,
              airline: carrier.name,
              departure: leg.departure,
              arrival: leg.arrival,
              duration: leg.durationInMinutes,
              direct: leg.stopCount === 0,
              origin: leg.origin.name,
              destination: leg.destination.name,
              token: response.data.token,
              // Bei Roundtrip ggf. weitere Felder für Rückflug ergänzen!
              returnDeparture: itinerary.legs[1]?.departure,
              returnArrival: itinerary.legs[1]?.arrival
            };
          });
          this.loading = false;
        } else {
          this.error = 'Keine Flüge gefunden';
          this.loading = false;
        }

        this.originalFlights = [...this.flights];
        this.notifyDataLoaded()
      },
      error: (err) => {
        this.error = 'Fehler bei der Flugsuche: ' + err.message;
        this.loading = false;
      }
    });
  }

  getFlightDetails(flight: Flight) {
    this.loading = true;
    this.selectedFlight = null;

    this.apiService.getFlightDetails(flight.token!, flight.id).subscribe({
      next: (response: any) => {
        const pricingOptions = response.data?.itinerary?.pricingOptions;
        if (pricingOptions && pricingOptions.length > 0) {
          // Du kannst hier auch eine Auswahl anbieten, falls mehrere Optionen gewünscht sind
          const uri = pricingOptions[0].pricingItems[0]?.uri;
          if (uri) {
            window.open(uri, '_blank'); // Im neuen Tab öffnen
            // window.location.href = uri; // Im selben Tab öffnen
          } else {
            this.error = 'Keine Buchungs-URL gefunden';
          }
        } else {
          this.error = 'Keine Buchungsoptionen gefunden';
        }
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Fehler beim Abrufen der Buchungs-URL: ' + err.message;
        this.loading = false;
      }
    });
  }

  searchCar() {
    // Setze die Anzeige für Auto, z.B. ein Bild und Text
    this.flights = [];
    this.error = '';
    // Optional: eigene Properties für Auto-Anzeige setzen
  }

  searchTrain() {
    this.loading = true;
    this.error = '';
    this.trainJourneys = [];

    // Zuerst die City-IDs für beide Richtungen holen
    forkJoin([
      this.apiService.getFlixbusCityId(this.origin),
      this.apiService.getFlixbusCityId(this.destination)
    ]).subscribe({
      next: ([originCityId, destinationCityId]) => {
        if (!originCityId || !destinationCityId) {
          this.error = 'Keine gültigen Städte-IDs gefunden.';
          this.loading = false;
          return;
        }

        // Hilfsfunktion für das Mapping
        const mapTrips = (result: any, reverse = false) =>
          (result.journeys || []).map((trip: any, idx: number) => ({
            id: trip.id || 'F' + idx + (reverse ? '_r' : ''),
            provider: trip.segments?.[0]?.product === 'flixbus' ? 'FlixBus' : 'Bus/Zug',
            departure: trip.dep_offset,
            arrival: trip.arr_offset,
            duration: this.getDurationInMinutes(trip.dep_offset, trip.arr_offset),
            origin: trip.dep_name,
            destination: trip.arr_name,
            price: trip.fares?.[0]?.price ?? null,
            currency: trip.fares?.[0]?.currency ?? 'EUR',
            direct: trip.changeovers === 0,
            deeplink: trip.deeplink,
            isReturn: reverse
          }));

        // Nur Hin- oder Hin- und Rückfahrt?
        if (this.isRoundtrip && this.returnDate) {
          // Hole beide Richtungen parallel
          forkJoin([
            this.apiService.searchBusTrips(originCityId, destinationCityId, this.departDate),
            this.apiService.searchBusTrips(destinationCityId, originCityId, this.returnDate)
          ]).subscribe({
            next: ([outbound, inbound]) => {
              // Kombiniere Hin- und Rückfahrten paarweise (jeweils erste Hinfahrt mit erster Rückfahrt usw.)
              const journeys: any[] = [];
              const outTrips = mapTrips(outbound, false);
              const inTrips = mapTrips(inbound, true);

              // Du kannst auch alle Kombinationen bilden, hier werden sie paarweise kombiniert:
              const len = Math.max(outTrips.length, inTrips.length);
              for (let i = 0; i < len; i++) {
                journeys.push({
                  outbound: outTrips[i] || null,
                  inbound: inTrips[i] || null
                });
              }
              this.trainJourneys = journeys;
              this.loading = false;

              this.originalTrainJourneys = [...this.trainJourneys];
              this.notifyDataLoaded();
            },
            error: () => {
              this.error = 'Fehler beim Abrufen der Hin- oder Rückfahrt.';
              this.loading = false;
            }
          });
        } else {
          // Nur Hinfahrt
          this.apiService.searchBusTrips(originCityId, destinationCityId, this.departDate)
            .subscribe({
              next: (result: any) => {
                this.trainJourneys = mapTrips(result, false).map((journey: any) => ({
                  outbound: journey,
                  inbound: null
                }));
                this.loading = false;

                this.originalTrainJourneys = [...this.trainJourneys];
                this.notifyDataLoaded();
              },
              error: () => {
                this.error = 'Fehler beim Abrufen der Verbindungen.';
                this.loading = false;
              }
            });
        }
      },
      error: () => {
        this.error = 'Fehler beim Ermitteln der Städte-IDs.';
        this.loading = false;
      }
    });
  }

// Hilfsfunktion zur Berechnung der Dauer in Minuten
  getDurationInMinutes(dep: string, arr: string): number {
    const depDate = new Date(dep);
    const arrDate = new Date(arr);
    return Math.round((arrDate.getTime() - depDate.getTime()) / 60000);
  }


  onSearch() {
    switch (this.selectedMode) {
      case 'flug':
        this.searchFlights();
        break;
      case 'auto':
        this.searchCar();
        break;
      case 'zug':
        this.searchTrain();
        break;
      default:
        this.searchFlights();
    }

    this.activeFilter = 'none';
  }


  formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
  }

  get visibleFlights() {
    return this.showAllFlights ? this.flights : this.flights.slice(0, 9);
  }

  applyFilter(): void {
    if (this.activeFilter === 'none') {
      // Zurücksetzen auf ursprüngliche Listen
      this.flights = [...this.originalFlights];
      this.trainJourneys = [...this.originalTrainJourneys];
      return;
    }

    if (this.selectedMode === 'flug') {
      this.flights = [...this.originalFlights]; // Kopie erstellen

      if (this.activeFilter === 'cheapest') {
        this.flights.sort((a, b) => a.price - b.price);
      } else if (this.activeFilter === 'fastest') {
        this.flights.sort((a, b) => a.duration - b.duration);
      }

      // Optional: nur die besten 5 anzeigen
      this.flights = this.flights.slice(0, this.originalFlights.length);
    } else if (this.selectedMode === 'zug') {
      this.trainJourneys = [...this.originalTrainJourneys]; // Kopie erstellen

      if (this.activeFilter === 'cheapest') {
        this.trainJourneys.sort((a, b) => {
          const priceA = (a.outbound?.price || 0) + (this.isRoundtrip && a.inbound ? a.inbound.price || 0 : 0);
          const priceB = (b.outbound?.price || 0) + (this.isRoundtrip && b.inbound ? b.inbound.price || 0 : 0);
          return priceA - priceB;
        });
      } else if (this.activeFilter === 'fastest') {
        this.trainJourneys.sort((a, b) => {
          // Bei Hin- und Rückfahrt die Gesamtdauer berücksichtigen
          const durationA = a.outbound?.duration || 0;
          const durationB = b.outbound?.duration || 0;
          return durationA - durationB;
        });
      }

      // Optional: nur die besten 5 anzeigen
      this.trainJourneys = this.trainJourneys.slice(0, this.originalTrainJourneys.length);
    }
  }

  isBestOption(flight: Flight, filterType: string): boolean {
    if (filterType === 'none' || this.flights.length === 0) return false;

    if (filterType === 'cheapest') {
      return flight.price === Math.min(...this.flights.map(f => f.price));
    }

    if (filterType === 'fastest') {
      return flight.duration === Math.min(...this.flights.map(f => f.duration));
    }

    return false;
  }

  isBestTrainOption(pair: any, filterType: string): boolean {
    if (filterType === 'none' || this.trainJourneys.length === 0) return false;

    if (filterType === 'cheapest') {
      const totalPrice = (pair.outbound?.price || 0) +
        (this.isRoundtrip && pair.inbound ? pair.inbound.price || 0 : 0);
      const allPrices = this.trainJourneys.map(j =>
        (j.outbound?.price || 0) +
        (this.isRoundtrip && j.inbound ? j.inbound.price || 0 : 0)
      );
      return totalPrice === Math.min(...allPrices);
    }

    if (filterType === 'fastest') {
      const duration = pair.outbound?.duration || 0;
      const allDurations = this.trainJourneys.map(j => j.outbound?.duration || 0);
      return duration === Math.min(...allDurations);
    }

    return false;
  }

}
