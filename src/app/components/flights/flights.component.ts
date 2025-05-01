import { Component, OnInit } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { FlightApiService } from '../../service/flight-api/flight-api.service';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatNativeDateModule } from '@angular/material/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { forkJoin } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import {MatCheckbox} from '@angular/material/checkbox';
import {MatSlideToggle} from '@angular/material/slide-toggle';
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
    MatCheckbox,
    MatSlideToggle,
    MatButtonToggle,
    MatButtonToggleGroup
  ],
  templateUrl: './flights.component.html',
  styleUrl: './flights.component.css',
  standalone: true,
  providers: [FlightApiService]
})
export class FlightsComponent implements OnInit{

  origin = 'Düsseldorf';
  destination = 'München';
  departDate = '2025-05-07';
  flights: Flight[] = [];
  selectedFlight: any = null;
  loading = false;
  error = '';
  showAllFlights = false;
  returnDate = '';
  isRoundtrip = false;

  //für Flixbus
  trips: any[] = [];

// Umschalt-Status: 'flug', 'auto', 'zug'
  selectedMode: 'flug' | 'auto' | 'zug' = 'flug';

// Mockdaten für Zug/Bus
  trainJourneys = [
    {
      id: 'T1',
      provider: 'Deutsche Bahn',
      departure: '2025-04-24T07:15:00',
      arrival: '2025-04-24T11:30:00',
      duration: 255,
      origin: this.origin,
      destination: this.destination,
      price: 69.99,
      direct: true
    },
    {
      id: 'T2',
      provider: 'FlixTrain',
      departure: '2025-04-24T09:45:00',
      arrival: '2025-04-24T14:10:00',
      duration: 265,
      origin: this.origin,
      destination: this.destination,
      price: 39.90,
      direct: false
    },
    {
      id: 'T3',
      provider: 'FlixTrain',
      departure: '2025-04-24T09:45:00',
      arrival: '2025-04-24T14:10:00',
      duration: 265,
      origin: this.origin,
      destination: this.destination,
      price: 29.90,
      direct: false
    },
    {
      id: 'T4',
      provider: 'FlixTrain',
      departure: '2025-04-24T09:45:00',
      arrival: '2025-04-24T14:10:00',
      duration: 265,
      origin: this.origin,
      destination: this.destination,
      price: 59.90,
      direct: false
    },
    {
      id: 'T5',
      provider: 'FlixTrain',
      departure: '2025-04-24T09:45:00',
      arrival: '2025-04-24T14:10:00',
      duration: 265,
      origin: this.origin,
      destination: this.destination,
      price: 99.90,
      direct: true
    }
  ];

  constructor(private apiService: FlightApiService){}

  click() {
    this.apiService.getAllFlights('PARI', 'MSYA').subscribe(
      data => {
        console.log(data);
      },
      error => {
        console.error(error);
      }
    );
  }

  ngOnInit() {
    // Automatisch bei Initialisierung laden
    this.searchFlights();
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
    // Hier werden Mockdaten für Zug/Bus gesetzt
    this.flights = []; // Leere ggf. Flugdaten
    this.error = '';
    this.trainJourneys = [
      {
        id: 'T1',
        provider: 'Deutsche Bahn',
        departure: '2025-04-24T07:15:00',
        arrival: '2025-04-24T11:30:00',
        duration: 255,
        origin: this.origin,
        destination: this.destination,
        price: 69.99,
        direct: true
      }
    ];
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
  }




  formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  get visibleFlights() {
    return this.showAllFlights ? this.flights : this.flights.slice(0, 9);
  }


  searchTrips() {
    this.loading = true;
    this.error = '';
    forkJoin([
      this.apiService.getFlixbusStopId(this.origin),
      this.apiService.getFlixbusStopId(this.destination)
    ]).subscribe({
      next: ([originId, destinationId]) => {
        if (!originId || !destinationId) {
          this.error = 'Keine gültigen Stop-IDs gefunden.';
          this.trips = [];
          this.loading = false;
          return;
        }
        this.apiService.searchBusTrips(originId, destinationId, this.departDate)
          .subscribe({
            next: (result: any) => {
              this.trips = result.journeys || [];
              this.loading = false;
            },
            error: () => {
              this.error = 'Fehler beim Abrufen der Verbindungen.';
              this.trips = [];
              this.loading = false;
            }
          });
      },
      error: () => {
        this.error = 'Fehler beim Ermitteln der Stop-IDs.';
        this.trips = [];
        this.loading = false;
      }
    });
  }






}
