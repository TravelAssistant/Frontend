import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {HttpClient} from '@angular/common/http';
import {map, Observable} from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FlightApiService {
  private apiUrl= environment.flightApi.url;
  private apiKey = environment.flightApi.key;

  private apiUrlFlixbus = environment.flixbusApi.url;
  private apiKeyFlixbus = environment.flixbusApi.key;

  constructor(private http: HttpClient) {
  }

  getAllFlights(from: string, to: string): Observable<any> {
    return this.http.get(`https://${this.apiUrl}/flights/search-one-way?fromEntityId=${from}&toEntityId=${to}&cabinClass=economy`, {
      headers: {
        'x-rapidapi-host': this.apiUrl,
        'x-rapidapi-key': this.apiKey
      }
    });
  }

  getOneFlight(token: string, ItineraryId: string): Observable<any> {
    return this.http.get(`https://${this.apiUrl}/flights/flights/detail?token=${token}&itineraryId=${ItineraryId}`, {
      headers: {
        'x-rapidapi-host': this.apiUrl,
        'x-rapidapi-key': this.apiKey
      }
    })

  }

  // 1. Flughafencodes für Start und Ziel ermitteln
  getAirportCode(query: string): Observable<string> {
    return this.http.get(`https://${this.apiUrl}/flights/auto-complete?query=${encodeURIComponent(query)}`, {
      headers: {
        'x-rapidapi-host': this.apiUrl,
        'x-rapidapi-key': this.apiKey
      }
    }).pipe(
      map((response: any) => {
        // Suche nach dem ersten Ergebnis mit entityType AIRPORT
        const airport = response.data.find((item: {
          navigation: { entityType: string; };
        }) => item.navigation.entityType === 'AIRPORT');
        return airport ? airport.navigation.relevantFlightParams.skyId : '';
      })
    );
  }

  // 2. Flugsuche mit den Flughafencodes und Datum
  searchFlights(fromCode: string, toCode: string, date: string): Observable<any> {
    return this.http.get(`https://${this.apiUrl}/flights/search-one-way?fromEntityId=${fromCode}&toEntityId=${toCode}&departDate=${date}&cabinClass=economy`, {
      headers: {
        'x-rapidapi-host': this.apiUrl,
        'x-rapidapi-key': this.apiKey
      }
    });
  }

  // 3. Detailabfrage für einen spezifischen Flug
  getFlightDetails(token: string, itineraryId: string): Observable<any> {
    return this.http.get(`https://${this.apiUrl}/flights/detail?token=${token}&itineraryId=${itineraryId}`, {
      headers: {
        'x-rapidapi-host': this.apiUrl,
        'x-rapidapi-key': this.apiKey
      }
    });
  }

  searchRoundtripFlights(fromCode: string, toCode: string, departDate: string, returnDate: string): Observable<any> {
    return this.http.get(`https://${this.apiUrl}/flights/search-roundtrip?fromEntityId=${fromCode}&toEntityId=${toCode}&departDate=${departDate}&returnDate=${returnDate}&cabinClass=economy`, {
      headers: {
        'x-rapidapi-host': this.apiUrl,
        'x-rapidapi-key': this.apiKey
      }
    });
  }

// Gibt die erste city.id zurück
  getFlixbusCityId(query: string): Observable<string> {
    return this.http.get(`https://${this.apiUrlFlixbus}/autocomplete?query=${encodeURIComponent(query)}&locale=en`, {
      headers: {
        'x-rapidapi-host': this.apiUrlFlixbus,
        'x-rapidapi-key': this.apiKeyFlixbus
      }
    }).pipe(
      map((response: any) => {
        const first = Array.isArray(response) && response.length > 0 ? response[0] : null;
        return first && first.city && first.city.id ? first.city.id : '';
      })
    );
  }

// Datum ins richtige Format bringen
  private formatDateToDDMMYYYY(date: string): string {
    const [year, month, day] = date.split('-');
    return `${day}.${month}.${year}`;
  }

// Sucht Bus-/Zugverbindungen
  searchBusTrips(fromCityId: string, toCityId: string, date: string): Observable<any> {
    const formattedDate = this.formatDateToDDMMYYYY(date);
    return this.http.get(
      `https://${this.apiUrlFlixbus}/trips?from_id=${fromCityId}&to_id=${toCityId}&date=${formattedDate}&adult=1&search_by=cities&children=0&bikes=0&currency=EUR&locale=de`,
      {
        headers: {
          'x-rapidapi-host': this.apiUrlFlixbus,
          'x-rapidapi-key': this.apiKeyFlixbus
        }
      }
    );
  }


}


