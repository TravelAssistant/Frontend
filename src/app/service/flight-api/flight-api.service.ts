import {Injectable} from '@angular/core';
import {environment} from '../../../environments/environment';
import {HttpClient} from '@angular/common/http';
import {map, Observable} from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FlightApiService {
  private apiUrl = environment.flightApi.url;
  private apiKey = environment.flightApi.key;

  private apiUrlFlixbus = environment.flixbusApi.url;
  private apiKeyFlixbus = environment.flixbusApi.key;

  private apiBaseUrl = environment.apiBaseUrl;


  constructor(private http: HttpClient) {
  }

  getAirportCode(query: string): Observable<string> {
    return this.http.post(`${this.apiBaseUrl}/flights`, {
      type: 'airportCode',
      query
    }).pipe(
      map((response: any) => response.airportCode)
    );
  }

  searchFlights(fromCode: string, toCode: string, date: string): Observable<any> {
    return this.http.post(`${this.apiBaseUrl}/flights`, {
      type: 'search',
      fromCode,
      toCode,
      date
    });
  }

  searchRoundtripFlights(fromCode: string, toCode: string, departDate: string, returnDate: string): Observable<any> {
    return this.http.post(`${this.apiBaseUrl}/flights`, {
      type: 'roundtrip',
      fromCode,
      toCode,
      date: departDate,
      returnDate
    });
  }

  getFlightDetails(token: string, itineraryId: string): Observable<any> {
    return this.http.post(`${this.apiBaseUrl}/flights`, {
      type: 'details',
      token,
      itineraryId
    });
  }

  getFlixbusCityId(query: string): Observable<string> {
    return this.http.post(`${this.apiBaseUrl}/flixbus`, {
      type: 'cityId',
      query
    }).pipe(
      map((response: any) => response.cityId)
    );
  }

  searchBusTrips(fromId: string, toId: string, date: string): Observable<any> {
    return this.http.post(`${this.apiBaseUrl}/flixbus`, {
      type: 'search',
      fromId,
      toId,
      date
    });
  }


}


