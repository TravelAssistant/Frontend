import { Component } from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import {FlightApiService} from '../../service/flight-api/flight-api.service';
import {MatButton, MatIconButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';

@Component({
  selector: 'app-flights',
  imports: [
    HttpClientModule,
    MatButton
  ],
  templateUrl: './flights.component.html',
  styleUrl: './flights.component.css',
  standalone: true,
  providers: [FlightApiService]
})
export class FlightsComponent {
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

}
