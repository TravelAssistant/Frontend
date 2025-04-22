import { Injectable } from '@angular/core';
import {environment} from '../../../environments/environment';
import {HttpClient} from '@angular/common/http';
import {Observable} from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class FlightApiService {
  private apiUrl= "environment.flightApi.url";
  private apiKey = "environment.flightApi.key";

  constructor(private http: HttpClient) { }

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

}
