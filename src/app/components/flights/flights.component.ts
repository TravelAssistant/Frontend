import {Component, ViewChild} from '@angular/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import {FlightApiService} from '../../service/flight-api/flight-api.service';
import {MatButton, MatIconButton} from '@angular/material/button';
import {MatIcon} from '@angular/material/icon';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {CurrencyPipe} from '@angular/common';

const airportMapping: { [key: string]: string } = {
  DUS: "Düsseldorf International Airport",
  AAL: "Flughafen Aalborg",
  ABZ: "Flughafen Aberdeen Dyce",
  ACE: "Flughafen Lanzarote",
  AGP: "Flughafen Málaga",
  AMS: "Flughafen Amsterdam Schiphol",
  ATH: "Flughafen Athen Eleftherios Venizelos",
  BCN: "Flughafen Barcelona-El Prat",
  BDS: "Flughafen Brindisi",
  BGY: "Flughafen Bergamo Orio al Serio",
  BHX: "Flughafen Birmingham",
  BIA: "Flughafen Bastia-Poretta",
  BLL: "Flughafen Billund",
  BLQ: "Flughafen Bologna Guglielmo Marconi",
  BOD: "Flughafen Bordeaux-Mérignac",
  BRE: "Flughafen Bremen",
  BRU: "Flughafen Brüssel-Zaventem",
  BUD: "Flughafen Budapest Liszt Ferenc",
  CFU: "Flughafen Korfu Ioannis Kapodistrias",
  CGN: "Flughafen Köln/Bonn",
  CIA: "Flughafen Rom Ciampino",
  CPH: "Flughafen Kopenhagen Kastrup",
  CTA: "Flughafen Catania-Fontanarossa",
  DUB: "Flughafen Dublin",
  EIN: "Flughafen Eindhoven",
  FAO: "Flughafen Faro",
  FCO: "Flughafen Rom Fiumicino Leonardo da Vinci",
  FRA: "Flughafen Frankfurt am Main",
  GVA: "Flughafen Genf-Cointrin",
  HAM: "Flughafen Hamburg",
  HEL: "Flughafen Helsinki-Vantaa",
  HER: "Flughafen Heraklion Nikos Kazantzakis",
  IBZ: "Flughafen Ibiza",
  INN: "Flughafen Innsbruck Kranebitten",
  KEF: "Flughafen Keflavík International (Reykjavík)",
  KRK: "John-Paul-II-Flughafen Krakau-Balice",
  LIS: "Humberto Delgado Flughafen Lissabon-Portela",
  LHR: "London Heathrow Airport",
  LGW: "London Gatwick Airport",
  LUX: "Findel Flughafen Luxemburg",
  MAD: "Adolfo Suárez Flughafen Madrid-Barajas",
  MLA: "Malta International Airport (Valletta)",
  MUC: "Franz-Josef-Strauß-Flughafen München"
  // Weitere Codes hinzufügen ...
};

export interface Flight {
  price: string;
  direct: boolean;
  departureDate: string;
  origin: string;
  destination: string;
}

@Component({
  selector: 'app-flights',
  imports: [
    HttpClientModule,
    MatButton,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    CurrencyPipe,
  ],
  templateUrl: './flights.component.html',
  styleUrl: './flights.component.css',
  standalone: true,
  providers: [FlightApiService]
})
export class FlightsComponent {
  constructor(private apiService: FlightApiService){}

  click() {
    this.apiService.getAllFlights('DUS', 'BCN').subscribe(
      data => {
        console.log(data);
      },
      error => {
        console.error(error);
      }
    );
  }







  displayedColumns: string[] = ['price', 'direct', 'departureDate', 'origin', 'destination'];
  dataSource = new MatTableDataSource<Flight>();

  @ViewChild(MatSort) sort!: MatSort;

  click2():void{
    this.apiService.getAllFlights('DUS', 'BCN').subscribe(
      (response: any) => {
        const flights = response.data.flightQuotes.results.map((flight: any) => ({
          price: flight.content.rawPrice,
          direct: flight.content.direct,
          departureDate: flight.content.outboundLeg.localDepartureDateLabel,
          origin:
            airportMapping[flight.content.outboundLeg.originAirport.skyCode] ||
            flight.content.outboundLeg.originAirport.skyCode,
          destination:
            airportMapping[flight.content.outboundLeg.destinationAirport.skyCode] ||
            flight.content.outboundLeg.destinationAirport.skyCode,
        }));
        this.dataSource.data = flights;
        this.dataSource.sort = this.sort; // Sortierung aktivieren
      },
      error => console.error(error)
    );

  }

}
