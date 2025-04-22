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
    ReactiveFormsModule
  ],
  templateUrl: './flights.component.html',
  styleUrl: './flights.component.css',
  standalone: true,
  providers: [FlightApiService]
})
export class FlightsComponent implements OnInit{

  origin = 'Düsseldorf';
  destination = 'München';
  departDate = '2025-04-24';
  flights: Flight[] = [];
  selectedFlight: any = null;
  loading = false;
  error = '';
  showAllFlights = false;


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

    // 1. Flughafencodes für Start und Ziel ermitteln
    forkJoin({
      originCode: this.apiService.getAirportCode(this.origin),
      destCode: this.apiService.getAirportCode(this.destination)
    }).pipe(
      switchMap(codes => {
        if (!codes.originCode || !codes.destCode) {
          throw new Error('Flughafencodes konnten nicht ermittelt werden');
        }

        // 2. Flugsuche mit den Flughafencodes und Datum
        return this.apiService.searchFlights(codes.originCode, codes.destCode, this.departDate);
      })
    ).subscribe({
      next: (response: any) => {
        if (response.data && response.data.itineraries) {
          // Flugdaten verarbeiten und in unser Format umwandeln
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
              token: response.data.token
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


}
