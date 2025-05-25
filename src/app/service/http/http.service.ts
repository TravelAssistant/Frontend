import {Injectable} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {catchError, Observable, throwError} from 'rxjs';
import {environment} from '../../../environments/environment';
import {map} from 'rxjs/operators';

export interface GeocodingResult {
  lat: number;
  lon: number;
  display_name: string;
  address?: any;
  _score?: number;
  _type?: string;
}

export interface RoutingRequest {
  startLon: number;
  startLat: number;
  endLon: number;
  endLat: number;
  mode: string;
}

export interface SnapToRoadRequest {
  lon: number;
  lat: number;
  radius?: number;
}

export interface MetricsRequest {
  mode: 'driving' | 'train' | 'flight';
  distance: number;
  combinedRoute?: {
    flightDistance: number;
    carDistanceToAirport: number;
    carDistanceFromAirport: number;
  };
}

export interface MetricsResponse {
  distance: number;
  co2Emissions: number;
  cost: number;
}


export interface AirportRequest {
  lat: number;
  lon: number;
  radius?: number;
  type?: number;
}

export interface AirportResponse {
  lat: number;
  lon: number;
  display_name: string;
  icao_code?: string;
  iata_code?: string;
  distance?: number;
}

export interface StationRequest {
  lat: number;
  lon: number;
  radius?: number;
  limit?: number;
}

export interface Station {
  name: string;
  lat: number;
  lon: number;
  distance: number;
  category_ids: number[];
  category_names: string[];
}

@Injectable({
  providedIn: 'root'
})
export class HttpService {
  private apiUrl = environment.travelApiUrl;

  constructor(private http: HttpClient) {
  }

  geocode(query: string): Observable<GeocodingResult> {
    console.log('Geocoding query:', query);
    const params = new HttpParams().set('query', query);

    return this.http.get<GeocodingResult>(`${this.apiUrl}/geocoding`, {params})
      .pipe(
        catchError(error => {
          console.error('Geocoding error:', error);
          return throwError(() => error);
        })
      );
  }

  getRoute(request: RoutingRequest): Observable<any> {
    console.log('Routing request:', request);
    return this.http.post(`${this.apiUrl}/routing`, request)
      .pipe(
        catchError(error => {
          console.error('Routing error:', error);
          return throwError(() => error);
        })
      );
  }

  snapToRoad(request: SnapToRoadRequest): Observable<{ lat: number, lon: number }> {
    console.log('Snap to road request:', request);
    return this.http.post<{ lat: number, lon: number }>(`${this.apiUrl}/snap-to-road`, request)
      .pipe(
        catchError(error => {
          console.error('Snap to road error:', error);
          return throwError(() => error);
        })
      );
  }

  findNearestAirport(lat: number, lon: number, radius?: number): Observable<AirportResponse> {
    console.log('Finding nearest airport for coordinates:', lat, lon);

    const request: AirportRequest = {
      lat: lat,
      lon: lon,
      radius: radius || 200000 // Standard: 200km
    };

    return this.http.post<AirportResponse>(`${this.apiUrl}/airports`, request)
      .pipe(
        catchError(error => {
          console.error('Airport search error:', error);
          return throwError(() => error);
        })
      );
  }

  calculateMetrics(request: MetricsRequest): Observable<MetricsResponse> {
    console.log('Metrics calculation request:', request);
    return this.http.post<MetricsResponse>(`${this.apiUrl}/metrics`, request)
      .pipe(
        catchError(error => {
          console.error('Metrics calculation error:', error);
          return throwError(() => error);
        })
      );
  }

  findNearestStation(lat: number, lon: number, radius: number = 20000): Observable<Station> {
    console.log('Finding nearest station for coordinates:', lat, lon);

    const request: StationRequest = {
      lat: lat,
      lon: lon,
      radius: radius,
      limit: 1
    };

    return this.http.post<{stations: Station[]}>(`${this.apiUrl}/nearest-station`, request)
      .pipe(
        map(response => {
          if (response && response.stations && response.stations.length > 0) {
            return response.stations[0];
          }
          throw new Error('Keine Station gefunden');
        }),
        catchError(error => {
          console.error('Station search error:', error);
          return throwError(() => error);
        })
      );
  }
}
